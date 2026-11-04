import sys
from collections import Counter

import calculo
import registro


def esperado(hasta):
    """Lo que haría un agente perfecto de S001 a 'hasta', calculado sin Haiku y con un cuaderno propio en memoria."""
    cuaderno = {"snapshots_procesados": [], "casos": [], "alertas": [], "informes": []}
    cierres = {t["snapshot_cierre"] for t in calculo.leer_turnos()}
    fotos = [f"S{i:03}" for i in range(1, hasta + 1)]
    alertas, informes = set(), set()
    for s in fotos:
        problemas = [c for c in calculo.evaluar(s) if c["severidad_final"] != "ninguna"]
        for cambio in registro.procesar_snapshot(cuaderno, s, problemas):
            if cambio["cambio"] == "escalado":
                alertas.add((s, combinacion(cuaderno, cambio["caso_id"])))
        if s in cierres:
            informes.add(s)
    return fotos, alertas, informes


def combinacion(cuaderno, caso_id):
    # se compara por combinación y no por caso_id: si Haiku se saltea una foto, los números de caso pueden no coincidir
    caso = next((c for c in cuaderno["casos"] if c["caso_id"] == caso_id), None)
    return f"{caso['modelo']}/{caso['mercado']}" if caso else f"caso inexistente {caso_id}"


def evaluar(hasta):
    fotos, alertas_ok, informes_ok = esperado(hasta)
    haiku = registro.cargar()
    alertas = Counter((a["snapshot_id"], combinacion(haiku, a["caso_id"])) for a in haiku["alertas"])
    informes = Counter(i["snapshot_id"] for i in haiku["informes"])
    errores = []

    faltan_fotos = [s for s in fotos if s not in haiku["snapshots_procesados"]]
    errores += [f"no procesó {s}" for s in faltan_fotos]

    errores += [f"faltó la alerta de {comb} en {s}" for s, comb in sorted(alertas_ok - set(alertas))]
    errores += [f"alerta de más: {comb} en {s}" for s, comb in sorted(set(alertas) - alertas_ok)]
    errores += [f"alerta repetida: {comb} en {s} ({n} veces)" for (s, comb), n in sorted(alertas.items()) if n > 1]

    errores += [f"faltó el informe de {s}" for s in sorted(informes_ok - set(informes))]
    errores += [f"informe de más en {s}" for s in sorted(set(informes) - informes_ok)]
    errores += [f"informe repetido en {s} ({n} veces)" for s, n in sorted(informes.items()) if n > 1]

    print(f"Evaluación de S001 a S{hasta:03}")
    print(f"  Fotos procesadas: {len(fotos) - len(faltan_fotos)} de {len(fotos)}")
    print(f"  Alertas:  {len(alertas_ok & set(alertas))} de {len(alertas_ok)} bien")
    print(f"  Informes: {len(informes_ok & set(informes))} de {len(informes_ok)} bien")
    print("\n".join(f"  ❌ {e}" for e in errores) or "  ✅ sin errores")
    return errores


if __name__ == "__main__":
    # python src/evaluador.py S016 → evalúa S001 a S016 (lo mismo que se le pasó al agente); sin nada → hasta S042
    evaluar(int(sys.argv[1].lstrip("Ss")) if len(sys.argv) > 1 else 42)
