import csv
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "Data"


def leer_plan():
    """Devuelve {(turno_id, modelo, mercado): unidades_plan}"""
    plan = {}
    with open(DATA / "planta" / "plan_produccion.csv", encoding="utf-8-sig") as f:
        for fila in csv.DictReader(f):
            clave = (fila["turno_id"], fila["modelo"], fila["mercado"])
            plan[clave] = int(fila["unidades_plan"])
    return plan

def leer_turnos():
    """Devuelve la lista de turnos en orden (T01, T02, ...)"""
    with open(DATA / "planta" / "turnos.csv", encoding="utf-8-sig") as f:
        turnos = list(csv.DictReader(f))
    return sorted(turnos, key=lambda t: t["turno_id"])


def plan_acumulado(snapshot_id, modelo, mercado, plan, turnos):
    """Plan desde T01 hasta este snapshot. A mitad de turno, el turno actual cuenta la mitad."""
    total = 0
    for t in turnos:
        unidades = plan[(t["turno_id"], modelo, mercado)]
        if snapshot_id == t["snapshot_medio"]:
            return total + unidades / 2
        total += unidades
        if snapshot_id == t["snapshot_cierre"]:
            return total
    raise ValueError(f"{snapshot_id} no está en turnos.csv")

if __name__ == "__main__":
    plan = leer_plan()
    turnos = leer_turnos()
    print("S013:", plan_acumulado("S013", "SUV", "Europa", plan, turnos))
    print("S014:", plan_acumulado("S014", "SUV", "Europa", plan, turnos))
