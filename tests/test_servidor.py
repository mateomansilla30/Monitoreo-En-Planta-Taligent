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
            "procesar_snapshot", "registrar_alerta", "registrar_informe", "leer_bitacora", "registrar_causa"}

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
        assert r["cambios"] == [{"caso_id": "C001", "cambio": "escalado"}]
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
        await c.call_tool("registrar_causa", {"caso_id": "C003", "categoria": "no_declarada", "etapa": "pintura"})

        # S020 cierra T10: C003 sigue no declarado y se revisa solo T10; C001 se resolvió y C002 ya tiene causa
        assert buscar(await procesar("S020")) == {"C003": ["T10"]}


asyncio.run(probar())
asyncio.run(probar_no_declarada())
print("ok")
