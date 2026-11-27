"""Pruebas de registro.py: el ciclo de un caso y las novedades del informe (criterio.md §3 y §4).
Usan cuadernos en memoria, no tocan salidas/registro.json.
Correr con: python tests/test_registro.py"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))
from registro import (  # noqa: E402
    aplicar_subidas, aviso, cerrar_turno, falta_confirmar, levantar, nuevo, procesar_snapshot, subir, validar_aviso,
)


def problema(modelo, mercado, severidad):
    return [{"modelo": modelo, "mercado": mercado, "severidad_final": severidad}]


suv = lambda sev: problema("SUV", "Europa", sev)
loc = lambda sev: problema("SUV", "Local", sev)

# ciclo de un caso: el ejemplo de SUV/Europa
r = nuevo()
assert procesar_snapshot(r, "S015", suv("media")) == [{"caso_id": "C001", "cambio": "abierto"}]
assert procesar_snapshot(r, "S016", suv("critica")) == [{"caso_id": "C001", "cambio": "escalado", "origen": "umbral"}]
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
                                                        {"caso_id": "C001", "cambio": "escalado", "origen": "umbral"}]

# subida de severidad por bitácora (criterio.md §5): la línea de Pickup parada sin fecha de vuelta
parada = {"categoria": "parada_de_linea", "etapa": "montaje"}
pickup = lambda mercado, sev: problema("Pickup", mercado, sev)
r = nuevo()
procesar_snapshot(r, "S034", pickup("Brasil", "media") + pickup("Local", "media") + problema("Sedán", "Local", "media"))
brasil, local, sedan = r["casos"]
brasil["causa"] = local["causa"] = dict(parada)
sedan["causa"] = dict(parada)  # otro modelo con la misma causa: la subida no lo alcanza
assert subir(r, brasil, "T17", "no hay fecha confirmada", "S034") == [
    {"caso_id": "C001", "cambio": "escalado", "origen": "agente"},
    {"caso_id": "C002", "cambio": "escalado", "origen": "agente"}]   # escalan los dos Pickup con esa causa
assert sedan["estado"] != "escalado" and brasil["severidad_actual"] == "critica"

# un caso que se abre mientras la subida sigue vigente escala cuando recibe la misma causa
procesar_snapshot(r, "S035", pickup("Europa", "media") + pickup("Brasil", "media") + pickup("Local", "media"))
europa = r["casos"][3]
assert europa["estado"] == "abierto"
europa["causa"] = dict(parada)
assert aplicar_subidas(r, "S035") == [{"caso_id": "C004", "cambio": "escalado", "origen": "agente"}]

# con la subida vigente, dos fotos sin problema por los números no resuelven el caso
procesar_snapshot(r, "S036", []); procesar_snapshot(r, "S037", [])
assert brasil["estado"] == "escalado" and brasil["severidad_actual"] == "critica"
assert sedan["estado"] == "resuelto"  # el Sedán no tenía subida: se resolvió
# pero el informe lo marca: los números ya no muestran atraso y ninguna bitácora dijo que se resolvió
assert falta_confirmar(r, brasil) == 2 and falta_confirmar(r, sedan) == 0

# levantada la subida, rige otra vez la severidad del código y se resuelve con dos fotos sin problema
levantar(r["subidas"][0], "T19", "volvió a las 10:00", "S038")
assert falta_confirmar(r, brasil) == 0  # ya no hay nada que confirmar
procesar_snapshot(r, "S039", []); procesar_snapshot(r, "S040", [])
assert brasil["estado"] == "resuelto" and brasil["resuelto_en"] == "S040"

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

# avisos estructurados (guía, sección 4): se arman desde el cuaderno y se validan antes de guardarlos
r = nuevo()
procesar_snapshot(r, "S001", [{"modelo": "Pickup", "mercado": "Brasil", "severidad_final": "critica", "etapa_donde_se_traban": "montaje"}])
caso = r["casos"][0]
caso["causa"] = {"categoria": "parada_de_linea", "etapa": "montaje", "bitacora": "T17", "fragmento": "se paró la línea"}
a = aviso(r, caso, "S001", "alerta_inmediata", "Pickup para Brasil pasó a crítica")
assert validar_aviso(a) == [] and a["origen"] == "umbral"
assert a["evidencia"] == [{"bitacora": "T17", "fragmento": "se paró la línea"}]
assert any("escalado y crítico" in e for e in validar_aviso({**a, "severidad": "media"}))    # una alerta es de un caso crítico
assert any("no tiene texto" in e for e in validar_aviso({**a, "texto": " "}))
assert any("trae la cita" in e for e in validar_aviso({**a, "origen": "agente", "evidencia": []}))
assert any("tipo inválido" in e for e in validar_aviso({**a, "tipo": "mail"}))
assert any("evidencia" in e for e in validar_aviso({**a, "evidencia": [{"bitacora": "X", "fragmento": ""}]}))
informe = aviso(r, caso, "S002", "informe_de_turno")
assert validar_aviso(informe) == [] and "texto" not in informe   # una novedad del informe no lleva texto propio

print("ok")
