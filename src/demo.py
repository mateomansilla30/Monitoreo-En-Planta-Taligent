"""Servidor de la demo: le da los datos al front (front/) y arranca el agente en vivo.

    python src/demo.py      → abre http://127.0.0.1:8765 (antes: cd front && npm install && npm run build)

En desarrollo, el front corre aparte (cd front && npm run dev) y le pide /api a este servidor.
Escucha solo en esta compu (127.0.0.1)."""
import json
import os
import re
import subprocess
import sys
import webbrowser
from functools import lru_cache
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import calculo
import evaluador
import registro
from agente import ULTIMA_FOTO, llegadas

RAIZ = Path(__file__).resolve().parent.parent
GUARDADA = registro.RUTA                # salidas/registro.json: la última corrida completa
DEMO = RAIZ / "salidas" / "demo"        # la corrida en vivo va aparte, así no pisa la guardada
FRONT = RAIZ / "front" / "dist"
PUERTO = 8765

corrida = {"proceso": None, "hasta": None}
notas = {}  # la nota del evaluador por cuaderno, mientras el archivo no cambie


def leer_json(ruta, si_no_hay=None):
    try:
        return json.loads(Path(ruta).read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):  # todavía no existe, o el agente lo está escribiendo
        return si_no_hay


@lru_cache
def serie():
    """Lo que dicen las cuentas del código en cada foto, para las 9 combinaciones. No usa el modelo."""
    turnos, plan = calculo.leer_turnos(), calculo.leer_plan()
    cierres = {t["snapshot_cierre"] for t in turnos}
    fotos = []
    for i in range(1, ULTIMA_FOTO + 1):
        s = f"S{i:03}"
        hora = calculo.leer_snapshot(s)["timestamp"]
        real = calculo.avance_real(s)  # autos que salieron de calidad desde S001
        fotos.append({
            "id": s, "hora": hora, "turno": calculo.turno_de(s, turnos), "cierre": s in cierres,
            "combinaciones": {f"{c['modelo']}/{c['mercado']}": {
                "severidad": c["severidad_final"], "faltantes": c["autos_faltantes"], "pct": c["autos_faltantes_pct"],
                "pierden_embarque": c["autos_que_pierden_embarque"], "dias_de_retraso": c["dias_de_retraso"],
                "etapa": c["etapa_donde_se_traban"],
                # plan acumulado contra lo que salió de verdad, desde S001 hasta esta foto
                "plan": calculo.plan_acumulado(s, c["modelo"], c["mercado"], plan, turnos),
                "real": real[(c["modelo"], c["mercado"])]} for c in calculo.evaluar(s)},
        })
    return {"fotos": fotos, "llegadas": llegadas(ULTIMA_FOTO)}


def nota(ruta, cuaderno):
    """La nota del evaluador para el cuaderno, hasta la última foto que procesó."""
    if not cuaderno or not cuaderno["snapshots_procesados"]:
        return None
    clave = (str(ruta), Path(ruta).stat().st_mtime)
    if clave not in notas:
        hasta = max(int(s[1:]) for s in cuaderno["snapshots_procesados"])
        notas[clave] = {"hasta": f"S{hasta:03}", **evaluador.resultado(hasta, cuaderno)}
    return notas[clave]


def guardada():
    cuaderno = leer_json(GUARDADA)
    return {"registro": cuaderno, "resumen": leer_json(GUARDADA.with_name("resumen.json")),
            "evaluacion": nota(GUARDADA, cuaderno)}


def eventos_desde(desde):
    """Los eventos de la corrida en vivo a partir del número 'desde'. La última línea puede estar a medio escribir."""
    try:
        texto = (DEMO / "eventos.jsonl").read_text(encoding="utf-8")
    except FileNotFoundError:
        return [], 0
    lineas = texto.split("\n")[:-1]  # lo que viene después del último salto de línea todavía no está completo
    return [json.loads(linea) for linea in lineas[desde:]], len(lineas)


def vivo(desde):
    proceso = corrida["proceso"]
    eventos, total = eventos_desde(desde)
    return {"corriendo": proceso is not None and proceso.poll() is None,
            "codigo": None if proceso is None else proceso.poll(),
            "hasta": corrida["hasta"], "eventos": eventos, "total": total,
            "registro": leer_json(DEMO / "registro.json")}


def correr(hasta):
    """Arranca el agente de S001 a 'hasta' en otro proceso, con su propio cuaderno y su archivo de eventos."""
    if corrida["proceso"] is not None and corrida["proceso"].poll() is None:
        return False
    DEMO.mkdir(parents=True, exist_ok=True)
    for nombre in ("eventos.jsonl", "registro.json", "resumen.json"):
        (DEMO / nombre).unlink(missing_ok=True)
    entorno = {**os.environ, "REGISTRO": str(DEMO / "registro.json"), "EVENTOS": str(DEMO / "eventos.jsonl"),
               "PYTHONIOENCODING": "utf-8"}
    salida = open(DEMO / "corrida.txt", "w", encoding="utf-8")  # lo que imprime el agente, por si algo falla
    corrida["proceso"] = subprocess.Popen([sys.executable, str(RAIZ / "src" / "agente.py"), f"S{hasta:03}"],
                                          cwd=RAIZ, env=entorno, stdout=salida, stderr=subprocess.STDOUT)
    corrida["hasta"] = f"S{hasta:03}"
    return True


def parar():
    if corrida["proceso"] is not None and corrida["proceso"].poll() is None:
        corrida["proceso"].terminate()


class Manejador(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(FRONT), **kwargs)

    def log_message(self, *args):
        pass  # sin una línea por pedido: el front pregunta cada segundo

    def responder(self, datos, codigo=200):
        cuerpo = json.dumps(datos, ensure_ascii=False).encode("utf-8")
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(cuerpo)))
        self.end_headers()
        self.wfile.write(cuerpo)

    def do_GET(self):
        url = urlparse(self.path)
        if url.path.startswith("/api/"):
            return self.api(url)
        if not FRONT.exists():
            return self.responder({"error": "Falta armar el front: cd front && npm install && npm run build"}, 503)
        if not (FRONT / url.path.lstrip("/")).is_file():
            self.path = "/index.html"  # el front tiene una sola página
        super().do_GET()

    def do_POST(self):
        url = urlparse(self.path)
        try:
            largo = int(self.headers.get("Content-Length") or 0)
            datos = json.loads(self.rfile.read(largo) or b"{}")
            if url.path == "/api/correr":
                hasta = int(datos.get("hasta", 38))
                if not 1 <= hasta <= ULTIMA_FOTO:
                    return self.responder({"error": f"hasta tiene que estar entre 1 y {ULTIMA_FOTO}"}, 400)
                if not correr(hasta):
                    return self.responder({"error": "Ya hay una corrida en marcha"}, 409)
                return self.responder({"ok": True, "hasta": corrida["hasta"]})
            if url.path == "/api/parar":
                parar()
                return self.responder({"ok": True})
            self.responder({"error": "No existe"}, 404)
        except (ValueError, TypeError) as e:
            self.responder({"error": str(e)}, 400)

    def api(self, url):
        try:
            if url.path == "/api/serie":
                return self.responder(serie())
            if url.path == "/api/guardada":
                return self.responder(guardada())
            if url.path == "/api/vivo":
                desde = int(parse_qs(url.query).get("desde", ["0"])[0])
                return self.responder(vivo(desde))
            m = re.fullmatch(r"/api/bitacora/(T\d{2})", url.path)
            if m:
                ruta = calculo.DATA / "bitacoras" / f"{m[1]}.txt"
                if ruta.exists():
                    return self.responder({"turno_id": m[1], "texto": ruta.read_text(encoding="utf-8")})
            self.responder({"error": "No existe"}, 404)
        except Exception as e:  # que el front muestre el error en vez de quedarse esperando
            self.responder({"error": f"{type(e).__name__}: {e}"}, 500)


if __name__ == "__main__":
    servidor = ThreadingHTTPServer(("127.0.0.1", PUERTO), Manejador)
    print(f"Demo en http://127.0.0.1:{PUERTO}  (Ctrl+C para cortar)")
    if FRONT.exists():
        webbrowser.open(f"http://127.0.0.1:{PUERTO}")
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        parar()
