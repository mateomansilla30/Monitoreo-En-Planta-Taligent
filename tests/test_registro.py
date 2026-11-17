"""Pruebas de registro.py: el ciclo de un caso y las novedades del informe (criterio.md §3 y §4).
Usan cuadernos en memoria, no tocan salidas/registro.json.
Correr con: python tests/test_registro.py"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))
from registro import cerrar_turno, nuevo, procesar_snapshot  # noqa: E402


def problema(modelo, mercado, severidad):
    return [{"modelo": modelo, "mercado": mercado, "severidad_final": severidad}]


suv = lambda sev: problema("SUV", "Europa", sev)
loc = lambda sev: problema("SUV", "Local", sev)

# ciclo de un caso: el ejemplo de SUV/Europa
r = nuevo()
assert procesar_snapshot(r, "S015", suv("media")) == [{"caso_id": "C001", "cambio": "abierto"}]
assert procesar_snapshot(r, "S016", suv("critica")) == [{"caso_id": "C001", "cambio": "escalado"}]
assert procesar_snapshot(r, "S017", suv("critica")) == []  # ya escalado: no vuelve a alertar
assert procesar_snapshot(r, "S018", suv("media")) == []    # baja la severidad: sigue escalado
assert r["casos"][0]["estado"] == "escalado"
assert procesar_snapshot(r, "S019", []) == []              # 1 foto sin problema
assert procesar_snapshot(r, "S019", []) == []              # foto repetida: no cuenta
assert procesar_snapshot(r, "S020", []) == [{"caso_id": "C001", "cambio": "resuelto"}]  # 2 fotos sin problema
assert r["casos"][0]["resuelto_en"] == "S020"
assert procesar_snapshot(r, "S021", suv("media")) == [{"caso_id": "C002", "cambio": "abierto"}]  # vuelve: caso nuevo

# un caso que se abre ya en crítica se abre y se escala en la misma foto
r = nuevo()
assert procesar_snapshot(r, "S001", suv("critica")) == [{"caso_id": "C001", "cambio": "abierto"},
                                                        {"caso_id": "C001", "cambio": "escalado"}]

# novedades del informe: turno T08 = S015 + S016, T09 = S017 + S018, T10 = S019 + S020
r = nuevo()
novedades = lambda: [(n["caso_id"], n["estado"], n["severidad_maxima"]) for n in cerrar_turno(r)[0]]
procesar_snapshot(r, "S015", suv("media")); procesar_snapshot(r, "S016", suv("critica"))
assert novedades() == [("C001", "escalado", "critica")]          # caso nuevo
procesar_snapshot(r, "S017", suv("critica")); procesar_snapshot(r, "S018", suv("critica"))
assert novedades() == []                                          # nada cambió: no se repite
procesar_snapshot(r, "S019", []); procesar_snapshot(r, "S020", [])
assert novedades() == [("C001", "resuelto", "ninguna")]          # resuelto en el turno
assert novedades() == []                                          # un resuelto no vuelve a aparecer
procesar_snapshot(r, "S021", loc("media")); procesar_snapshot(r, "S022", loc("media"))
assert novedades() == [("C002", "en_seguimiento", "media")]      # caso nuevo
procesar_snapshot(r, "S023", loc("alta")); procesar_snapshot(r, "S024", loc("media"))
assert novedades() == [("C002", "en_seguimiento", "alta")]       # pico alta que bajó a media antes del cierre
assert [c["caso_id"] for c in cerrar_turno(r)[1]] == ["C002"]     # casos activos: solo C002

print("ok")
