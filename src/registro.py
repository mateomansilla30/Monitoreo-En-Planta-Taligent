import json
from pathlib import Path

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
        caso["severidad_actual"] = p["severidad_final"]
        caso["fotos_seguidas_sin_problema"] = 0
        if p["severidad_final"] == "critica" and caso["estado"] != "escalado":
            caso["estado"] = "escalado"
            caso["alerta_enviada_en"] = snapshot_id
            cambios.append({"caso_id": caso["caso_id"], "cambio": "escalado"})

    # casos activos que en esta foto ya no tienen problema
    for caso in activos.values():
        caso["severidad_actual"] = "ninguna"
        caso["fotos_seguidas_sin_problema"] += 1
        if caso["estado"] == "abierto":
            caso["estado"] = "en_seguimiento"
        if caso["fotos_seguidas_sin_problema"] == 2:
            caso["estado"] = "resuelto"
            caso["resuelto_en"] = snapshot_id
            cambios.append({"caso_id": caso["caso_id"], "cambio": "resuelto"})

    return cambios


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
    print("ok")
