import json
from pathlib import Path

from calculo import SEVERIDADES

RUTA = Path(__file__).resolve().parent.parent / "salidas" / "registro.json"


def cargar(ruta=RUTA):
    """Lee el cuaderno. Si todavía no existe, devuelve uno vacío."""
    if not ruta.exists():
        return {"snapshots_procesados": [], "casos": [], "alertas": [], "informes": []}
    with open(ruta, encoding="utf-8") as f:
        return json.load(f)


def guardar(registro, ruta=RUTA):
    ruta.parent.mkdir(exist_ok=True)
    with open(ruta, "w", encoding="utf-8") as f:
        json.dump(registro, f, ensure_ascii=False, indent=2)


def anotar_severidad(caso, severidad):
    """Guarda la severidad de esta foto y la más alta desde el último informe (para no perder un pico)."""
    caso["severidad_actual"] = severidad
    caso["severidad_maxima"] = max(caso.get("severidad_maxima", "ninguna"), severidad, key=SEVERIDADES.index)


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
                    "alerta_enviada_en": None}
            registro["casos"].append(caso)
            cambios.append({"caso_id": caso["caso_id"], "cambio": "abierto"})
        elif caso["estado"] == "abierto":
            caso["estado"] = "en_seguimiento"
        anotar_severidad(caso, p["severidad_final"])
        caso["fotos_seguidas_sin_problema"] = 0
        if p["severidad_final"] == "critica" and caso["estado"] != "escalado":
            caso["estado"] = "escalado"
            caso["alerta_enviada_en"] = snapshot_id
            cambios.append({"caso_id": caso["caso_id"], "cambio": "escalado"})

    # casos activos que en esta foto ya no tienen problema
    for caso in activos.values():
        anotar_severidad(caso, "ninguna")
        caso["fotos_seguidas_sin_problema"] += 1
        if caso["estado"] == "abierto":
            caso["estado"] = "en_seguimiento"
        if caso["fotos_seguidas_sin_problema"] == 2:
            caso["estado"] = "resuelto"
            caso["resuelto_en"] = snapshot_id
            cambios.append({"caso_id": caso["caso_id"], "cambio": "resuelto"})

    return cambios


def cerrar_turno(registro):
    """Arma el informe de cierre (criterio.md §4): las novedades desde el último informe y los casos activos.
    Deja anotado qué se informó de cada caso, para comparar en el próximo cierre."""
    novedades, activos = [], []
    for caso in registro["casos"]:
        # para comparar, 'abierto' y 'en_seguimiento' cuentan como el mismo estado
        ahora = {"estado": caso["estado"].replace("en_seguimiento", "abierto"), "severidad": caso["severidad_actual"]}
        antes = caso.get("ultimo_informe")
        resumen = {k: caso[k] for k in ("caso_id", "modelo", "mercado", "estado", "severidad_actual", "severidad_maxima")}
        if caso["estado"] != "resuelto":
            activos.append(resumen)
        # novedad: caso nuevo, cambio de estado o severidad, o un pico en el turno más alto que el cierre
        if antes != ahora or caso["severidad_maxima"] != caso["severidad_actual"]:
            novedades.append({**resumen, "en_el_informe_anterior": antes})
        caso["ultimo_informe"] = ahora
        caso["severidad_maxima"] = "ninguna"  # la máxima del próximo informe arranca de cero
    return novedades, activos


if __name__ == "__main__":
    r = {"snapshots_procesados": [], "casos": []}
    suv = lambda sev: [{"modelo": "SUV", "mercado": "Europa", "severidad_final": sev}]
    assert procesar_snapshot(r, "S015", suv("media")) == [{"caso_id": "C001", "cambio": "abierto"}]
    assert procesar_snapshot(r, "S016", suv("critica")) == [{"caso_id": "C001", "cambio": "escalado"}]
    assert procesar_snapshot(r, "S017", suv("critica")) == []  # ya escalado: no vuelve a alertar
    assert procesar_snapshot(r, "S019", []) == []              # 1 foto sin problema
    assert procesar_snapshot(r, "S019", []) == []              # foto repetida: no cuenta
    assert procesar_snapshot(r, "S020", []) == [{"caso_id": "C001", "cambio": "resuelto"}]
    assert r["casos"][0]["resuelto_en"] == "S020"
    assert procesar_snapshot(r, "S021", suv("media")) == [{"caso_id": "C002", "cambio": "abierto"}]

    # novedades del informe: turno T08 = S015 + S016, T09 = S017 + S018, T10 = S019 + S020
    r = {"snapshots_procesados": [], "casos": []}
    novedades = lambda: [(n["caso_id"], n["estado"], n["severidad_maxima"]) for n in cerrar_turno(r)[0]]
    procesar_snapshot(r, "S015", suv("media")); procesar_snapshot(r, "S016", suv("critica"))
    assert novedades() == [("C001", "escalado", "critica")]          # caso nuevo
    procesar_snapshot(r, "S017", suv("critica")); procesar_snapshot(r, "S018", suv("critica"))
    assert novedades() == []                                          # nada cambió: no se repite
    procesar_snapshot(r, "S019", []); procesar_snapshot(r, "S020", [])
    assert novedades() == [("C001", "resuelto", "ninguna")]          # resuelto en el turno
    assert novedades() == []                                          # un resuelto no vuelve a aparecer
    loc = lambda sev: [{"modelo": "SUV", "mercado": "Local", "severidad_final": sev}]
    procesar_snapshot(r, "S021", loc("media")); procesar_snapshot(r, "S022", loc("media"))
    assert novedades() == [("C002", "en_seguimiento", "media")]      # caso nuevo
    procesar_snapshot(r, "S023", loc("alta")); procesar_snapshot(r, "S024", loc("media"))
    assert novedades() == [("C002", "en_seguimiento", "alta")]       # pico alta que bajó a media
    assert cerrar_turno(r)[1][0]["caso_id"] == "C002"                 # casos activos
    print("ok")
