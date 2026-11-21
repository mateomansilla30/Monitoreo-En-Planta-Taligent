import copy
import json
from pathlib import Path

from calculo import SEVERIDADES

RUTA = Path(__file__).resolve().parent.parent / "salidas" / "registro.json"  # las pruebas la cambian por una temporal


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
    RUTA.parent.mkdir(exist_ok=True)
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
        if severidad == "critica" and caso["estado"] != "escalado":
            escalar(caso, snapshot_id, origen, cambios)

    # casos activos que en esta foto ya no tienen problema por los números
    for caso in activos.values():
        if caso["estado"] == "abierto":
            caso["estado"] = "en_seguimiento"
        if subida_vigente(registro, caso):
            # con una subida vigente sigue habiendo desvío: no cuenta para resolverse (criterio.md §3)
            anotar_severidad(caso, "critica")
            caso["fotos_seguidas_sin_problema"] = 0
            continue
        anotar_severidad(caso, "ninguna")
        caso["fotos_seguidas_sin_problema"] += 1
        if caso["fotos_seguidas_sin_problema"] == 2:
            caso["estado"] = "resuelto"
            caso["resuelto_en"] = snapshot_id
            cambios.append({"caso_id": caso["caso_id"], "cambio": "resuelto"})

    return cambios


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
