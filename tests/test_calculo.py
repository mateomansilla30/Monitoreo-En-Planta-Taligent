"""Pruebas de calculo.py: las cuentas de criterio.md, con casos verificados a mano.
Correr con: python tests/test_calculo.py"""
import sys
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))
from calculo import *  # noqa: E402,F403

umbrales = leer_umbrales()
tiempos = leer_tiempos()
embarques = leer_embarques()

# avance real: una unidad que aparece en dos snapshots se cuenta una vez
avance = avance_real("S002")
assert sum(avance.values()) == len({u["unidad_id"] for s in ("S001", "S002") for u in leer_snapshot(s)["liberadas"]})

# severidad por gap: hacen falta 3 autos de atraso y los umbrales se leen "desde"
assert severidad_gap(-2, -16.7, umbrales) == "ninguna"  # menos de 3 autos, aunque el % sea alto
assert severidad_gap(-3, -9.9, umbrales) == "ninguna"
assert severidad_gap(-3, -10, umbrales) == "media"      # 10 % justo ya es media
assert severidad_gap(-3, -25, umbrales) == "alta"
assert severidad_gap(-5, -41.7, umbrales) == "critica"
assert severidad_gap(4, 33, umbrales) == "ninguna"      # adelantado

# el ejemplo de docs/M1.md: U02472 en S034 lleva 15h36 en montaje, entra a patio el 8/3 a la 01:00 y llega a su camión
s034 = leer_snapshot("S034")
u02472 = next(u for u in s034["unidades"] if u["unidad_id"] == "U02472")
ahora = datetime.fromisoformat(s034["timestamp"])
assert llegada_a_patio(u02472, ahora, tiempos) == datetime(2026, 3, 8, 1, 0)
assert retraso_unidad(u02472, ahora, tiempos, embarques) == 0

# repintado: pintura con retrabajos tarda 6 h en vez de 8
repintado = dict(u02472, etapa="pintura", retrabajos=1, ingreso_etapa="2026-03-07T22:00")
assert llegada_a_patio(repintado, ahora, tiempos) == ahora + timedelta(minutes=360 + 540 + 180)

# severidad por retraso: cada mercado tiene sus umbrales
assert severidad_retraso(1, "Local", umbrales) == "media"
assert severidad_retraso(1, "Brasil", umbrales) == "alta"   # Brasil no tiene media
assert severidad_retraso(7, "Europa", umbrales) == "critica"
assert severidad_retraso(0, "Europa", umbrales) == "ninguna"

# severidad final: la peor de las dos
assert severidad_minima("media", "ninguna") == "media"
assert severidad_minima("ninguna", "critica") == "critica"
assert severidad_minima("alta", "media") == "alta"

# demorada: más que el estándar + 1 h de tolerancia, o en repintado
assert demorada(u02472, ahora, tiempos, umbrales)                  # 15h36 en montaje, el límite es 10 h
assert demorada(repintado, ahora, tiempos, umbrales)               # recién entró, pero está en repintado
assert not demorada(dict(u02472, ingreso_etapa="2026-03-07T13:00"), ahora, tiempos, umbrales)  # 9 h justas

# dos fotos completas que revisamos a mano
suv_europa = next(c for c in evaluar("S016") if (c["modelo"], c["mercado"]) == ("SUV", "Europa"))
assert suv_europa["autos_que_pierden_embarque"] == 4 and suv_europa["dias_de_retraso"] == 7
assert suv_europa["severidad_final"] == "critica" and suv_europa["etapa_donde_se_traban"] == "calidad"

pickup_brasil = next(c for c in evaluar("S036") if (c["modelo"], c["mercado"]) == ("Pickup", "Brasil"))
assert pickup_brasil["autos_faltantes"] == 15 and pickup_brasil["autos_faltantes_pct"] == 50.0
assert pickup_brasil["autos_que_pierden_embarque"] == 10 and pickup_brasil["dias_de_retraso"] == 1
assert pickup_brasil["severidad_final"] == "critica" and pickup_brasil["etapa_donde_se_traban"] == "montaje"

assert all(c["severidad_final"] == "ninguna" for c in evaluar("S001"))  # el primer día arranca sin problemas

print("ok")
