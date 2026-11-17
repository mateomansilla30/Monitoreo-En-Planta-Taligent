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

registro.guardar(perfecto)
assert evaluador.evaluar(20) == []

# el mismo agente con 4 errores
malo = copy.deepcopy(perfecto)
malo["alertas"] = [{"snapshot_id": "S017", "caso_id": "C005", "texto": "..."}]  # falta la de S016 y sobra esta
malo["informes"].append(malo["informes"][0])                                     # repite un informe
malo["snapshots_procesados"].remove("S019")                                      # saltea una foto
registro.guardar(malo)
assert evaluador.evaluar(20) == [
    "no procesó S019",
    "faltó la alerta de SUV/Europa en S016",
    "alerta de más: SUV/Local en S017",
    "informe repetido en S002 (2 veces)",
]

print("ok")
