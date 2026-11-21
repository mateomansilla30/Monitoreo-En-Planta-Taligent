"""Pruebas de evaluador.py: que encuentre los errores de un agente.
Compara el agente perfecto contra sí mismo y contra copias con errores puestos a propósito, sin usar la API.
Usan un cuaderno temporal, no tocan salidas/registro.json.
Correr con: python tests/test_evaluador.py"""
import copy
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))
import evaluador  # noqa: E402
import registro  # noqa: E402

registro.RUTA = Path(tempfile.mkdtemp()) / "registro.json"

# el agente perfecto, contra sí mismo, no tiene errores
perfecto = evaluador.agente_perfecto(20)
registro.guardar(perfecto)
assert evaluador.evaluar(20) == []

# la causa esperada depende de hasta dónde se corrió: la de SUV/Local está en T09, que se lee desde S018
assert evaluador.causa_esperada("SUV/Local", "S017", 17) == ("no_declarada", "pintura")
assert evaluador.causa_esperada("SUV/Local", "S017", 18) == ("retrabajo", "pintura")

# el mismo agente con 6 errores
malo = copy.deepcopy(perfecto)
malo["alertas"] = [{"snapshot_id": "S017", "caso_id": "C005"}]                   # falta la de S016 y sobra esta
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

# con la subida de los Pickup: las alertas salen en S034 y S035, por la bitácora y no por los números
perfecto = evaluador.agente_perfecto(40)
alertas = [(a["snapshot_id"], evaluador.combinacion(perfecto, a["caso_id"])) for a in perfecto["alertas"]]
assert alertas == [("S016", "SUV/Europa"), ("S034", "Pickup/Brasil"), ("S034", "Pickup/Local"), ("S035", "Pickup/Europa")]
assert evaluador.subidas(perfecto) == {("Pickup", "parada_de_linea", "montaje", "S034", "S038")}
registro.guardar(perfecto)
assert evaluador.evaluar(40) == []

# un agente que no sube la severidad: avisa tarde, por los números, y le falta la subida
sin_subida = copy.deepcopy(perfecto)
sin_subida["subidas"] = []
sin_subida["alertas"] = [a for a in sin_subida["alertas"] if a["snapshot_id"] == "S016"] + [
    {"snapshot_id": "S036", "caso_id": c} for c in ("C009", "C010", "C011")]
registro.guardar(sin_subida)
errores = evaluador.evaluar(40)
assert "faltó la alerta de Pickup/Brasil en S034" in errores
assert "alerta de más: Pickup/Brasil en S036" in errores
assert "faltó la subida de severidad: Pickup parada_de_linea (montaje), subida en S034, levantada en S038" in errores

print("ok")
