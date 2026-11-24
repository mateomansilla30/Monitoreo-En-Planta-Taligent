"""Pruebas del servidor de la demo (src/demo.py) y de los eventos que anota el agente, sin usar la API.
Correr con: python tests/test_demo.py"""
import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))
import agente  # noqa: E402
import demo  # noqa: E402

carpeta = Path(tempfile.mkdtemp())
demo.DEMO = carpeta  # la corrida en vivo de la prueba va a una carpeta temporal

# el agente anota cada paso como una línea JSON, solo si se le dio el archivo
agente.EVENTOS = None
agente.evento("llegada", snapshot_id="S001")
assert not (carpeta / "eventos.jsonl").exists()
agente.EVENTOS = str(carpeta / "eventos.jsonl")
agente.evento("llegada", snapshot_id="S001", orden=1, total=2)
agente.evento("tool", agente="lector", nombre="leer_bitacora", datos={"turno_id": "T17"}, texto="…", error=False)

# el servidor devuelve los eventos completos y desde el número que se le pide
eventos, total = demo.eventos_desde(0)
assert total == 2 and [e["tipo"] for e in eventos] == ["llegada", "tool"]
assert eventos[1]["datos"]["turno_id"] == "T17"
assert demo.eventos_desde(1)[0][0]["nombre"] == "leer_bitacora"

# una línea a medio escribir (el agente la está anotando) no se lee hasta que esté completa
with open(carpeta / "eventos.jsonl", "a", encoding="utf-8") as f:
    f.write('{"tipo": "lleg')
eventos, total = demo.eventos_desde(0)
assert total == 2 and len(eventos) == 2

# sin corrida, el estado en vivo viene vacío y sin cuaderno
assert demo.leer_json(carpeta / "no_existe.json") is None
v = demo.vivo(0)
assert v["corriendo"] is False and v["registro"] is None

json.loads((carpeta / "eventos.jsonl").read_text(encoding="utf-8").split("\n")[0])
print("ok")
