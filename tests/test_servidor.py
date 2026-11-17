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

        assert {t.name for t in await c.list_tools()} == {"procesar_snapshot", "registrar_alerta", "registrar_informe"}

        # S015: se abre el caso de SUV/Europa; no es cierre
        r = (await llamar("procesar_snapshot", snapshot_id="S015")).data
        assert r["cambios"] == [{"caso_id": "C001", "cambio": "abierto"}]
        assert not r["ultima_foto_del_turno"] and "novedades" not in r

        # S016: se escala y es cierre de T08, así que trae novedades y casos activos
        r = (await llamar("procesar_snapshot", snapshot_id="S016")).data
        assert r["cambios"] == [{"caso_id": "C001", "cambio": "escalado"}]
        assert r["ultima_foto_del_turno"] and r["turno"] == "T08"
        assert [n["caso_id"] for n in r["novedades"]] == ["C001"]
        assert [c["caso_id"] for c in r["casos_activos"]] == ["C001"]

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


asyncio.run(probar())
print("ok")
