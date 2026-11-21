import asyncio
import csv
import sys
import time
from collections import Counter
from pathlib import Path

import anthropic
from dotenv import load_dotenv
from fastmcp import Client

import calculo
import registro

MODELO = "claude-haiku-5-5"
PRECIO_POR_MILLON = {"input_tokens": 0.10, "output_tokens": 0.50}  # USD, Haiku 5.5 con prompts de menos de 100K tokens
SERVIDOR = Path(__file__).resolve().parent / "servidor_mcp.py"
uso = Counter()  # tokens gastados en la corrida

SISTEMA = """Sos el monitor de la planta Las Acacias. Cada 4 horas llega una foto (snapshot) y la procesás.

Por cada foto:
1. Llamá a procesar_snapshot con el nombre de la foto. Si 'ya_procesada' es true, la foto llegó repetida:
   no avises nada.
2. Si 'buscar_causa' trae casos, buscales la causa antes de avisar nada. Para cada caso, leé con
   leer_bitacora las bitácoras que indica y registrá la causa con registrar_causa:
   - La causa tiene que hablar de ese caso: su modelo, su mercado o la etapa donde se traban los autos.
     Una bitácora cuenta muchas cosas (seguridad, personal, otros modelos); lo que no es de este caso no sirve.
   - El fragmento es la frase que nombra la causa, copiada tal cual de la bitácora.
   - Si ninguna de esas bitácoras dice por qué, registrá 'no_declarada', con la etapa donde se traban
     los autos según los datos ('etapa_donde_se_traban'); si los datos no muestran ninguna, sin etapa.
     No completes con una suposición.
   - Si la bitácora de donde sacaste la causa dice que la causa sigue activa y no tiene fecha de resolución
     (una línea parada sin fecha de vuelta, un proveedor sin fecha de entrega), subí la severidad con
     subir_severidad, citando la frase que lo dice. Si da una fecha concreta o dice que se resolvió, no la subas.
3. Si 'revisar_subidas' trae casos, leé una vez la bitácora que indica y, para cada caso:
   - si 'subida_vigente' es true y la bitácora dice que la causa se resolvió, terminala con levantar_subida;
   - si 'subida_vigente' es false y la bitácora dice que la causa sigue sin fecha de resolución, usá subir_severidad.
   Si no dice nada de eso, no hagas nada.
4. Por cada caso que escaló, registrá una alerta con registrar_alerta: los 'escalado' de 'cambios', y los
   que te informen registrar_causa o subir_severidad. Decí por qué escaló: si el origen es 'umbral', por los
   números; si es por la subida, por lo que dice la bitácora, con la frase citada.
5. Si 'ultima_foto_del_turno' es true, registrá el informe del turno con registrar_informe. El informe tiene
   dos partes: las novedades (solo lo que viene en 'novedades'; si viene vacía, decí que no hubo novedades)
   y la tabla de 'casos_activos'. De cada caso informá la severidad actual y la máxima del turno.
6. Si no pasa nada de eso, no avises nada.

En alertas e informes, poné la causa de cada caso con la bitácora y la frase citada, o decí que la causa
no está declarada en las bitácoras.
Usá solo los números que te devuelve procesar_snapshot y las causas que registraste; no inventes nada."""


def mostrar(pedido, r):
    """Imprime qué pidió Haiku y qué pasó, para seguir la corrida foto por foto."""
    if r.is_error:
        print(f"  {pedido.name} -> ERROR: {r.content[0].text}")
    elif pedido.name == "procesar_snapshot":
        d = r.data
        if d["ya_procesada"]:
            print("  foto repetida: ya se había procesado, el cuaderno no cambia")
            return
        problemas =[f"{p['modelo']}/{p['mercado']} {p['severidad_final']}" for p in d["problemas"]]
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
    elif pedido.name == "leer_bitacora":
        print(f"  Haiku lee la bitácora {pedido.input['turno_id']}")
    elif pedido.name == "registrar_causa":
        c = pedido.input
        cita = f", {c['bitacora']}: \"{c['fragmento']}\"" if c.get("fragmento") else ""
        print(f"  Haiku -> causa de {c['caso_id']}: {c['categoria']} ({c.get('etapa') or 'sin etapa'}){cita}")
        if "Escalan" in r.content[0].text:
            print(f"    {r.content[0].text.split('. ', 1)[1]}")
    elif pedido.name in ("subir_severidad", "levantar_subida"):
        c = pedido.input
        accion = "SUBE la severidad" if pedido.name == "subir_severidad" else "levanta la subida"
        print(f"  Haiku -> {accion} de {c['caso_id']}, {c['bitacora']}: \"{c['fragmento']}\"")
        print(f"    {r.content[0].text}")
    else:
        print(f"  Haiku -> {pedido.name}({pedido.input.get('caso_id', '')}):")
        print("    " + pedido.input["texto"].replace("\n", "\n    "))


async def procesar_foto(claude, mcp, tools, snapshot_id):
    """Una conversación nueva por foto: lo que hay que recordar está en el cuaderno, no en el modelo."""
    messages = [{"role": "user", "content": f"Llegó la foto {snapshot_id}."}]
    while True:
        response = await claude.messages.create(
            model=MODELO, max_tokens=16000, system=SISTEMA, tools=tools, messages=messages
        )
        messages.append({"role": "assistant", "content": response.content})
        uso.update({k: getattr(response.usage, k) for k in PRECIO_POR_MILLON})
        if response.stop_reason != "tool_use":
            if response.stop_reason != "end_turn":
                print(f"  (cortó por {response.stop_reason})")
            return
        resultados = []
        for b in response.content:
            if b.type == "tool_use":
                r = await mcp.call_tool(b.name, b.input, raise_on_error=False)
                mostrar(b, r)
                resultados.append({"type": "tool_result", "tool_use_id": b.id,
                                   "content": r.content[0].text, "is_error": r.is_error})
        messages.append({"role": "user", "content": resultados})


ULTIMA_FOTO = 60  # los 10 días; S043–S060 (días 8 a 10) quedaron apartados hasta tener el agente terminado


def llegadas(hasta):
    """Las fotos en el orden en que llegan según llegadas.csv, hasta la foto 'hasta'. S034 llega dos veces."""
    with open(calculo.DATA / "snapshots" / "llegadas.csv", encoding="utf-8-sig") as f:
        return [fila["snapshot_id"] for fila in csv.DictReader(f) if int(fila["snapshot_id"][1:]) <= hasta]


async def correr(hasta=ULTIMA_FOTO):
    if not 1 <= hasta <= ULTIMA_FOTO:
        raise SystemExit(f"La última foto tiene que estar entre S001 y S{ULTIMA_FOTO:03}.")
    registro.RUTA.unlink(missing_ok=True)  # cuaderno vacío al empezar la serie
    claude = anthropic.AsyncAnthropic()
    inicio = time.time()
    async with Client(str(SERVIDOR)) as mcp:
        tools = [{"name": t.name, "description": t.description, "input_schema": t.inputSchema}
                 for t in await mcp.list_tools()]
        for orden, snapshot_id in enumerate(llegadas(hasta), start=1):
            print(f"{snapshot_id} (llegada {orden})")
            await procesar_foto(claude, mcp, tools, snapshot_id)
    minutos = (time.time() - inicio) / 60

    cuaderno = registro.cargar()
    print("\nCasos:")
    for c in cuaderno["casos"]:
        print(f"  {c['caso_id']} {c['modelo']}/{c['mercado']}: {c['estado']} (abierto en {c['abierto_en']})")
    print("\nSeveridad subida por bitácora:")
    for s in cuaderno.get("subidas", []):
        hasta = f"hasta {s['levantada_en']} ({s['bitacora_fin']})" if s["levantada_en"] else "sigue vigente"
        print(f"  {s['modelo']} {s['categoria']} ({s['etapa']}): desde {s['subida_en']} ({s['bitacora']}), {hasta}")
    print("\nAlertas:")
    for a in cuaderno["alertas"]:
        print(f"  [{a['snapshot_id']}] {a['caso_id']}: {a['texto']}")
    print("\nInformes:")
    for inf in cuaderno["informes"]:
        print(f"  [{inf['snapshot_id']} {inf['turno']}] {inf['texto']}\n")

    costo = sum(uso[k] * precio / 1_000_000 for k, precio in PRECIO_POR_MILLON.items())
    print(f"Tiempo: {minutos:.1f} min · Tokens: {uso['input_tokens']:,} de entrada, "
          f"{uso['output_tokens']:,} de salida · Costo: USD {costo:.4f}")


if __name__ == "__main__":
    load_dotenv()
    # python src/agente.py S042 → corre S001 a S042; sin nada → las 61 llegadas, hasta S060
    asyncio.run(correr(int(sys.argv[1].lstrip("Ss")) if len(sys.argv) > 1 else ULTIMA_FOTO))
