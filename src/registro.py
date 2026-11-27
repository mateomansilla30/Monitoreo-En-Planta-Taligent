import copy
import json
import os
import re
from pathlib import Path

from calculo import SEVERIDADES

# Las pruebas la cambian por una temporal; la demo en vivo usa otra (variable REGISTRO), así no pisa la última corrida.
# El servidor MCP corre en otro proceso: agente.py le pasa la variable, así los dos usan el mismo cuaderno.
RUTA = Path(os.environ.get("REGISTRO") or Path(__file__).resolve().parent.parent / "salidas" / "registro.json")

FOTOS_PARA_RESOLVER = 2  # fotos seguidas sin desvío para dar un caso por resuelto (umbrales.yaml: resolucion)


def nuevo():
    """Un cuaderno vacío."""
    return {"snapshots_procesados": [], "casos": [], "alertas": [], "informes": [], "subidas": []}


def cargar():
    """Lee el cuaderno. Si todavía no existe, devuelve uno vacío."""
    if not RUTA.exists():
        return nuevo()
    with open(RUTA, encoding="utf-8") as f:
        return json.load(f)


def guardar(registro):
    RUTA.parent.mkdir(parents=True, exist_ok=True)
    with open(RUTA, "w", encoding="utf-8") as f:
        json.dump(registro, f, ensure_ascii=False, indent=2)


def anotar_severidad(caso, severidad):
    """Guarda la severidad de esta foto y la más alta desde el último informe (para no perder un pico)."""
    caso["severidad_actual"] = severidad
    caso["severidad_maxima"] = max(caso.get("severidad_maxima", "ninguna"), severidad, key=SEVERIDADES.index)


def escalar(caso, snapshot_id, origen, cambios):
    """origen es 'umbral' (los números llegaron a crítica) o 'agente' (una subida por bitácora)."""
    caso["estado"] = "escalado"
    caso["alerta_enviada_en"] = snapshot_id
    caso["escalado_por"] = origen
    cambios.append({"caso_id": caso["caso_id"], "cambio": "escalado", "origen": origen})


def procesar_snapshot(registro, snapshot_id, problemas):
    """Aplica el ciclo de un caso (criterio.md §3) a una foto.
    Devuelve qué cambió: casos abiertos, escalados y resueltos."""
    if snapshot_id in registro["snapshots_procesados"]:
        return []  # la foto ya pasó (S034 llega dos veces)
    registro["snapshots_procesados"].append(snapshot_id)

    activos = {(c["modelo"], c["mercado"]): c for c in registro["casos"] if c["estado"] != "resuelto"}
    cambios = []

    # combinaciones con problema en esta foto
    for p in problemas:
        caso = activos.pop((p["modelo"], p["mercado"]), None)
        if caso is None:
            caso = {"caso_id": f"C{len(registro['casos']) + 1:03}",
                    "modelo": p["modelo"], "mercado": p["mercado"],
                    "estado": "abierto", "abierto_en": snapshot_id,
                    "alerta_enviada_en": None,
                    "etapa_cuello": None,  # la última etapa donde los datos mostraron autos trabados
                    "causa": None}  # la registra el agente desde la bitácora (registrar_causa)
            registro["casos"].append(caso)
            cambios.append({"caso_id": caso["caso_id"], "cambio": "abierto"})
        elif caso["estado"] == "abierto":
            caso["estado"] = "en_seguimiento"
        if p.get("etapa_donde_se_traban"):
            caso["etapa_cuello"] = p["etapa_donde_se_traban"]
        severidad, origen = p["severidad_final"], "umbral"
        if severidad != "critica" and subida_vigente(registro, caso):
            severidad, origen = "critica", "agente"  # la severidad del código es un piso: la subida la lleva a crítica
        anotar_severidad(caso, severidad)
        caso["fotos_seguidas_sin_problema"] = 0
        caso["sin_atraso_con_subida"] = 0
        if severidad == "critica" and caso["estado"] != "escalado":
            escalar(caso, snapshot_id, origen, cambios)

    # casos activos que en esta foto ya no tienen problema por los números
    for caso in activos.values():
        if caso["estado"] == "abierto":
            caso["estado"] = "en_seguimiento"
        if subida_vigente(registro, caso):
            # con una subida vigente sigue habiendo desvío: no cuenta para resolverse (criterio.md §3).
            # Igual se cuenta cuántas fotos van sin atraso en los números, para que el informe pida confirmarlo.
            anotar_severidad(caso, "critica")
            caso["fotos_seguidas_sin_problema"] = 0
            caso["sin_atraso_con_subida"] = caso.get("sin_atraso_con_subida", 0) + 1
            continue
        anotar_severidad(caso, "ninguna")
        caso["fotos_seguidas_sin_problema"] += 1
        if caso["fotos_seguidas_sin_problema"] == FOTOS_PARA_RESOLVER:
            caso["estado"] = "resuelto"
            caso["resuelto_en"] = snapshot_id
            cambios.append({"caso_id": caso["caso_id"], "cambio": "resuelto"})

    return cambios


def falta_confirmar(registro, caso):
    """Cuántas fotos seguidas van sin atraso en los números mientras la subida sigue vigente, desde las que alcanzarían
    para resolver el caso; si no, 0. La subida no la levantan los números (criterio.md §5: solo una bitácora que diga que
    se resolvió), pero el informe lo marca para que alguien lo confirme y el caso no quede en crítica sin que nadie lo note."""
    n = caso.get("sin_atraso_con_subida", 0)
    return n if n >= FOTOS_PARA_RESOLVER and subida_vigente(registro, caso) else 0


def subida_vigente(registro, caso):
    """La subida de severidad vigente que alcanza a este caso, o None (criterio.md §5).
    Alcanza a los casos del mismo modelo con la misma causa: misma categoría y misma etapa."""
    causa = caso.get("causa")
    if not causa or causa["categoria"] == "no_declarada":
        return None
    return next((s for s in registro.get("subidas", [])
                 if s["levantada_en"] is None and s["modelo"] == caso["modelo"]
                 and (s["categoria"], s["etapa"]) == (causa["categoria"], causa["etapa"])), None)


def aplicar_subidas(registro, snapshot_id):
    """Lleva a crítica los casos activos que alcanza una subida vigente. Devuelve los que escalaron con eso.
    Se usa en el momento en que se sube la severidad o en que un caso recibe una causa con subida vigente."""
    cambios = []
    for caso in registro["casos"]:
        if caso["estado"] != "resuelto" and subida_vigente(registro, caso):
            anotar_severidad(caso, "critica")
            caso["fotos_seguidas_sin_problema"] = 0
            if caso["estado"] != "escalado":
                escalar(caso, snapshot_id, "agente", cambios)
    return cambios


def subir(registro, caso, bitacora, fragmento, snapshot_id):
    """El agente sube a crítica la causa de este caso porque la bitácora dice que sigue sin fecha de resolución.
    Vale para todos los casos activos con esa causa y para los que se abran mientras siga vigente."""
    registro.setdefault("subidas", []).append({
        "modelo": caso["modelo"], "categoria": caso["causa"]["categoria"], "etapa": caso["causa"]["etapa"],
        "subida_en": snapshot_id, "bitacora": bitacora, "fragmento": fragmento,
        "levantada_en": None, "bitacora_fin": None, "fragmento_fin": None,
    })
    return aplicar_subidas(registro, snapshot_id)


def levantar(subida, bitacora, fragmento, snapshot_id):
    """Una bitácora posterior dice que la causa se resolvió: desde acá rige otra vez la severidad del código."""
    subida.update(levantada_en=snapshot_id, bitacora_fin=bitacora, fragmento_fin=fragmento)


TIPOS_AVISO = ("alerta_inmediata", "informe_de_turno")
ESTADOS = ("abierto", "en_seguimiento", "escalado", "resuelto")


def evidencia_de(registro, caso):
    """Las citas que respaldan un aviso: la de la causa y, si la severidad está subida, la de la subida."""
    evidencia = []
    causa = caso.get("causa")
    if causa and causa.get("bitacora"):
        evidencia.append({"bitacora": causa["bitacora"], "fragmento": causa["fragmento"]})
    subida = subida_vigente(registro, caso)
    if subida:
        evidencia.append({"bitacora": subida["bitacora"], "fragmento": subida["fragmento"]})
    return evidencia


def aviso(registro, caso, snapshot_id, tipo, texto=None):
    """Un aviso con la forma que sugiere la guía (sección 4): qué caso, en qué foto, por qué escaló y con qué evidencia.
    Los campos salen del cuaderno, no del texto que escribió el modelo."""
    causa = caso.get("causa")
    resultado = {
        "snapshot_id": snapshot_id, "caso_id": caso["caso_id"], "modelo": caso["modelo"], "mercado": caso["mercado"],
        "tipo": tipo, "severidad": caso["severidad_actual"], "estado": caso["estado"],
        "origen": caso.get("escalado_por"),  # 'umbral' (los números) o 'agente' (la bitácora); None si no escaló
        "causa": {"categoria": causa["categoria"], "etapa": causa["etapa"]} if causa else None,
        "evidencia": evidencia_de(registro, caso),
    }
    if texto is not None:
        resultado["texto"] = texto
    return resultado


def validar_aviso(a):
    """Los errores de forma de un aviso (lista vacía si está bien). Una alerta tiene reglas extra:
    es de un caso escalado y crítico, dice por qué escaló, y si escaló por la bitácora trae la cita."""
    errores = []
    if not re.fullmatch(r"S\d{3}", str(a.get("snapshot_id"))):
        errores.append("snapshot_id inválido")
    if a.get("tipo") not in TIPOS_AVISO:
        errores.append(f"tipo inválido: {a.get('tipo')}")
    if a.get("severidad") not in SEVERIDADES:
        errores.append(f"severidad inválida: {a.get('severidad')}")
    if a.get("estado") not in ESTADOS:
        errores.append(f"estado inválido: {a.get('estado')}")
    if a.get("origen") not in (None, "umbral", "agente"):
        errores.append(f"origen inválido: {a.get('origen')}")
    causa = a.get("causa")
    if causa is not None and not (isinstance(causa, dict) and causa.get("categoria")):
        errores.append("causa sin categoría")
    for e in a.get("evidencia", []):
        if not re.fullmatch(r"T\d{2}", str(e.get("bitacora"))) or not e.get("fragmento"):
            errores.append("evidencia sin bitácora o sin fragmento")
    if a.get("tipo") == "alerta_inmediata":
        if a.get("severidad") != "critica" or a.get("estado") != "escalado":
            errores.append(f"una alerta es de un caso escalado y crítico, y {a.get('caso_id')} está {a.get('estado')} "
                           f"con severidad {a.get('severidad')}")
        if a.get("origen") is None:
            errores.append("la alerta no dice por qué escaló el caso")
        if a.get("origen") == "agente" and not a.get("evidencia"):
            errores.append("escaló por la bitácora pero no trae la cita")
        if not str(a.get("texto", "")).strip():
            errores.append("la alerta no tiene texto")
    return errores


def cerrar_turno(registro, confirmar=True):
    """Arma el informe de cierre (criterio.md §4): las novedades desde el último informe y los casos activos.
    Con confirmar=True deja anotado qué se informó de cada caso, para comparar en el próximo cierre;
    con False solo muestra cómo quedaría (lo que ve el agente antes de escribir el informe)."""
    if not confirmar:
        registro = copy.deepcopy(registro)
    novedades, activos = [], []
    for caso in registro["casos"]:
        # para comparar, 'abierto' y 'en_seguimiento' cuentan como el mismo estado
        ahora = {"estado": caso["estado"].replace("en_seguimiento", "abierto"), "severidad": caso["severidad_actual"]}
        antes = caso.get("ultimo_informe")
        resumen = {k: caso[k] for k in ("caso_id", "modelo", "mercado", "estado", "severidad_actual", "severidad_maxima", "causa")}
        if caso["estado"] != "resuelto":
            activos.append(resumen)
        # novedad: caso nuevo, cambio de estado o severidad, o un pico en el turno más alto que el cierre
        if antes != ahora or caso["severidad_maxima"] != caso["severidad_actual"]:
            novedades.append({**resumen, "en_el_informe_anterior": antes})
        caso["ultimo_informe"] = ahora
        caso["severidad_maxima"] = "ninguna"  # la máxima del próximo informe arranca de cero
    return novedades, activos


def buscar_caso(registro, caso_id):
    return next((c for c in registro["casos"] if c["caso_id"] == caso_id), None)
