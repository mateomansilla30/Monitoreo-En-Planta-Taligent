import sys
from collections import Counter

import calculo
import registro

# Causas verificadas a mano, leyendo las bitácoras de los días 1 a 7.
# (combinación, foto en que se abre el caso): (categoría, etapa, bitácora que la nombra)
CAUSAS_ESPERADAS = {
    # T04: "no entraron arneses eléctricos para Sedán... La línea de montaje de Sedán quedó frenada"
    ("Sedán/Brasil", "S008"): ("faltante_de_piezas", "montaje", "T04"),
    ("Sedán/Local", "S008"): ("faltante_de_piezas", "montaje", "T04"),
    ("Sedán/Europa", "S009"): ("faltante_de_piezas", "montaje", "T04"),
    # T07: "la auditoría de homologación para Europa... retuvo en calidad las SUV de exportación"
    ("SUV/Europa", "S015"): ("retencion_de_calidad", "calidad", "T07"),
    # T09: "se separaron las carrocerías de SUV en Gris Grafito... Vuelven a la cabina de repintado"
    # (en S017 y S018 había SUV para Local y para Brasil en repintado).
    # SUV/Brasil es el caso difícil: la bitácora no nombra el mercado y cuando se abre el caso (S019) las SUV ya
    # salieron de pintura, así que el agente no ve el vínculo. Un 'no_declarada' ahí es prudente, pero no es la causa real.
    ("SUV/Local", "S017"): ("retrabajo", "pintura", "T09"),
    ("SUV/Brasil", "S019"): ("retrabajo", "pintura", "T09"),
    # T11: "calidad retuvo las pickups para el mercado local por un control de torque"
    ("Pickup/Local", "S021"): ("retencion_de_calidad", "calidad", "T11"),
    # T13: "Quedaron varias Sedán esperando al final de la línea de montaje. Logística lo está viendo." No dice por qué.
    ("Sedán/Brasil", "S026"): ("no_declarada", "montaje", None),
    # T17: "se paró la línea de montaje de Pickup por la rotura del transportador aéreo"
    ("Pickup/Brasil", "S034"): ("parada_de_linea", "montaje", "T17"),
    ("Pickup/Local", "S034"): ("parada_de_linea", "montaje", "T17"),
    ("Pickup/Europa", "S035"): ("parada_de_linea", "montaje", "T17"),
}


def causa_esperada(combinacion, abierto_en, hasta):
    """La causa que tendría que tener el caso al llegar a la foto 'hasta', o None si no está en la tabla.
    Si la bitácora que la nombra todavía no se podía leer (se lee desde el cierre de su turno), es 'no_declarada'."""
    if (combinacion, abierto_en) not in CAUSAS_ESPERADAS:
        return None
    categoria, etapa, bitacora = CAUSAS_ESPERADAS[(combinacion, abierto_en)]
    cierre = next(t["snapshot_cierre"] for t in calculo.leer_turnos() if t["turno_id"] == bitacora) if bitacora else None
    if cierre and int(cierre[1:]) > hasta:
        return "no_declarada", etapa
    return categoria, etapa


def esperado(hasta):
    """Lo que haría un agente perfecto de S001 a 'hasta', calculado sin Haiku y con un cuaderno propio en memoria."""
    cuaderno = registro.nuevo()
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

    causas_revisadas = causas_bien = 0
    for caso in haiku["casos"]:
        comb = f"{caso['modelo']}/{caso['mercado']}"
        esperada = causa_esperada(comb, caso["abierto_en"], hasta)
        if esperada is None:
            continue
        causas_revisadas += 1
        causa = caso.get("causa")
        dijo = (causa["categoria"], causa["etapa"]) if causa else None
        if dijo == esperada:
            causas_bien += 1
        elif dijo is None:
            errores.append(f"{caso['caso_id']} {comb}: quedó sin causa (esperaba {esperada[0]}, {esperada[1]})")
        else:
            errores.append(f"{caso['caso_id']} {comb}: esperaba {esperada[0]} ({esperada[1]}), Haiku dijo {dijo[0]} ({dijo[1]})")

    print(f"Evaluación de S001 a S{hasta:03}")
    print(f"  Fotos procesadas: {len(fotos) - len(faltan_fotos)} de {len(fotos)}")
    print(f"  Alertas:  {len(alertas_ok & set(alertas))} de {len(alertas_ok)} bien")
    print(f"  Informes: {len(informes_ok & set(informes))} de {len(informes_ok)} bien")
    print(f"  Causas:   {causas_bien} de {causas_revisadas} bien")
    print("\n".join(f"  ERROR: {e}" for e in errores) or "  Sin errores")
    return errores


if __name__ == "__main__":
    # python src/evaluador.py S016 → evalúa S001 a S016 (lo mismo que se le pasó al agente); sin nada → hasta S042
    evaluar(int(sys.argv[1].lstrip("Ss")) if len(sys.argv) > 1 else 42)
