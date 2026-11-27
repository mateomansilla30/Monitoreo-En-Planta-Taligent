"""Pruebas de servidor_mcp.py: las tools, llamadas como las llamaría Haiku pero sin usar la API.
Usan un cuaderno temporal, no tocan salidas/registro.json.
Correr con: python tests/test_servidor.py"""
import asyncio
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))
import registro  # noqa: E402
from fastmcp import Client  # noqa: E402
from servidor_mcp import mcp  # noqa: E402

registro.RUTA = Path(tempfile.mkdtemp()) / "registro.json"


async def probar():
    async with Client(mcp) as c:
        llamar = lambda tool, **args: c.call_tool(tool, args, raise_on_error=False)

        assert {t.name for t in await c.list_tools()} == {
            "procesar_snapshot", "registrar_alerta", "registrar_informe", "leer_bitacora", "registrar_causa",
            "subir_severidad", "levantar_subida"}

        # el criterio de cada agente lo publica el servidor como prompt MCP (Semana 4)
        assert {p.name for p in await c.list_prompts()} == {"criterio_coordinador", "criterio_lector", "criterio_redactor"}
        lector = (await c.get_prompt("criterio_lector")).messages[0].content.text
        assert "sin_fecha" in lector and "no_declarada" in lector

        # antes de la primera foto no hay ninguna bitácora escrita
        assert (await llamar("leer_bitacora", turno_id="T01")).is_error

        # S015: se abre el caso de SUV/Europa; no es cierre
        r = (await llamar("procesar_snapshot", snapshot_id="S015")).data
        assert r["cambios"] == [{"caso_id": "C001", "cambio": "abierto"}]
        assert not r["ultima_foto_del_turno"] and "novedades" not in r
        assert r["problemas"][0]["caso_id"] == "C001" and r["problemas"][0]["causa"] is None
        # caso recién abierto: buscar la causa en las 2 últimas bitácoras escritas
        assert r["buscar_causa"] == [{"caso_id": "C001", "modelo": "SUV", "mercado": "Europa", "bitacoras": ["T07", "T06"]}]

        # S015 es la mitad de T08: se puede leer hasta T07, la de T08 todavía se está escribiendo
        assert "auditoría de homologación" in (await llamar("leer_bitacora", turno_id="T07")).data
        r = await llamar("leer_bitacora", turno_id="T08")
        assert r.is_error and "hasta T07" in r.content[0].text
        assert (await llamar("leer_bitacora", turno_id="T99")).is_error  # no existe

        # registrar_causa: lo que rechaza
        causa = lambda **args: llamar("registrar_causa", caso_id="C001", etapa="calidad", **args)
        cita = "la auditoría de homologación para Europa y retuvo en calidad las SUV de exportación"  # de T07
        assert (await causa(categoria="retencion_de_calidad", bitacora="T07",
                            fragmento="la auditoría retuvo las SUV por falta de papeles")).is_error   # cita inventada
        assert (await causa(categoria="retencion_de_calidad", bitacora="T08", fragmento=cita)).is_error  # bitácora del futuro
        assert (await causa(categoria="retencion_de_calidad", bitacora="T07", fragmento="la auditoría")).is_error  # muy corta
        assert (await causa(categoria="retencion_de_calidad")).is_error                    # sin cita
        assert (await causa(categoria="no_declarada", bitacora="T07", fragmento=cita)).is_error  # no declarada con cita
        assert (await llamar("registrar_causa", caso_id="C001", categoria="no_declarada",
                             etapa="montaje")).is_error  # etapa inventada: los datos muestran calidad
        assert (await llamar("registrar_causa", caso_id="C001", categoria="retencion_de_calidad",
                             bitacora="T07", fragmento=cita)).is_error  # causa con cita pero sin etapa
        assert (await causa(categoria="otra_cosa", bitacora="T07", fragmento=cita)).is_error     # categoría que no existe
        assert (await llamar("registrar_causa", caso_id="C999", categoria="no_declarada", etapa="calidad")).is_error

        # registrar_causa: primero no declarada, después la causa con su cita (la reemplaza)
        assert not (await causa(categoria="no_declarada")).is_error
        assert registro.cargar()["casos"][0]["causa"]["categoria"] == "no_declarada"
        cita_con_saltos = "La auditoría de homologación\npara Europa y  retuvo en calidad las SUV de exportación"
        assert not (await causa(categoria="retencion_de_calidad", bitacora="T07", fragmento=cita_con_saltos)).is_error
        guardada = registro.cargar()["casos"][0]["causa"]
        assert guardada["categoria"] == "retencion_de_calidad" and guardada["bitacora"] == "T07"
        assert guardada["registrada_en"] == "S015"

        # S016: se escala y es cierre de T08, así que trae novedades y casos activos
        r = (await llamar("procesar_snapshot", snapshot_id="S016")).data
        assert r["cambios"] == [{"caso_id": "C001", "cambio": "escalado", "origen": "umbral"}]
        assert r["ultima_foto_del_turno"] and r["turno"] == "T08"
        assert [n["caso_id"] for n in r["novedades"]] == ["C001"]
        assert [c["caso_id"] for c in r["casos_activos"]] == ["C001"]
        assert r["buscar_causa"] == []                                     # C001 ya tiene causa
        assert r["problemas"][0]["causa"]["categoria"] == "retencion_de_calidad"

        # S016 es el cierre de T08: ahora sí se puede leer T08, pero no T09
        assert not (await llamar("leer_bitacora", turno_id="T08")).is_error
        assert (await llamar("leer_bitacora", turno_id="T09")).is_error

        # S016 repetida: no cambia nada ni arma otro informe
        r = (await llamar("procesar_snapshot", snapshot_id="S016")).data
        assert r["ya_procesada"] and r["cambios"] == [] and "novedades" not in r

        # avisos válidos
        assert not (await llamar("registrar_alerta", snapshot_id="S016", caso_id="C001", texto="crítica")).is_error
        assert not (await llamar("registrar_informe", snapshot_id="S016", texto="informe T08")).is_error

        # se guardan estructurados (Semana 5): los campos salen del cuaderno, no del texto
        alerta = registro.cargar()["alertas"][-1]
        assert {k: alerta[k] for k in ("snapshot_id", "caso_id", "modelo", "mercado", "tipo", "severidad", "estado", "origen")} == {
            "snapshot_id": "S016", "caso_id": "C001", "modelo": "SUV", "mercado": "Europa", "tipo": "alerta_inmediata",
            "severidad": "critica", "estado": "escalado", "origen": "umbral"}
        assert alerta["texto"] == "crítica" and alerta["causa"] == {"categoria": "retencion_de_calidad", "etapa": "calidad"}
        assert alerta["evidencia"] == [{"bitacora": "T07", "fragmento": cita_con_saltos}]  # la cita de la causa
        informe = registro.cargar()["informes"][-1]
        assert informe["turno_id"] == "T08" and [n["caso_id"] for n in informe["novedades"]] == ["C001"]
        assert informe["novedades"][0]["tipo"] == "informe_de_turno" and informe["casos_activos"][0]["caso_id"] == "C001"

        # lo que las tools rechazan
        assert (await llamar("procesar_snapshot", snapshot_id="S099")).is_error                          # foto que no existe
        assert (await llamar("registrar_alerta", snapshot_id="S016", caso_id="C999", texto="x")).is_error  # caso que no existe
        assert (await llamar("registrar_alerta", snapshot_id="S017", caso_id="C001", texto="x")).is_error  # foto no procesada
        assert (await llamar("registrar_informe", snapshot_id="S015", texto="x")).is_error                 # no es cierre

    cuaderno = registro.cargar()
    assert cuaderno["snapshots_procesados"] == ["S015", "S016"]
    assert len(cuaderno["alertas"]) == 1 and cuaderno["informes"][0]["turno"] == "T08"


async def probar_no_declarada():
    """C002 SUV/Local se abre en S017 (mitad de T09). La causa, el repintado, está recién en la bitácora T09."""
    registro.RUTA = Path(tempfile.mkdtemp()) / "registro.json"
    async with Client(mcp) as c:
        procesar = lambda s: c.call_tool("procesar_snapshot", {"snapshot_id": s})
        buscar = lambda r: {p["caso_id"]: p["bitacoras"] for p in r.data["buscar_causa"]}

        assert buscar(await procesar("S017")) == {"C001": ["T08", "T07"], "C002": ["T08", "T07"]}
        for caso, etapa in (("C001", "calidad"), ("C002", "pintura")):  # T07 y T08 no hablan de SUV/Local
            await c.call_tool("registrar_causa", {"caso_id": caso, "categoria": "no_declarada", "etapa": etapa})

        # S018 cierra T09: los no declarados se revisan solo contra la bitácora nueva
        assert buscar(await procesar("S018")) == {"C001": ["T09"], "C002": ["T09"]}
        await c.call_tool("registrar_causa", {
            "caso_id": "C002", "categoria": "retrabajo", "etapa": "pintura", "bitacora": "T09",
            "fragmento": "se separaron las carrocerías de SUV en Gris Grafito que habían salido de pintura"})

        # S019 es mitad de turno: C001 (no declarado) no se revisa porque no hay bitácora nueva;
        # solo se busca la del caso que se abre, C003 SUV/Brasil
        assert buscar(await procesar("S019")) == {"C003": ["T09", "T08"]}
        # en S019 los datos no muestran dónde se traban las SUV para Brasil: la no declarada va sin etapa
        assert (await c.call_tool("registrar_causa", {"caso_id": "C003", "categoria": "no_declarada", "etapa": "montaje"},
                                  raise_on_error=False)).is_error
        await c.call_tool("registrar_causa", {"caso_id": "C003", "categoria": "no_declarada"})

        # S020 cierra T10: C003 sigue no declarado y se revisa solo T10; C001 se resolvió y C002 ya tiene causa
        assert buscar(await procesar("S020")) == {"C003": ["T10"]}


async def probar_subida():
    """La línea de Pickup se para en T17 sin fecha de vuelta y vuelve en T19 (criterio.md §5)."""
    registro.RUTA = Path(tempfile.mkdtemp()) / "registro.json"
    async with Client(mcp) as c:
        llamar = lambda tool, **args: c.call_tool(tool, args, raise_on_error=False)
        texto = lambda r: r.content[0].text
        parada = "se paró la línea de montaje de Pickup por la rotura del transportador aéreo de la estación 3"
        sin_fecha = "por ahora no hay fecha confirmada de vuelta"

        await llamar("procesar_snapshot", snapshot_id="S033")
        r = (await llamar("procesar_snapshot", snapshot_id="S034")).data  # cierre de T17: se abren Pickup Brasil y Local
        assert r["cambios"] == [{"caso_id": "C001", "cambio": "abierto"}, {"caso_id": "C002", "cambio": "abierto"}]
        assert r["revisar_subidas"] == []  # todavía no tienen causa

        # lo que rechaza subir_severidad
        assert (await llamar("subir_severidad", caso_id="C001", bitacora="T17", fragmento=sin_fecha)).is_error  # sin causa
        for caso in ("C001", "C002"):
            await llamar("registrar_causa", caso_id=caso, categoria="parada_de_linea", etapa="montaje",
                         bitacora="T17", fragmento=parada)
        assert (await llamar("subir_severidad", caso_id="C001", bitacora="T17",
                             fragmento="no hay fecha de vuelta para nada")).is_error  # cita inventada
        assert (await llamar("levantar_subida", caso_id="C001", bitacora="T17", fragmento=parada)).is_error  # no hay subida

        # se sube: escalan los dos Pickup con esa causa, y no se puede subir dos veces
        r = await llamar("subir_severidad", caso_id="C001", bitacora="T17", fragmento=sin_fecha)
        assert not r.is_error and "C001, C002" in texto(r)
        assert "cierra el turno" in texto(r)  # S034 es cierre: le avisa que los cuente en las novedades
        assert (await llamar("subir_severidad", caso_id="C002", bitacora="T17", fragmento=sin_fecha)).is_error

        # el informe de S034 confirma las novedades con lo que escaló en esta misma foto
        await llamar("registrar_informe", snapshot_id="S034", texto="informe T17")
        informe = registro.cargar()["informes"][-1]
        assert [n["caso_id"] for n in informe["novedades"]] == ["C001", "C002"]
        # una alerta por la bitácora trae la cita de la causa y la de la subida como evidencia
        assert not (await llamar("registrar_alerta", snapshot_id="S034", caso_id="C001", texto="Pickup crítica")).is_error
        alerta = registro.cargar()["alertas"][-1]
        assert alerta["origen"] == "agente" and [e["bitacora"] for e in alerta["evidencia"]] == ["T17", "T17"]
        assert alerta["evidencia"][1]["fragmento"] == sin_fecha
        assert registro.buscar_caso(registro.cargar(), "C001")["ultimo_informe"] == {"estado": "escalado", "severidad": "critica"}

        # S035: se abre Pickup/Europa; al recibir la misma causa, escala por la subida vigente
        r = (await llamar("procesar_snapshot", snapshot_id="S035")).data
        assert {"caso_id": "C003", "cambio": "abierto"} in r["cambios"]
        r = await llamar("registrar_causa", caso_id="C003", categoria="parada_de_linea", etapa="montaje",
                         bitacora="T17", fragmento=parada)
        assert "C003" in texto(r) and "Escalan" in texto(r)

        # S036 cierra T18: sin alertas repetidas; los tres se revisan contra T18 con la subida vigente
        r = (await llamar("procesar_snapshot", snapshot_id="S036")).data
        assert not any(k["cambio"] == "escalado" for k in r["cambios"])
        assert [n["caso_id"] for n in r["novedades"]] == ["C003"]  # C001 y C002 ya se informaron escalados en S034
        assert [(s["caso_id"], s["subida_vigente"], s["bitacora"]) for s in r["revisar_subidas"]] == [
            ("C001", True, "T18"), ("C002", True, "T18"), ("C003", True, "T18")]

        # T19 todavía no se puede leer en S037; en S038 (cierre de T19) sí, y se levanta la subida
        await llamar("procesar_snapshot", snapshot_id="S037")
        volvio = "la línea de montaje de Pickup volvió a las 10:00"
        assert (await llamar("levantar_subida", caso_id="C001", bitacora="T19", fragmento=volvio)).is_error
        await llamar("procesar_snapshot", snapshot_id="S038")
        assert not (await llamar("levantar_subida", caso_id="C001", bitacora="T19", fragmento=volvio)).is_error

    cuaderno = registro.cargar()
    assert [(s["subida_en"], s["levantada_en"]) for s in cuaderno["subidas"]] == [("S034", "S038")]
    assert [(k["caso_id"], k["escalado_por"], k["alerta_enviada_en"]) for k in cuaderno["casos"]] == [
        ("C001", "agente", "S034"), ("C002", "agente", "S034"), ("C003", "agente", "S035")]


asyncio.run(probar())
asyncio.run(probar_no_declarada())
asyncio.run(probar_subida())
print("ok")
