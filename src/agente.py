import asyncio
import csv
import json
import os
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path

import anthropic
from dotenv import load_dotenv
from fastmcp import Client
from fastmcp.client.transports import PythonStdioTransport

import calculo
import registro
from calculo import SEVERIDADES

MODELO = "claude-haiku-5-5"
# USD por millón de tokens, Haiku 5.5 con prompts de menos de 100K. Leer del caché cuesta 0,1 del precio de entrada
# y escribirlo 1,25 (caché de 5 minutos).
PRECIO_POR_MILLON = {"input_tokens": 0.10, "output_tokens": 0.50,
                     "cache_creation_input_tokens": 0.125, "cache_read_input_tokens": 0.01}
SERVIDOR = Path(__file__).resolve().parent / "servidor_mcp.py"
uso = defaultdict(Counter)  # por agente: cuántas veces se armó y los tokens que gastó
EVENTOS = os.environ.get("EVENTOS")  # si está, cada paso se anota ahí (un JSON por línea) para el front de la demo


def evento(tipo, **datos):
    """Anota un paso de la corrida para el front. Sin la variable EVENTOS no hace nada."""
    if EVENTOS:
        with open(EVENTOS, "a", encoding="utf-8") as f:
            f.write(json.dumps({"tipo": tipo, "t": round(time.time(), 2), **datos}, ensure_ascii=False) + "\n")

# Tres agentes y un solo registro. Los tres son Haiku: los distingue el prompt, las tools y el primer mensaje.
# - coordinador: uno por foto. Procesa la foto, decide qué pedir y es el ÚNICO que escribe en el cuaderno.
# - lector: lee bitácoras y propone la causa. No puede escribir.
# - redactor: escribe alertas e informes con los datos que le arma el código. No tiene tools.
# Lo que puede usar cada uno lo impone el código (Agentes.ejecutar), no el prompt.
PERMISOS = {
    "coordinador": ["procesar_snapshot", "registrar_causa", "subir_severidad", "levantar_subida",
                    "registrar_alerta", "registrar_informe", "pedir_causa", "pedir_texto"],
    "lector": ["leer_bitacora"],
    "redactor": [],
}

# Las dos tools que no están en el servidor MCP: en vez de leer o anotar algo, arman otro agente.
# Viven acá porque llaman a Haiku, y así su costo se cuenta junto con el resto.
PEDIR_CAUSA = {
    "name": "pedir_causa",
    "description": (
        "Le pide a un lector de bitácoras qué dicen sobre un caso. Usala para cada caso de 'buscar_causa' "
        "(con sus bitácoras) y para cada causa de 'revisar_subidas' (con la bitácora nueva). "
        "Devuelve un JSON con la causa propuesta (categoria, etapa, bitacora, fragmento) y el estado de la causa "
        "según la bitácora: 'sin_fecha' (sigue sin fecha de resolución), 'con_fecha', 'resuelta' o 'no_dice', "
        "con la frase que lo dice en 'fragmento_estado'. Es una propuesta: no anota nada en el cuaderno."),
    "input_schema": {
        "type": "object",
        "properties": {
            "caso_id": {"type": "string", "description": "El caso, por ejemplo 'C009'."},
            "bitacoras": {"type": "array", "items": {"type": "string"},
                          "description": "Las bitácoras a leer, por ejemplo ['T17', 'T16']."},
        },
        "required": ["caso_id", "bitacoras"],
    },
}

PEDIR_TEXTO = {
    "name": "pedir_texto",
    "description": (
        "Le pide a un redactor el texto de un aviso, listo para registrar. El código le pasa los datos del cuaderno "
        "y las cuentas de la foto: no hace falta que le pases nada más. "
        "tipo 'alerta' (con caso_id): la alerta de un caso que escaló. "
        "tipo 'informe' (sin caso_id): el informe del cierre de turno; pedilo después de registrar causas y subidas."),
    "input_schema": {
        "type": "object",
        "properties": {
            "tipo": {"type": "string", "enum": ["alerta", "informe"]},
            "caso_id": {"type": "string", "description": "Solo para una alerta, por ejemplo 'C009'."},
        },
        "required": ["tipo"],
    },
}



# La respuesta del lector, con salida estructurada (Semana 5): la API garantiza un JSON con esta forma.
CATEGORIAS = ["parada_de_linea", "faltante_de_piezas", "retrabajo", "retencion_de_calidad", "ausentismo", "no_declarada"]
TEXTO_O_NULO = {"anyOf": [{"type": "string"}, {"type": "null"}]}
ESQUEMA_LECTOR = {
    "type": "object",
    "properties": {
        "categoria": {"type": "string", "enum": CATEGORIAS},
        "etapa": {"anyOf": [{"type": "string", "enum": ["carroceria", "pintura", "montaje", "calidad"]}, {"type": "null"}]},
        "bitacora": TEXTO_O_NULO,
        "fragmento": TEXTO_O_NULO,
        "estado": {"type": "string", "enum": ["sin_fecha", "con_fecha", "resuelta", "no_dice"]},
        "fragmento_estado": TEXTO_O_NULO,
    },
    "required": ["categoria", "etapa", "bitacora", "fragmento", "estado", "fragmento_estado"],
    "additionalProperties": False,
}


async def leer_criterios(mcp):
    """El criterio de cada agente, pedido al servidor MCP como prompt (Semana 4)."""
    return {a: (await mcp.get_prompt(f"criterio_{a}")).messages[0].content.text for a in PERMISOS}


# --- Los mensajes que arma el código para el lector y el redactor: solo lo que necesitan ---

def describir_foto(foto):
    return f"Foto {foto} ({calculo.leer_snapshot(foto)['timestamp']}), turno {calculo.turno_de(foto, calculo.leer_turnos())}"


def numeros_de(foto):
    """Las cuentas de una foto para las 9 combinaciones, por (modelo, mercado)."""
    return {(c["modelo"], c["mercado"]): c for c in calculo.evaluar(foto)}


def describir_numeros(n):
    return (f"autos faltantes contra el plan: {n['autos_faltantes']:g} ({n['autos_faltantes_pct']} %), "
            f"severidad {n['severidad_por_faltantes']}; autos que pierden el embarque: {n['autos_que_pierden_embarque']:g}, "
            f"días de retraso: {n['dias_de_retraso']:g}, severidad {n['severidad_por_embarque']}; "
            f"etapa donde se traban: {n['etapa_donde_se_traban'] or 'ninguna'}")


def describir_causa(cuaderno, caso):
    causa = caso.get("causa")
    if causa is None:
        return "todavía sin causa registrada"
    if causa["categoria"] == "no_declarada":
        donde = (f"los datos muestran los autos trabados en {causa['etapa']}" if causa.get("etapa")
                 else "los datos no muestran en qué etapa se traban")
        return f"no declarada en las bitácoras ({donde})"
    texto = f"{causa['categoria']} en {causa['etapa']}, bitácora {causa.get('bitacora')}: \"{causa.get('fragmento')}\""
    subida = registro.subida_vigente(cuaderno, caso)
    if subida:
        texto += (f". Severidad subida porque la causa sigue sin fecha de resolución, "
                  f"bitácora {subida['bitacora']}: \"{subida['fragmento']}\"")
    return texto


def mensaje_lector(cuaderno, caso, bitacoras):
    causa = caso.get("causa")
    if causa and causa["categoria"] != "no_declarada":  # revisar una subida: solo importa el estado de esta causa
        tarea = ("Este caso ya tiene causa: no busques otra. Decí solo el estado de esa causa en estas bitácoras, "
                 "y en categoria, etapa, bitacora y fragmento repetí la registrada.")
    else:
        tarea = "Buscá la causa de este caso."
    return (f"Caso {caso['caso_id']}: {caso['modelo']} para {caso['mercado']}.\n"
            f"Según los datos, los autos se traban en: {caso.get('etapa_cuello') or 'ninguna etapa'}.\n"
            f"Causa registrada: {describir_causa(cuaderno, caso)}.\n"
            f"{tarea}\nLeé estas bitácoras: {', '.join(bitacoras)}.")


def mensaje_alerta(cuaderno, caso):
    foto = cuaderno["snapshots_procesados"][-1]
    numeros = numeros_de(foto)[(caso["modelo"], caso["mercado"])]
    por = ("la bitácora: la causa sigue sin fecha de resolución (subida de severidad)"
           if caso.get("escalado_por") == "agente" else "los números: llegaron a crítica")
    return "\n".join([
        "Escribí la alerta de este caso.",
        f"{describir_foto(foto)}.",
        f"Caso: {caso['caso_id']} · {caso['modelo']}/{caso['mercado']} · severidad {caso['severidad_actual']}.",
        f"Escaló por {por}.",
        f"Números de esta foto: {describir_numeros(numeros)}.",
        f"Causa: {describir_causa(cuaderno, caso)}.",
    ])


def mensaje_informe(cuaderno):
    """Las novedades y los casos activos del cierre, cada uno con sus números y su causa.
    Se arma recién cuando se pide el informe: así incluye lo que escaló en esta misma foto por una subida."""
    foto = cuaderno["snapshots_procesados"][-1]
    novedades, activos = registro.cerrar_turno(cuaderno, confirmar=False)  # solo mira: se confirma en registrar_informe
    numeros = numeros_de(foto)

    def linea(c):
        caso = registro.buscar_caso(cuaderno, c["caso_id"])
        texto = (f"- {c['caso_id']} · {c['modelo']}/{c['mercado']}: {c['estado']}, severidad actual "
                 f"{c['severidad_actual']}, máxima del turno {c['severidad_maxima']}.\n"
                 f"  Números: {describir_numeros(numeros[(c['modelo'], c['mercado'])])}.\n"
                 f"  Causa: {describir_causa(cuaderno, caso)}.")
        fotos = registro.falta_confirmar(cuaderno, caso)
        if fotos:
            texto += (f"\n  A confirmar: los números no muestran atraso hace {fotos} fotos, pero ninguna bitácora dijo que la "
                      "causa se resolvió, así que la severidad sigue subida. Pedí confirmarlo con el supervisor.")
        return texto

    def antes(n):
        a = n["en_el_informe_anterior"]
        if a is None:
            return "caso nuevo, no estaba en el informe anterior"
        return f"en el informe anterior estaba {a['estado']}, con severidad {a['severidad']}"

    partes = [f"Escribí el informe de cierre de turno. {describir_foto(foto)}.", "", "Novedades del turno (solo estas):"]
    partes += [f"{linea(n)}\n  Antes: {antes(n)}." for n in novedades] or ["- Ninguna: el turno no tuvo novedades."]
    partes += ["", "Casos activos:"]
    partes += [linea(c) for c in activos] or ["- Ninguno."]
    return "\n".join(partes)


# --- Hooks (Semana 4): funciones del loop que corren antes de cada tool, después de cada tool y al terminar la foto ---
# Un hook "antes" o "al terminar" devuelve el motivo para frenar, que el modelo recibe como error, o None.

def hook_permisos(agente, pedido, cuaderno):
    """Lo que un agente no puede hacer lo impide el código, con la lista de tools de cada uno."""
    if pedido.name not in PERMISOS[agente]:
        return f"El {agente} no puede usar {pedido.name}."


def hook_alerta(agente, pedido, cuaderno):
    """Frena una alerta repetida, fuera de la foto en que el caso escaló, o con una severidad menor que la del código."""
    if pedido.name != "registrar_alerta" or not cuaderno["snapshots_procesados"]:
        return None
    foto = cuaderno["snapshots_procesados"][-1]
    caso = registro.buscar_caso(cuaderno, pedido.input.get("caso_id", ""))
    if caso is None:
        return None  # el servidor contesta que el caso no existe
    if pedido.input.get("snapshot_id") != foto:
        return f"La alerta va en la foto que llegó ({foto}), no en {pedido.input.get('snapshot_id')}."
    previa = next((a for a in cuaderno["alertas"] if a["caso_id"] == caso["caso_id"]), None)
    if previa:
        return f"Aviso repetido: {caso['caso_id']} ya tuvo su alerta en {previa['snapshot_id']}. Es una alerta por caso."
    if caso.get("alerta_enviada_en") != foto:
        return f"{caso['caso_id']} no escaló en {foto}: la alerta va en la foto en que el caso escala."
    minima = numeros_de(foto)[(caso["modelo"], caso["mercado"])]["severidad_final"]
    if caso["severidad_actual"] != "critica" or SEVERIDADES.index(caso["severidad_actual"]) < SEVERIDADES.index(minima):
        return (f"La severidad de {caso['caso_id']} es {caso['severidad_actual']} (el código calcula {minima}): "
                "la alerta es solo para un caso crítico.")


def hook_informe(agente, pedido, cuaderno):
    """Frena un informe repetido o al que le falte una novedad o un caso activo."""
    if pedido.name != "registrar_informe" or not cuaderno["snapshots_procesados"]:
        return None
    foto = cuaderno["snapshots_procesados"][-1]
    if pedido.input.get("snapshot_id") != foto:
        return f"El informe va en la foto que llegó ({foto}), no en {pedido.input.get('snapshot_id')}."
    if any(i["snapshot_id"] == foto for i in cuaderno["informes"]):
        return f"El informe de {foto} ya está registrado."
    novedades, activos = registro.cerrar_turno(cuaderno, confirmar=False)
    texto = pedido.input.get("texto", "")
    faltan = [c for c in dict.fromkeys(n["caso_id"] for n in novedades + activos) if c not in texto]
    if faltan:
        return (f"Al informe le faltan {', '.join(faltan)}: tiene que nombrar todas las novedades y todos los casos "
                "activos. Pedile el texto otra vez al redactor.")


HOOKS_ANTES = [hook_permisos, hook_alerta, hook_informe]


def hook_despues(agente, pedido, texto, es_error, foto):
    """Después de cada tool: anota qué se usó en la foto y si la foto llegó repetida (lo usan los hooks de al terminar)."""
    foto["tools"].append({"agente": agente, "tool": pedido.name, "error": es_error})
    if pedido.name == "procesar_snapshot" and not es_error:
        foto["repetida"] = json.loads(texto)["ya_procesada"]


def hook_falta_procesar(cuaderno, foto):
    if foto["id"] not in cuaderno["snapshots_procesados"]:
        return f"No procesaste la foto {foto['id']}: llamá a procesar_snapshot."


def hook_faltan_alertas(cuaderno, foto):
    if foto["repetida"]:
        return None
    con_alerta = {a["caso_id"] for a in cuaderno["alertas"]}
    faltan = [c["caso_id"] for c in cuaderno["casos"]
              if c.get("alerta_enviada_en") == foto["id"] and c["caso_id"] not in con_alerta]
    if faltan:
        return f"Escalaron en {foto['id']} y no tienen alerta: {', '.join(faltan)}. Pedí el texto y registralo."


def hook_falta_informe(cuaderno, foto):
    if foto["repetida"] or not any(t["snapshot_cierre"] == foto["id"] for t in calculo.leer_turnos()):
        return None
    if not any(i["snapshot_id"] == foto["id"] for i in cuaderno["informes"]):
        return f"{foto['id']} cierra el turno y falta el informe: pedilo con pedir_texto y registralo con registrar_informe."


HOOKS_AL_TERMINAR = [hook_falta_procesar, hook_faltan_alertas, hook_falta_informe]


# --- Los agentes ---

class Agentes:
    """Arma los tres agentes. Comparten el cliente de la API, la conexión al servidor MCP y las tools."""

    def __init__(self, claude, mcp, tools_del_servidor, criterios):
        self.claude, self.mcp = claude, mcp
        self.criterios = criterios  # el prompt de cada agente, que publica el servidor MCP
        self.foto = {"id": None, "repetida": False, "tools": []}  # la foto en curso, para los hooks
        todas = {t.name: {"name": t.name, "description": t.description, "input_schema": t.input_schema}
                 for t in tools_del_servidor}
        todas.update({t["name"]: t for t in (PEDIR_CAUSA, PEDIR_TEXTO)})
        # cada agente ve solo sus tools: las del servidor y las de este archivo, mezcladas en una lista
        self.tools = {agente: [todas[n] for n in nombres] for agente, nombres in PERMISOS.items()}

    async def conversar(self, agente, mensaje):
        """Una conversación nueva con Haiku como ese agente: el loop de tools hasta que termina.
        Devuelve su texto final. Lo que hay que recordar está en el cuaderno, no en el modelo."""
        uso[agente]["veces"] += 1
        # caché (Semana 5): la marca en el sistema cachea las tools y el prompt, que son iguales en todas las vueltas;
        # la del pedido (cache_control arriba) cachea además la conversación, que crece en cada vuelta
        pedido = {"model": MODELO, "max_tokens": 16000, "cache_control": {"type": "ephemeral"},
                  "system": [{"type": "text", "text": self.criterios[agente], "cache_control": {"type": "ephemeral"}}]}
        if self.tools[agente]:
            pedido["tools"] = self.tools[agente]
        if agente == "lector":  # salida estructurada: la respuesta es un JSON con la forma de ESQUEMA_LECTOR
            pedido["output_config"] = {"format": {"type": "json_schema", "schema": ESQUEMA_LECTOR}}
        messages = [{"role": "user", "content": mensaje}]
        reintentos = 0
        while True:
            response = await self.claude.messages.create(**pedido, messages=messages)
            messages.append({"role": "assistant", "content": response.content})
            uso[agente].update({k: getattr(response.usage, k, 0) or 0 for k in PRECIO_POR_MILLON})
            if response.stop_reason != "tool_use":
                if response.stop_reason != "end_turn":
                    print(f"  ({agente} cortó por {response.stop_reason})")
                # hooks al terminar: si al coordinador le falta algo de la foto, no lo deja terminar y le dice qué
                motivo = self.al_terminar() if agente == "coordinador" and reintentos < 2 else None
                if motivo:
                    reintentos += 1
                    messages.append({"role": "user", "content": f"Antes de terminar: {motivo}"})
                    continue
                return "".join(b.text for b in response.content if b.type == "text")
            resultados = []
            for b in response.content:
                if b.type == "tool_use":
                    texto, es_error = await self.ejecutar(agente, b)
                    resultados.append({"type": "tool_result", "tool_use_id": b.id,
                                       "content": texto, "is_error": es_error})
            messages.append({"role": "user", "content": resultados})

    def nueva_foto(self, snapshot_id):
        self.foto = {"id": snapshot_id, "repetida": False, "tools": []}

    def al_terminar(self):
        """Los hooks de al terminar: el primer motivo para no dejar terminar al coordinador, o None."""
        cuaderno = registro.cargar()
        for hook in HOOKS_AL_TERMINAR:
            motivo = hook(cuaderno, self.foto)
            if motivo:
                print(f"  hook {hook.__name__}: {motivo}")
                evento("hook", momento="al_terminar", hook=hook.__name__, motivo=motivo)
                return motivo
        return None

    async def ejecutar(self, agente, pedido):
        """Corre una tool que pidió un agente y devuelve (texto, es_error).
        Primero los hooks de antes; después, a dónde va: otro agente o el servidor MCP; al final, el hook de después."""
        cuaderno = registro.cargar()
        frenado = None
        for hook in HOOKS_ANTES:
            motivo = hook(agente, pedido, cuaderno)
            if motivo:
                frenado, texto, es_error = hook.__name__, motivo, True
                break
        else:
            if pedido.name == "pedir_causa":
                texto, es_error = await self.lector(pedido.input)
            elif pedido.name == "pedir_texto":
                texto, es_error = await self.redactor(pedido.input)
            else:
                r = await self.mcp.call_tool(pedido.name, pedido.input, raise_on_error=False)
                texto, es_error = r.content[0].text, r.is_error
        hook_despues(agente, pedido, texto, es_error, self.foto)
        mostrar(agente, pedido, texto, es_error, frenado)
        return texto, es_error

    async def lector(self, pedido):
        cuaderno = registro.cargar()
        caso = registro.buscar_caso(cuaderno, pedido.get("caso_id", ""))
        bitacoras = pedido.get("bitacoras") or []
        if isinstance(bitacoras, str):
            bitacoras = [bitacoras]
        if caso is None or caso["estado"] == "resuelto":
            return f"El caso '{pedido.get('caso_id')}' no existe o ya está resuelto. Usá un caso activo.", True
        if not bitacoras:
            return "Faltan las bitácoras a leer.", True
        print(f"  coordinador pide al lector la causa de {caso['caso_id']} en {', '.join(bitacoras)}")
        evento("pide", a="lector", caso_id=caso["caso_id"], bitacoras=bitacoras)
        return await self.conversar("lector", mensaje_lector(cuaderno, caso, bitacoras)), False

    async def redactor(self, pedido):
        cuaderno = registro.cargar()
        if not cuaderno["snapshots_procesados"]:
            return "Todavía no se procesó ninguna foto.", True
        foto = cuaderno["snapshots_procesados"][-1]
        if pedido.get("tipo") == "alerta":
            caso = registro.buscar_caso(cuaderno, pedido.get("caso_id", ""))
            if caso is None or caso["estado"] != "escalado" or caso.get("alerta_enviada_en") != foto:
                return (f"El caso '{pedido.get('caso_id')}' no escaló en esta foto: la alerta es para un caso que escala "
                        "ahora. Uno que ya estaba escalado no lleva otra.", True)
            if any(a["caso_id"] == caso["caso_id"] and a["snapshot_id"] == foto for a in cuaderno["alertas"]):
                return f"La alerta de {caso['caso_id']} ya está registrada en esta foto.", True
            print(f"  coordinador pide al redactor la alerta de {caso['caso_id']}")
            evento("pide", a="redactor", que="alerta", caso_id=caso["caso_id"])
            mensaje = mensaje_alerta(cuaderno, caso)
        elif pedido.get("tipo") == "informe":
            if not any(t["snapshot_cierre"] == foto for t in calculo.leer_turnos()):
                return f"{foto} no es la última foto de su turno: el informe va solo en el cierre.", True
            print("  coordinador pide al redactor el informe del turno")
            evento("pide", a="redactor", que="informe")
            mensaje = mensaje_informe(cuaderno)
        else:
            return "tipo tiene que ser 'alerta' o 'informe'.", True
        return await self.conversar("redactor", mensaje), False


# --- Lo que se ve en pantalla ---

def resumir_propuesta(texto):
    """La respuesta del lector en una línea (es un JSON; si no lo es, el texto tal cual)."""
    try:
        p = json.loads(texto[texto.index("{"): texto.rindex("}") + 1])
    except ValueError:
        return texto.strip()[:300]
    cita = f", {p.get('bitacora')}: \"{p.get('fragmento')}\"" if p.get("fragmento") else ""
    estado = f" · estado {p.get('estado')}" + (f": \"{p['fragmento_estado']}\"" if p.get("fragmento_estado") else "")
    return f"{p.get('categoria')} ({p.get('etapa') or 'sin etapa'}){cita}{estado}"


def mostrar_foto(d):
    if d["ya_procesada"]:
        print("  foto repetida: ya se había procesado, el cuaderno no cambia")
        return
    problemas = [f"{p['modelo']}/{p['mercado']} {p['severidad_final']}" for p in d["problemas"]]
    cambios = [f"{c['caso_id']} {c['cambio']}" + (f" ({c['origen']})" if "origen" in c else "") for c in d["cambios"]]
    print(f"  {d['hora']} turno {d['turno']}{' (CIERRE)' if d['ultima_foto_del_turno'] else ''}")
    print(f"  problemas: {', '.join(problemas) or 'ninguno'}")
    print(f"  cambios en el cuaderno: {', '.join(cambios) or 'ninguno'}")
    if "novedades" in d:
        novedades = [f"{n['caso_id']} {n['estado']} (máx. {n['severidad_maxima']})" for n in d["novedades"]]
        print(f"  novedades del turno: {', '.join(novedades) or 'ninguna'}")
    if d["buscar_causa"]:
        pedidos = [f"{b['caso_id']} en {', '.join(b['bitacoras']) or 'ninguna escrita todavía'}" for b in d["buscar_causa"]]
        print(f"  buscar causa: {'; '.join(pedidos)}")
    if d.get("revisar_subidas"):
        revisar = [f"{s['caso_id']}{' (subida vigente)' if s['subida_vigente'] else ''}" for s in d["revisar_subidas"]]
        print(f"  revisar en {d['revisar_subidas'][0]['bitacora']}: {', '.join(revisar)}")


def mostrar(agente, pedido, texto, es_error, frenado=None):
    """Imprime qué pidió cada agente y qué pasó, para seguir la corrida foto por foto."""
    nombre, datos = pedido.name, pedido.input
    evento("tool", agente=agente, nombre=nombre, datos=datos, texto=texto, error=es_error, hook=frenado)
    if frenado:
        print(f"  hook {frenado} frena {nombre} del {agente}: {texto}")
    elif es_error:
        print(f"  {agente} → {nombre} -> ERROR: {texto}")
    elif nombre == "procesar_snapshot":
        mostrar_foto(json.loads(texto))
    elif nombre == "leer_bitacora":
        print(f"      lector lee la bitácora {datos['turno_id']}")
    elif nombre == "pedir_causa":
        print(f"    lector propone: {resumir_propuesta(texto)}")
    elif nombre == "pedir_texto":
        print(f"    redactor escribe {'la alerta' if datos.get('tipo') == 'alerta' else 'el informe'}")
    elif nombre == "registrar_causa":
        cita = f", {datos['bitacora']}: \"{datos['fragmento']}\"" if datos.get("fragmento") else ""
        print(f"  coordinador registra la causa de {datos['caso_id']}: {datos['categoria']} "
              f"({datos.get('etapa') or 'sin etapa'}){cita}")
        if "Escalan" in texto:
            print(f"    {texto.split('. ', 1)[1]}")
    elif nombre in ("subir_severidad", "levantar_subida"):
        accion = "SUBE la severidad" if nombre == "subir_severidad" else "levanta la subida"
        print(f"  coordinador {accion} de {datos['caso_id']}, {datos['bitacora']}: \"{datos['fragmento']}\"")
        print(f"    {texto}")
    else:  # registrar_alerta, registrar_informe: lo que quedó registrado
        que = f"la alerta de {datos['caso_id']}" if nombre == "registrar_alerta" else "el informe"
        print(f"  coordinador registra {que}:")
        print("    " + datos["texto"].replace("\n", "\n    "))


# --- La serie ---

ULTIMA_FOTO = 60  # los 10 días; S043–S060 (días 8 a 10) quedaron apartados hasta tener el agente terminado


def llegadas(hasta):
    """Las fotos en el orden en que llegan según llegadas.csv, hasta la foto 'hasta'. S034 llega dos veces."""
    with open(calculo.DATA / "snapshots" / "llegadas.csv", encoding="utf-8-sig") as f:
        return [fila["snapshot_id"] for fila in csv.DictReader(f) if int(fila["snapshot_id"][1:]) <= hasta]


def costo(u):
    return sum(u[k] * precio / 1_000_000 for k, precio in PRECIO_POR_MILLON.items())


def costos():
    """Lo gastado hasta ahora, por agente y en total. input_tokens es lo que no salió del caché."""
    total = sum(uso.values(), Counter())
    tokens = lambda u: {k: u[k] for k in PRECIO_POR_MILLON}
    return {"agentes": {a: {"veces": uso[a]["veces"], **tokens(uso[a]), "usd": round(costo(uso[a]), 4)} for a in PERMISOS},
            **tokens(total), "usd": round(costo(total), 4)}


async def correr(hasta=ULTIMA_FOTO):
    if not 1 <= hasta <= ULTIMA_FOTO:
        raise SystemExit(f"La última foto tiene que estar entre S001 y S{ULTIMA_FOTO:03}.")
    registro.RUTA.unlink(missing_ok=True)  # cuaderno vacío al empezar la serie
    inicio = time.time()
    fotos = llegadas(hasta)
    evento("inicio", hasta=f"S{hasta:03}", total=len(fotos))
    # el servidor corre en otro proceso y FastMCP no le pasa las variables de entorno: el cuaderno se lo decimos acá,
    # así el agente y el servidor usan siempre el mismo (el de la demo en vivo no es el de la serie completa)
    servidor = PythonStdioTransport(SERVIDOR, env={"REGISTRO": str(registro.RUTA)})
    async with Client(servidor) as mcp:
        agentes = Agentes(anthropic.AsyncAnthropic(), mcp, await mcp.list_tools(), await leer_criterios(mcp))
        for orden, snapshot_id in enumerate(fotos, start=1):
            print(f"{snapshot_id} (llegada {orden})")
            evento("llegada", snapshot_id=snapshot_id, orden=orden, total=len(fotos))
            agentes.nueva_foto(snapshot_id)
            await agentes.conversar("coordinador", f"Llegó la foto {snapshot_id}.")
            evento("costo", **costos())
    minutos = (time.time() - inicio) / 60
    # el resumen de la corrida queda al lado del cuaderno: lo muestra el front de la demo
    resumen = {"hasta": f"S{hasta:03}", "minutos": round(minutos, 1), "fecha": time.strftime("%d/%m/%Y %H:%M"), **costos()}
    registro.RUTA.with_name("resumen.json").write_text(json.dumps(resumen, ensure_ascii=False, indent=2), encoding="utf-8")
    evento("fin", **resumen)

    cuaderno = registro.cargar()
    print("\nCasos:")
    for c in cuaderno["casos"]:
        print(f"  {c['caso_id']} {c['modelo']}/{c['mercado']}: {c['estado']} (abierto en {c['abierto_en']})")
    print("\nSeveridad subida por bitácora:")
    for s in cuaderno.get("subidas", []):
        fin = f"hasta {s['levantada_en']} ({s['bitacora_fin']})" if s["levantada_en"] else "sigue vigente"
        print(f"  {s['modelo']} {s['categoria']} ({s['etapa']}): desde {s['subida_en']} ({s['bitacora']}), {fin}")
    print("\nAlertas:")
    for a in cuaderno["alertas"]:
        print(f"  [{a['snapshot_id']}] {a['caso_id']}: {a['texto']}")
    print("\nInformes:")
    for inf in cuaderno["informes"]:
        print(f"  [{inf['snapshot_id']} {inf['turno']}] {inf['texto']}\n")

    print("Costo por agente:")
    for agente in PERMISOS:
        u = uso[agente]
        print(f"  {agente}: se armó {u['veces']} veces · {u['input_tokens']:,} tokens de entrada, "
              f"{u['cache_read_input_tokens']:,} leídos del caché, {u['cache_creation_input_tokens']:,} escritos en el caché, "
              f"{u['output_tokens']:,} de salida · USD {costo(u):.4f}")
    total = sum(uso.values(), Counter())
    print(f"Tiempo: {minutos:.1f} min · Tokens: {total['input_tokens']:,} de entrada, "
          f"{total['cache_read_input_tokens']:,} leídos del caché, {total['cache_creation_input_tokens']:,} escritos en el caché, "
          f"{total['output_tokens']:,} de salida · Costo: USD {costo(total):.4f}")


if __name__ == "__main__":
    load_dotenv()
    # python src/agente.py S042 → corre S001 a S042; sin nada → las 61 llegadas, hasta S060
    asyncio.run(correr(int(sys.argv[1].lstrip("Ss")) if len(sys.argv) > 1 else ULTIMA_FOTO))
