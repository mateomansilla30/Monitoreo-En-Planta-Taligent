import csv
import json
from collections import Counter
from datetime import datetime, timedelta
from pathlib import Path

import yaml

DATA = Path(__file__).resolve().parent.parent / "Data"
SEVERIDADES = ["ninguna", "media", "alta", "critica"]
ETAPAS = ["carroceria", "pintura", "montaje", "calidad"]  # después de calidad viene patio


def leer_umbrales():
    with open(DATA / "reglas" / "umbrales.yaml", encoding="utf-8") as f:
        return yaml.safe_load(f)


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


def leer_snapshot(snapshot_id):
    with open(DATA / "snapshots" / f"{snapshot_id}.json", encoding="utf-8") as f:
        return json.load(f)


def avance_real(snapshot_id):
    """Devuelve {(modelo, mercado): unidades} liberadas desde S001 hasta este snapshot.
    Una unidad que aparece dos veces se cuenta una."""
    # ponytail: relee S001..snapshot_id en cada llamada (60 JSON, O(n²) en la serie); llevar el set incremental si pesa
    unidades = {}
    for i in range(1, int(snapshot_id[1:]) + 1):
        for u in leer_snapshot(f"S{i:03}")["liberadas"]:
            unidades[u["unidad_id"]] = (u["modelo"], u["mercado"])
    return Counter(unidades.values())


def turno_de(snapshot_id, turnos):
    for t in turnos:
        if snapshot_id in (t["snapshot_medio"], t["snapshot_cierre"]):
            return t["turno_id"]
    raise ValueError(f"{snapshot_id} no está en turnos.csv")


def gap(snapshot_id, modelo, mercado, plan, turnos, avance):
    """(unidades, porcentaje del plan diario). Negativo es atraso.
    El plan diario es el plan del turno del snapshot por tres."""
    unidades = avance[(modelo, mercado)] - plan_acumulado(snapshot_id, modelo, mercado, plan, turnos)
    plan_diario = plan[(turno_de(snapshot_id, turnos), modelo, mercado)] * 3
    return unidades, unidades / plan_diario * 100


def severidad_gap(unidades, porcentaje, umbrales):
    u = umbrales["gap"]
    if -unidades < u["minimo_unidades"]:
        return "ninguna"
    for sev in ("critica", "alta", "media"):
        if -porcentaje >= u[sev]:
            return sev
    return "ninguna"


def leer_tiempos():
    """Devuelve {(modelo, etapa): (minutos_estandar, minutos_retrabajo o None)}"""
    tiempos = {}
    with open(DATA / "planta" / "tiempos_estandar.csv", encoding="utf-8-sig") as f:
        for fila in csv.DictReader(f):
            retrabajo = int(fila["minutos_retrabajo"]) if fila["minutos_retrabajo"] else None
            tiempos[(fila["modelo"], fila["etapa"])] = (int(fila["minutos_estandar"]), retrabajo)
    return tiempos


def leer_embarques():
    """Devuelve {embarque_id: fila}, con corte_en_patio y salida como datetime"""
    embarques = {}
    with open(DATA / "planta" / "embarques.csv", encoding="utf-8-sig") as f:
        for fila in csv.DictReader(f):
            fila["corte_en_patio"] = datetime.fromisoformat(fila["corte_en_patio"])
            fila["salida"] = datetime.fromisoformat(fila["salida"])
            embarques[fila["embarque_id"]] = fila
    return embarques


def minutos_etapa(unidad, tiempos):
    """Tiempo estándar de la etapa actual. En pintura con retrabajos está en repintado."""
    estandar, retrabajo = tiempos[(unidad["modelo"], unidad["etapa"])]
    if unidad["etapa"] == "pintura" and unidad["retrabajos"] > 0:
        return retrabajo
    return estandar


def llegada_a_patio(unidad, ahora, tiempos):
    """Hora proyectada en que la unidad sale de calidad y entra a patio."""
    en_etapa = ahora - datetime.fromisoformat(unidad["ingreso_etapa"])
    falta = max(timedelta(minutes=minutos_etapa(unidad, tiempos)) - en_etapa, timedelta(0))
    for etapa in ETAPAS[ETAPAS.index(unidad["etapa"]) + 1:]:
        falta += timedelta(minutes=tiempos[(unidad["modelo"], etapa)][0])
    return ahora + falta


def retraso_unidad(unidad, ahora, tiempos, embarques):
    """Días entre la salida del embarque asignado y la del primero alcanzable."""
    llegada = llegada_a_patio(unidad, ahora, tiempos)
    alcanzable = min(
        (e for e in embarques.values() if e["mercado"] == unidad["mercado"] and e["corte_en_patio"] > llegada),
        key=lambda e: e["corte_en_patio"],
    )
    asignado = embarques[unidad["embarque_asignado"]]
    return max((alcanzable["salida"] - asignado["salida"]) / timedelta(days=1), 0)


def retraso(snapshot, tiempos, embarques):
    """Devuelve ({(modelo, mercado): días}, {(modelo, mercado): autos}): el retraso de la unidad
    más atrasada y cuántas unidades tienen retraso.
    Las unidades en patio o despacho no cuentan: su embarque ya está definido."""
    ahora = datetime.fromisoformat(snapshot["timestamp"])
    dias, autos = Counter(), Counter()
    for u in snapshot["unidades"]:
        if u["etapa"] in ETAPAS:
            clave = (u["modelo"], u["mercado"])
            d = retraso_unidad(u, ahora, tiempos, embarques)
            dias[clave] = max(dias[clave], d)
            autos[clave] += d > 0
    return dias, autos


def severidad_retraso(dias, mercado, umbrales):
    u = umbrales["retraso_dias"][mercado]
    for sev in ("critica", "alta", "media"):
        if sev in u and dias >= u[sev]:
            return sev
    return "ninguna"


def severidad_minima(sev_gap, sev_retraso):
    """La peor de las dos. Es un piso: el agente puede subirla, no bajarla."""
    return max(sev_gap, sev_retraso, key=SEVERIDADES.index)


def demorada(unidad, ahora, tiempos, umbrales):
    """Lleva en la etapa más que el estándar más la tolerancia, o está en repintado."""
    if unidad["etapa"] == "pintura" and unidad["retrabajos"] > 0:
        return True
    en_etapa = ahora - datetime.fromisoformat(unidad["ingreso_etapa"])
    limite = minutos_etapa(unidad, tiempos) + umbrales["demora"]["tolerancia_minutos"]
    return en_etapa > timedelta(minutes=limite)


def etapa_cuello(snapshot, tiempos, umbrales):
    """Devuelve {(modelo, mercado): etapa con más unidades demoradas}. Sin demoradas, no aparece."""
    ahora = datetime.fromisoformat(snapshot["timestamp"])
    demoradas = {}
    for u in snapshot["unidades"]:
        if u["etapa"] in ETAPAS and demorada(u, ahora, tiempos, umbrales):
            demoradas.setdefault((u["modelo"], u["mercado"]), Counter())[u["etapa"]] += 1
    # ponytail: en un empate gana la etapa más temprana del proceso; criterio.md no dice cuál
    return {clave: max(ETAPAS, key=c.__getitem__) for clave, c in demoradas.items()}


def evaluar(snapshot_id):
    """Las 9 combinaciones modelo × mercado de un snapshot, con todo lo que pide criterio.md."""
    plan, turnos, umbrales = leer_plan(), leer_turnos(), leer_umbrales()
    snapshot = leer_snapshot(snapshot_id)
    avance = avance_real(snapshot_id)
    retrasos, autos_atrasados = retraso(snapshot, leer_tiempos(), leer_embarques())
    cuellos = etapa_cuello(snapshot, leer_tiempos(), umbrales)

    resultado = []
    for modelo, mercado in sorted({(m, k) for _, m, k in plan}):
        unidades, pct = gap(snapshot_id, modelo, mercado, plan, turnos, avance)
        sev_gap = severidad_gap(unidades, pct, umbrales)
        dias = retrasos[(modelo, mercado)]
        sev_retraso = severidad_retraso(dias, mercado, umbrales)
        sev = severidad_minima(sev_gap, sev_retraso)
        resultado.append({
            "modelo": modelo, "mercado": mercado,
            # el gap con signo invertido; si va adelantado, 0
            "autos_faltantes": max(-unidades, 0), "autos_faltantes_pct": max(-round(pct, 1), 0),
            "severidad_por_faltantes": sev_gap,
            "autos_que_pierden_embarque": autos_atrasados[(modelo, mercado)], "dias_de_retraso": dias,
            "severidad_por_embarque": sev_retraso,
            "severidad_final": sev,
            "etapa_donde_se_traban": cuellos.get((modelo, mercado)),
        })
    return resultado


if __name__ == "__main__":
    plan = leer_plan()
    turnos = leer_turnos()
    print("S013:", plan_acumulado("S013", "SUV", "Europa", plan, turnos))
    print("S014:", plan_acumulado("S014", "SUV", "Europa", plan, turnos))

    avance = avance_real("S002")
    assert sum(avance.values()) == len({u["unidad_id"] for s in ("S001", "S002") for u in leer_snapshot(s)["liberadas"]})
    for (modelo, mercado), real in sorted(avance.items()):
        print(f"S002 {modelo}/{mercado}: real {real}, plan {plan_acumulado('S002', modelo, mercado, plan, turnos)}")

    umbrales = leer_umbrales()
    assert severidad_gap(-2, -16.7, umbrales) == "ninguna"  # bajo el mínimo de unidades
    assert severidad_gap(-3, -9.9, umbrales) == "ninguna"
    assert severidad_gap(-3, -10, umbrales) == "media"
    assert severidad_gap(-3, -25, umbrales) == "alta"
    assert severidad_gap(-5, -41.7, umbrales) == "critica"
    assert severidad_gap(4, 33, umbrales) == "ninguna"  # adelantado

    for s in ("S034", "S042"):
        avance = avance_real(s)
        for modelo, mercado in sorted(avance):
            u, pct = gap(s, modelo, mercado, plan, turnos, avance)
            if u < 0:
                print(f"{s} {modelo}/{mercado}: gap {u} ({pct:.1f}%) -> {severidad_gap(u, pct, umbrales)}")

    tiempos = leer_tiempos()
    embarques = leer_embarques()
    # El ejemplo hecho a mano: U02472 en S034 entra a patio 8/3 01:00 y llega a BRA-0308
    s034 = leer_snapshot("S034")
    u02472 = next(u for u in s034["unidades"] if u["unidad_id"] == "U02472")
    ahora = datetime.fromisoformat(s034["timestamp"])
    assert llegada_a_patio(u02472, ahora, tiempos) == datetime(2026, 3, 8, 1, 0)
    assert retraso_unidad(u02472, ahora, tiempos, embarques) == 0
    # Repintado: pintura con retrabajos usa 360 en vez de 480
    repintado = dict(u02472, etapa="pintura", retrabajos=1, ingreso_etapa="2026-03-07T22:00")
    assert llegada_a_patio(repintado, ahora, tiempos) == ahora + timedelta(minutes=360 + 540 + 180)
    assert severidad_retraso(1, "Local", umbrales) == "media"
    assert severidad_retraso(1, "Brasil", umbrales) == "alta"
    assert severidad_retraso(7, "Europa", umbrales) == "critica"
    assert severidad_retraso(0, "Europa", umbrales) == "ninguna"

    assert severidad_minima("media", "ninguna") == "media"
    assert severidad_minima("ninguna", "critica") == "critica"
    assert severidad_minima("alta", "media") == "alta"
    # U02472 lleva 15h36 en montaje (estándar 9h + 1h de tolerancia): demorada
    assert demorada(u02472, ahora, tiempos, umbrales)
    assert demorada(repintado, ahora, tiempos, umbrales)  # recién entró, pero está en repintado
    assert not demorada(dict(u02472, ingreso_etapa="2026-03-07T13:00"), ahora, tiempos, umbrales)  # 9h justas

    for i in range(1, 43):  # días 1 a 7; los días 8 a 10 (S043-S060) quedan apartados hasta la semana 5
        for c in evaluar(f"S{i:03}"):
            if c["severidad_final"] != "ninguna":
                print(f"S{i:03} {c['modelo']}/{c['mercado']}: faltan {c['autos_faltantes']:g} ({c['autos_faltantes_pct']}%) {c['severidad_por_faltantes']}"
                      f" | {c['autos_que_pierden_embarque']} pierden embarque, {c['dias_de_retraso']:g}d {c['severidad_por_embarque']}"
                      f" | => {c['severidad_final']} | se traban en {c['etapa_donde_se_traban']}")
