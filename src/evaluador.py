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
    # Días 8 a 10, anotados a mano antes de correrlos con Haiku (sin tocar el agente).
    # T23: "La línea de montaje de SUV estuvo parada de 14:30 a 18:30" (y "Quedó reparada": no se sube)
    ("SUV/Brasil", "S046"): ("parada_de_linea", "montaje", "T23"),
    ("SUV/Europa", "S046"): ("parada_de_linea", "montaje", "T23"),
    ("SUV/Local", "S046"): ("parada_de_linea", "montaje", "T23"),
    # T28: "faltan neumáticos rodado 18 para la SUV de versión local" (con fecha de entrega: no se sube)
    ("SUV/Local", "S056"): ("faltante_de_piezas", "montaje", "T28"),
    # T29: "faltaron nueve operarios en la línea de montaje de Sedán"
    ("Sedán/Brasil", "S058"): ("ausentismo", "montaje", "T29"),
    ("Sedán/Local", "S058"): ("ausentismo", "montaje", "T29"),
}

# Subidas de severidad verificadas a mano (criterio.md §5): la bitácora dice que la causa sigue sin fecha.
# No se sube: C004 (T08: "El auditor vuelve mañana a primera hora") ni el repintado (T09: "se estiman seis horas").
SUBIDAS_ESPERADAS = [
    {"modelo": "Pickup", "categoria": "parada_de_linea", "etapa": "montaje",
     "bitacora": "T17", "fragmento": "por ahora no hay fecha confirmada de vuelta",
     "bitacora_fin": "T19", "fragmento_fin": "la línea de montaje de Pickup volvió a las 10:00"},
]


def cierre_de(turno_id):
    return next(t["snapshot_cierre"] for t in calculo.leer_turnos() if t["turno_id"] == turno_id)


def causa_esperada(combinacion, abierto_en, hasta):
    """La causa que tendría que tener el caso al llegar a la foto 'hasta', o None si no está en la tabla.
    Si la bitácora que la nombra todavía no se podía leer (se lee desde el cierre de su turno), es 'no_declarada'."""
    if (combinacion, abierto_en) not in CAUSAS_ESPERADAS:
        return None
    categoria, etapa, bitacora = CAUSAS_ESPERADAS[(combinacion, abierto_en)]
    if bitacora and int(cierre_de(bitacora)[1:]) > hasta:
        return "no_declarada", etapa
    return categoria, etapa


def agente_perfecto(hasta):
    """El cuaderno que dejaría un agente perfecto de S001 a 'hasta', sin Haiku: las reglas del código,
    más las causas y las subidas verificadas a mano. Contra esto se compara lo que hizo Haiku."""
    cuaderno = registro.nuevo()
    cierres = {t["snapshot_cierre"] for t in calculo.leer_turnos()}
    for i in range(1, hasta + 1):
        s = f"S{i:03}"
        problemas = [c for c in calculo.evaluar(s) if c["severidad_final"] != "ninguna"]
        cambios = registro.procesar_snapshot(cuaderno, s, problemas)
        for caso in cuaderno["casos"]:  # la causa que corresponde, con lo que ya se puede leer
            esperada = caso["estado"] != "resuelto" and causa_esperada(combinacion(cuaderno, caso["caso_id"]), caso["abierto_en"], i)
            if esperada:
                caso["causa"] = {"categoria": esperada[0], "etapa": esperada[1]}
        cambios += registro.aplicar_subidas(cuaderno, s)
        for sub in SUBIDAS_ESPERADAS:
            if s == cierre_de(sub["bitacora"]):
                caso = next(c for c in cuaderno["casos"] if c["estado"] != "resuelto" and c["modelo"] == sub["modelo"]
                            and c["causa"] and (c["causa"]["categoria"], c["causa"]["etapa"]) == (sub["categoria"], sub["etapa"]))
                cambios += registro.subir(cuaderno, caso, sub["bitacora"], sub["fragmento"], s)
            if s == cierre_de(sub["bitacora_fin"]):
                vigente = next(v for v in cuaderno["subidas"] if v["modelo"] == sub["modelo"] and v["levantada_en"] is None)
                registro.levantar(vigente, sub["bitacora_fin"], sub["fragmento_fin"], s)
        cuaderno["alertas"] += [{"snapshot_id": s, "caso_id": c["caso_id"]} for c in cambios if c["cambio"] == "escalado"]
        if s in cierres:
            cuaderno["informes"].append({"snapshot_id": s})
    return cuaderno


def combinacion(cuaderno, caso_id):
    # se compara por combinación y no por caso_id: si Haiku se saltea una foto, los números de caso pueden no coincidir
    caso = registro.buscar_caso(cuaderno, caso_id)
    return f"{caso['modelo']}/{caso['mercado']}" if caso else f"caso inexistente {caso_id}"


def subidas(cuaderno):
    return {(s["modelo"], s["categoria"], s["etapa"], s["subida_en"], s["levantada_en"]) for s in cuaderno.get("subidas", [])}


def evaluar(hasta):
    perfecto = agente_perfecto(hasta)
    haiku = registro.cargar()
    fotos = [f"S{i:03}" for i in range(1, hasta + 1)]
    alertas_ok = {(a["snapshot_id"], combinacion(perfecto, a["caso_id"])) for a in perfecto["alertas"]}
    informes_ok = {i["snapshot_id"] for i in perfecto["informes"]}
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

    describir = lambda s: f"{s[0]} {s[1]} ({s[2]}), subida en {s[3]}, " + (f"levantada en {s[4]}" if s[4] else "sin levantar")
    subidas_ok, subidas_haiku = subidas(perfecto), subidas(haiku)
    errores += [f"faltó la subida de severidad: {describir(s)}" for s in sorted(subidas_ok - subidas_haiku, key=str)]
    errores += [f"subida de severidad de más: {describir(s)}" for s in sorted(subidas_haiku - subidas_ok, key=str)]

    print(f"Evaluación de S001 a S{hasta:03}")
    print(f"  Fotos procesadas: {len(fotos) - len(faltan_fotos)} de {len(fotos)}")
    print(f"  Alertas:  {len(alertas_ok & set(alertas))} de {len(alertas_ok)} bien")
    print(f"  Informes: {len(informes_ok & set(informes))} de {len(informes_ok)} bien")
    print(f"  Causas:   {causas_bien} de {causas_revisadas} bien")
    print(f"  Subidas:  {len(subidas_ok & subidas_haiku)} de {len(subidas_ok)} bien")
    print("\n".join(f"  ERROR: {e}" for e in errores) or "  Sin errores")
    return errores


if __name__ == "__main__":
    # python src/evaluador.py S042 → evalúa S001 a S042 (lo mismo que se le pasó al agente); sin nada → hasta S060
    evaluar(int(sys.argv[1].lstrip("Ss")) if len(sys.argv) > 1 else 60)
