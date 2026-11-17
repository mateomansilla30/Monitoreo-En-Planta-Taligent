import asyncio
import csv
import sys
import time
from collections import Counter
from pathlib import Path

import anthropic
from dotenv import load_dotenv
from fastmcp import Client

import calculo
import registro

MODELO = "claude-haiku-5-5"
PRECIO_POR_MILLON = {"input_tokens": 0.10, "output_tokens": 0.50}  # USD, Haiku 5.5 con prompts de menos de 100K tokens
SERVIDOR = Path(__file__).resolve().parent / "servidor_mcp.py"
uso = Counter()  # tokens gastados en la corrida

SISTEMA = """Sos el monitor de la planta Las Acacias. Cada 4 horas llega una foto (snapshot) y la procesás.

Por cada foto:
1. Llamá a procesar_snapshot con el nombre de la foto. Si 'ya_procesada' es true, la foto llegó repetida:
   no avises nada.
2. Por cada cambio 'escalado' en 'cambios', registrá una alerta con registrar_alerta.
3. Si 'ultima_foto_del_turno' es true, registrá el informe del turno con registrar_informe. El informe tiene
   dos partes: las novedades (solo lo que viene en 'novedades'; si viene vacía, decí que no hubo novedades)
   y la tabla de 'casos_activos'. De cada caso informá la severidad actual y la máxima del turno.
4. Si no pasa nada de eso, no avises nada.

Usá solo los números que te devuelve procesar_snapshot; no inventes datos ni causas."""


def mostrar(pedido, r):
    """Imprime qué pidió Haiku y qué pasó, para seguir la corrida foto por foto."""
    if r.is_error:
        print(f"  {pedido.name} -> ERROR: {r.content[0].text}")
    elif pedido.name == "procesar_snapshot":
        d = r.data
        if d["ya_procesada"]:
            print("  foto repetida: ya se había procesado, el cuaderno no cambia")
            return
        problemas =[f"{p['modelo']}/{p['mercado']} {p['severidad_final']}" for p in d["problemas"]]
        cambios = [f"{c['caso_id']} {c['cambio']}" for c in d["cambios"]]
        print(f"  {d['hora']} turno {d['turno']}{' (CIERRE)' if d['ultima_foto_del_turno'] else ''}")
        print(f"  problemas: {', '.join(problemas) or 'ninguno'}")
        print(f"  cambios en el cuaderno: {', '.join(cambios) or 'ninguno'}")
        if "novedades" in d:
            novedades = [f"{n['caso_id']} {n['estado']} (máx. {n['severidad_maxima']})" for n in d["novedades"]]
            print(f"  novedades del turno: {', '.join(novedades) or 'ninguna'}")
    else:
        print(f"  Haiku -> {pedido.name}({pedido.input.get('caso_id', '')}):")
        print("    " + pedido.input["texto"].replace("\n", "\n    "))


async def procesar_foto(claude, mcp, tools, snapshot_id):
    """Una conversación nueva por foto: lo que hay que recordar está en el cuaderno, no en el modelo."""
    messages = [{"role": "user", "content": f"Llegó la foto {snapshot_id}."}]
    while True:
        response = await claude.messages.create(
            model=MODELO, max_tokens=16000, system=SISTEMA, tools=tools, messages=messages
        )
        messages.append({"role": "assistant", "content": response.content})
        uso.update({k: getattr(response.usage, k) for k in PRECIO_POR_MILLON})
        if response.stop_reason != "tool_use":
            if response.stop_reason != "end_turn":
                print(f"  (cortó por {response.stop_reason})")
            return
        resultados = []
        for b in response.content:
            if b.type == "tool_use":
                r = await mcp.call_tool(b.name, b.input, raise_on_error=False)
                mostrar(b, r)
                resultados.append({"type": "tool_result", "tool_use_id": b.id,
                                   "content": r.content[0].text, "is_error": r.is_error})
        messages.append({"role": "user", "content": resultados})


ULTIMA_FOTO = 42  # días 1 a 7; S043–S060 (días 8 a 10) quedan apartados hasta la Semana 5


def llegadas(hasta):
    """Las fotos en el orden en que llegan según llegadas.csv, hasta la foto 'hasta'. S034 llega dos veces."""
    with open(calculo.DATA / "snapshots" / "llegadas.csv", encoding="utf-8-sig") as f:
        return [fila["snapshot_id"] for fila in csv.DictReader(f) if int(fila["snapshot_id"][1:]) <= hasta]


async def correr(hasta=ULTIMA_FOTO):
    if not 1 <= hasta <= ULTIMA_FOTO:
        raise SystemExit(f"La última foto tiene que estar entre S001 y S{ULTIMA_FOTO:03}.")
    registro.RUTA.unlink(missing_ok=True)  # cuaderno vacío al empezar la serie
    claude = anthropic.AsyncAnthropic()
    inicio = time.time()
    async with Client(str(SERVIDOR)) as mcp:
        tools = [{"name": t.name, "description": t.description, "input_schema": t.inputSchema}
                 for t in await mcp.list_tools()]
        for orden, snapshot_id in enumerate(llegadas(hasta), start=1):
            print(f"{snapshot_id} (llegada {orden})")
            await procesar_foto(claude, mcp, tools, snapshot_id)
    minutos = (time.time() - inicio) / 60

    cuaderno = registro.cargar()
    print("\nCasos:")
    for c in cuaderno["casos"]:
        print(f"  {c['caso_id']} {c['modelo']}/{c['mercado']}: {c['estado']} (abierto en {c['abierto_en']})")
    print("\nAlertas:")
    for a in cuaderno["alertas"]:
        print(f"  [{a['snapshot_id']}] {a['caso_id']}: {a['texto']}")
    print("\nInformes:")
    for inf in cuaderno["informes"]:
        print(f"  [{inf['snapshot_id']} {inf['turno']}] {inf['texto']}\n")

    costo = sum(uso[k] * precio / 1_000_000 for k, precio in PRECIO_POR_MILLON.items())
    print(f"Tiempo: {minutos:.1f} min · Tokens: {uso['input_tokens']:,} de entrada, "
          f"{uso['output_tokens']:,} de salida · Costo: USD {costo:.4f}")


if __name__ == "__main__":
    load_dotenv()
    # python src/agente.py S016 → corre S001 a S016; sin nada → hasta S042
    asyncio.run(correr(int(sys.argv[1].lstrip("Ss")) if len(sys.argv) > 1 else ULTIMA_FOTO))
