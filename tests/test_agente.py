"""Pruebas de agente.py sin usar la API: lo que puede usar cada agente y los mensajes que arma el código
para el lector y el redactor. Usan un cuaderno temporal, no tocan salidas/registro.json.
Correr con: python tests/test_agente.py"""
import asyncio
import json
import sys
import tempfile
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))
import agente  # noqa: E402
import evaluador  # noqa: E402
import registro  # noqa: E402
from fastmcp import Client  # noqa: E402
from servidor_mcp import mcp  # noqa: E402

registro.RUTA = Path(tempfile.mkdtemp()) / "registro.json"


def pedido(nombre, **datos):
    """Lo que manda Haiku cuando pide una tool."""
    return SimpleNamespace(name=nombre, input=datos, id="prueba")


async def probar_permisos():
    async with Client(mcp) as c:
        agentes = agente.Agentes(None, c, await c.list_tools())  # sin cliente de la API: nada llega a Haiku

        # cada agente recibe solo sus tools
        nombres = {a: [t["name"] for t in tools] for a, tools in agentes.tools.items()}
        assert nombres["lector"] == ["leer_bitacora"]
        assert nombres["redactor"] == []
        assert "leer_bitacora" not in nombres["coordinador"]
        assert {"procesar_snapshot", "registrar_causa", "pedir_causa", "pedir_texto"} <= set(nombres["coordinador"])

        # el código frena lo que no está en la lista del agente, aunque el modelo lo pida
        texto, es_error = await agentes.ejecutar("lector", pedido("registrar_causa", caso_id="C001", categoria="no_declarada"))
        assert es_error and "no puede usar registrar_causa" in texto
        texto, es_error = await agentes.ejecutar("redactor", pedido("leer_bitacora", turno_id="T01"))
        assert es_error and "no puede usar leer_bitacora" in texto
        texto, es_error = await agentes.ejecutar("coordinador", pedido("leer_bitacora", turno_id="T01"))
        assert es_error and "no puede usar leer_bitacora" in texto
        texto, es_error = await agentes.ejecutar("lector", pedido("pedir_causa", caso_id="C001", bitacoras=["T01"]))
        assert es_error and "no puede usar pedir_causa" in texto

        # lo que sí puede, va al servidor MCP
        texto, es_error = await agentes.ejecutar("coordinador", pedido("procesar_snapshot", snapshot_id="S001"))
        assert not es_error and json.loads(texto)["snapshot_id"] == "S001"

        # pedir_causa y pedir_texto revisan el pedido antes de armar un agente
        assert (await agentes.ejecutar("coordinador", pedido("pedir_causa", caso_id="C999", bitacoras=["T01"])))[1]
        texto, es_error = await agentes.ejecutar("coordinador", pedido("pedir_texto", tipo="informe"))
        assert es_error and "no es la última foto" in texto  # S001 es la mitad del turno T01
        texto, es_error = await agentes.ejecutar("coordinador", pedido("pedir_texto", tipo="alerta", caso_id="C001"))
        assert es_error and "no escaló en esta foto" in texto
        assert (await agentes.ejecutar("coordinador", pedido("pedir_texto", tipo="otra_cosa")))[1]

        # una sola alerta por caso: C004 escaló en S016; en S017 sigue escalado, pero no lleva otra
        registro.guardar(evaluador.agente_perfecto(17))
        texto, es_error = await agentes.ejecutar("coordinador", pedido("pedir_texto", tipo="alerta", caso_id="C004"))
        assert es_error and "no escaló en esta foto" in texto
        registro.guardar(evaluador.agente_perfecto(16))  # en S016 sí escaló, pero su alerta ya está anotada
        texto, es_error = await agentes.ejecutar("coordinador", pedido("pedir_texto", tipo="alerta", caso_id="C004"))
        assert es_error and "ya está registrada" in texto


def probar_mensajes():
    # el cuaderno en S034: C009 Pickup/Brasil escaló por la subida de T17 (los números solo daban media)
    cuaderno = evaluador.agente_perfecto(34)
    c009 = registro.buscar_caso(cuaderno, "C009")
    c009["causa"].update(bitacora="T17", fragmento="se paró la línea de montaje de Pickup por la rotura del transportador aéreo")

    m = agente.mensaje_lector(cuaderno, c009, ["T18"])
    assert "C009: Pickup para Brasil" in m and "se traban en: montaje" in m
    # ya tiene causa: el lector la ve con su cita y contesta solo el estado (en S018 mezcló C004 con el repintado)
    assert 'Causa registrada: parada_de_linea en montaje, bitácora T17: "se paró la línea' in m
    assert "Severidad subida" in m and "no busques otra" in m and "T18" in m
    c009_sin_causa = dict(c009, causa=None)
    assert "Buscá la causa" in agente.mensaje_lector(cuaderno, c009_sin_causa, ["T17"])

    m = agente.mensaje_alerta(cuaderno, c009)
    assert "Foto S034" in m and "turno T17" in m and "severidad critica" in m
    assert "Escaló por la bitácora" in m and "por ahora no hay fecha confirmada de vuelta" in m
    assert "autos faltantes contra el plan: 5 (16.7 %), severidad media" in m and "transportador aéreo" in m

    m = agente.mensaje_informe(cuaderno)
    novedades, activos = m.split("Casos activos:")
    assert "C009 · Pickup/Brasil: escalado" in novedades and "C010 · Pickup/Local: escalado" in novedades
    assert "C009" in activos and "C010" in activos and "C001" not in activos  # C001 ya se resolvió

    # una causa no declarada se nombra como tal, sin cita
    c010 = registro.buscar_caso(cuaderno, "C010")
    c010["causa"] = {"categoria": "no_declarada", "etapa": "montaje"}
    assert "no declarada en las bitácoras" in agente.describir_causa(cuaderno, c010)
    c010["causa"] = {"categoria": "no_declarada", "etapa": None}  # C006 en S019: sin etapa cuello
    assert "no muestran en qué etapa" in agente.describir_causa(cuaderno, c010)

    # la propuesta del lector se resume en una línea, aunque venga con texto alrededor
    resumen = agente.resumir_propuesta('```json\n{"categoria": "parada_de_linea", "etapa": "montaje", "bitacora": "T17", '
                                       '"fragmento": "se paró la línea", "estado": "sin_fecha", '
                                       '"fragmento_estado": "por ahora no hay fecha"}\n```')
    assert resumen == 'parada_de_linea (montaje), T17: "se paró la línea" · estado sin_fecha: "por ahora no hay fecha"'


asyncio.run(probar_permisos())
probar_mensajes()
print("ok")
