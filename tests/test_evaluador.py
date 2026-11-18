"""Pruebas de evaluador.py: que encuentre los errores de un agente.
Simula un agente perfecto y uno con errores puestos a propósito, sin usar la API.
Usan un cuaderno temporal, no tocan salidas/registro.json.
Correr con: python tests/test_evaluador.py"""
import copy
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))
import calculo  # noqa: E402
import evaluador  # noqa: E402
import registro  # noqa: E402

registro.RUTA = Path(tempfile.mkdtemp()) / "registro.json"

# un agente perfecto, de S001 a S020: una alerta por cada escalado y un informe por cada cierre
perfecto = registro.nuevo()
cierres = {t["snapshot_cierre"] for t in calculo.leer_turnos()}
for i in range(1, 21):
    s = f"S{i:03}"
    problemas = [p for p in calculo.evaluar(s) if p["severidad_final"] != "ninguna"]
    for cambio in registro.procesar_snapshot(perfecto, s, problemas):
        if cambio["cambio"] == "escalado":
            perfecto["alertas"].append({"snapshot_id": s, "caso_id": cambio["caso_id"], "texto": "..."})
    if s in cierres:
        perfecto["informes"].append({"snapshot_id": s, "turno": "", "texto": "..."})
for caso in perfecto["casos"]:  # y la causa que corresponde a cada caso
    categoria, etapa = evaluador.causa_esperada(f"{caso['modelo']}/{caso['mercado']}", caso["abierto_en"], 20)
    caso["causa"] = {"categoria": categoria, "etapa": etapa}

registro.guardar(perfecto)
assert evaluador.evaluar(20) == []

# la causa esperada depende de hasta dónde se corrió: la de SUV/Local está en T09, que se lee desde S018
assert evaluador.causa_esperada("SUV/Local", "S017", 17) == ("no_declarada", "pintura")
assert evaluador.causa_esperada("SUV/Local", "S017", 18) == ("retrabajo", "pintura")

# el mismo agente con 6 errores
malo = copy.deepcopy(perfecto)
malo["alertas"] = [{"snapshot_id": "S017", "caso_id": "C005", "texto": "..."}]  # falta la de S016 y sobra esta
malo["informes"].append(malo["informes"][0])                                     # repite un informe
malo["snapshots_procesados"].remove("S019")                                      # saltea una foto
malo["casos"][3]["causa"] = {"categoria": "parada_de_linea", "etapa": "calidad"}  # C004: causa equivocada
malo["casos"][4]["causa"] = None                                                  # C005: sin causa
registro.guardar(malo)
assert evaluador.evaluar(20) == [
    "no procesó S019",
    "faltó la alerta de SUV/Europa en S016",
    "alerta de más: SUV/Local en S017",
    "informe repetido en S002 (2 veces)",
    "C004 SUV/Europa: esperaba retencion_de_calidad (calidad), Haiku dijo parada_de_linea (calidad)",
    "C005 SUV/Local: quedó sin causa (esperaba retrabajo, pintura)",
]

print("ok")
