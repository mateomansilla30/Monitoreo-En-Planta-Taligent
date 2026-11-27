"""Pruebas de agente.py sin usar la API: lo que puede usar cada agente, los hooks del loop y los mensajes que arma
el código para el lector y el redactor. Usan un cuaderno temporal, no tocan salidas/registro.json.
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
        # sin cliente de la API: nada llega a Haiku. El criterio de cada agente se lo pide al servidor MCP
        agentes = agente.Agentes(None, c, await c.list_tools(), await agente.leer_criterios(c))

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


async def probar_hooks():
    async with Client(mcp) as c:
        agentes = agente.Agentes(None, c, await c.list_tools(), await agente.leer_criterios(c))
        # el criterio llega desde el servidor MCP, como prompt
        assert "Sos el coordinador" in agentes.criterios["coordinador"] and "sin_fecha" in agentes.criterios["lector"]
        alerta = lambda **d: agentes.ejecutar("coordinador", pedido("registrar_alerta", **d))
        informe = lambda **d: agentes.ejecutar("coordinador", pedido("registrar_informe", **d))

        # S016: C004 SUV/Europa escaló por los números y todavía no tiene alerta ni informe
        cuaderno = evaluador.agente_perfecto(16)
        cuaderno["alertas"] = [a for a in cuaderno["alertas"] if a["snapshot_id"] != "S016"]
        cuaderno["informes"] = [i for i in cuaderno["informes"] if i["snapshot_id"] != "S016"]
        registro.guardar(cuaderno)
        agentes.nueva_foto("S016")

        # al terminar: no lo deja terminar sin la alerta ni sin el informe del cierre
        assert "no tienen alerta: C004" in agentes.al_terminar()

        # hook_alerta: fuera de la foto que llegó, y después repetida
        texto, es_error = await alerta(snapshot_id="S015", caso_id="C004", texto="x")
        assert es_error and "foto que llegó (S016)" in texto
        texto, es_error = await alerta(snapshot_id="S016", caso_id="C004", texto="ALERTA · C004 SUV/Europa pasó a crítica")
        assert not es_error  # pasa los hooks y el servidor la valida y la guarda estructurada
        texto, es_error = await alerta(snapshot_id="S016", caso_id="C004", texto="otra vez")
        assert es_error and "Aviso repetido: C004 ya tuvo su alerta en S016" in texto

        # al terminar: ahora falta el informe
        assert "falta el informe" in agentes.al_terminar()

        # hook_informe: le falta un caso activo; después, completo; después, repetido
        novedades, activos = registro.cerrar_turno(registro.cargar(), confirmar=False)
        todos = " ".join(dict.fromkeys(x["caso_id"] for x in novedades + activos))
        texto, es_error = await informe(snapshot_id="S016", texto="Informe sin casos")
        assert es_error and "C004" in texto and "Al informe le faltan" in texto
        texto, es_error = await informe(snapshot_id="S016", texto=f"Informe T08: {todos}")
        assert not es_error
        texto, es_error = await informe(snapshot_id="S016", texto=f"Informe T08: {todos}")
        assert es_error and "ya está registrado" in texto
        assert agentes.al_terminar() is None  # ya no falta nada

        # hook_alerta: una severidad menor que crítica no lleva alerta
        cuaderno = evaluador.agente_perfecto(17)  # C005 SUV/Local se abre en S017 con severidad media
        c005 = registro.buscar_caso(cuaderno, "C005")
        c005["alerta_enviada_en"] = "S017"  # como si el modelo creyera que escaló
        registro.guardar(cuaderno)
        texto, es_error = await alerta(snapshot_id="S017", caso_id="C005", texto="x")
        assert es_error and "la alerta es solo para un caso crítico" in texto and "media" in texto

        # al terminar: la foto que llegó no se procesó
        agentes.nueva_foto("S018")
        assert "No procesaste la foto S018" in agentes.al_terminar()

        # una foto repetida no pide alerta ni informe de nuevo
        agentes.nueva_foto("S016")
        agentes.foto["repetida"] = True
        registro.guardar(evaluador.agente_perfecto(16) | {"alertas": [], "informes": []})
        assert agentes.al_terminar() is None

        # el hook de después anota cada tool usada en la foto
        assert agentes.foto["tools"] == [] and len([t for t in agentes.foto["tools"]]) == 0
        await agentes.ejecutar("coordinador", pedido("procesar_snapshot", snapshot_id="S016"))
        assert agentes.foto["tools"][-1] == {"agente": "coordinador", "tool": "procesar_snapshot", "error": False}


def probar_esquema_lector():
    # la salida estructurada del lector: todos los campos obligatorios y sin campos de más
    e = agente.ESQUEMA_LECTOR
    assert set(e["required"]) == set(e["properties"]) and e["additionalProperties"] is False
    assert "no_declarada" in e["properties"]["categoria"]["enum"]
    assert e["properties"]["estado"]["enum"] == ["sin_fecha", "con_fecha", "resuelta", "no_dice"]


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
asyncio.run(probar_hooks())
probar_esquema_lector()
probar_mensajes()
print("ok")
