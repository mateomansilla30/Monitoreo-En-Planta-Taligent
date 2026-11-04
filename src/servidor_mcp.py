import re

from fastmcp import FastMCP
from fastmcp.exceptions import ToolError

import calculo
import registro

mcp = FastMCP("Monitoreo planta")

@mcp.tool()
def procesar_snapshot(snapshot_id: str) -> dict:
    """Procesa una foto nueva de la planta: calcula los problemas y los anota en el cuaderno de casos.
    Usala una vez por cada snapshot que llega, en orden, antes de decidir si avisar algo.
    snapshot_id es el nombre de la foto, por ejemplo 'S016'.

    En 'problemas' vienen SOLO las combinaciones modelo × mercado con desvío (severidad media o más).
    Las combinaciones que no aparecen están bien. Si la lista viene vacía, no hay
    ningún problema en esa foto.
    En 'cambios' viene lo que cambió en el cuaderno con esta foto: casos 'abierto', 'escalado'
    o 'resuelto'. Un 'escalado' significa que en esta foto hay que mandar una alerta.
    Si la foto ya se había procesado, 'ya_procesada' es true y 'cambios' viene vacío.
    Si 'ultima_foto_del_turno' es true, en esta foto toca armar el informe del turno, y además
    viene 'casos_activos': todos los casos del cuaderno que no están resueltos."""
    
    if not re.fullmatch(r"S\d{3}", snapshot_id) or not (calculo.DATA / "snapshots" / f"{snapshot_id}.json").exists():
        raise ToolError(f"La foto '{snapshot_id}' no existe. Los nombres válidos van de 'S001' a 'S060'.")
    turnos = calculo.leer_turnos()
    snapshot = calculo.leer_snapshot(snapshot_id)
    turno = calculo.turno_de(snapshot_id, turnos)
    cierre = any(t["snapshot_cierre"] == snapshot_id for t in turnos)
    problemas = [c for c in calculo.evaluar(snapshot_id) if c["severidad_final"] != "ninguna"]
    cuaderno = registro.cargar()
    ya_procesada = snapshot_id in cuaderno["snapshots_procesados"]
    cambios = registro.procesar_snapshot(cuaderno, snapshot_id, problemas)
    registro.guardar(cuaderno)
    respuesta = {
        "snapshot_id": snapshot_id,
        "hora": snapshot["timestamp"],
        "turno": turno,
        "ultima_foto_del_turno": cierre,
        "ya_procesada": ya_procesada,
        "problemas": problemas,
        "cambios": cambios,
    }
    if cierre:
        respuesta["casos_activos"] = [c for c in cuaderno["casos"] if c["estado"] != "resuelto"]
    return respuesta


def cuaderno_con_foto(snapshot_id):
    cuaderno = registro.cargar()
    if snapshot_id not in cuaderno["snapshots_procesados"]:
        raise ToolError(f"La foto '{snapshot_id}' todavía no se procesó. Llamá primero a procesar_snapshot.")
    return cuaderno


@mcp.tool()
def registrar_alerta(snapshot_id: str, caso_id: str, texto: str) -> str:
    """Manda una alerta inmediata. Usala cuando procesar_snapshot trae un cambio 'escalado':
    una alerta por caso, en esa misma foto. Lo que no registres acá, no se avisó.
    snapshot_id es la foto en la que avisás, por ejemplo 'S016'. caso_id es el que vino en 'cambios'.
    texto es la alerta completa, con los números que la justifican (autos faltantes, días de retraso, etapa)."""
    cuaderno = cuaderno_con_foto(snapshot_id)
    if not any(c["caso_id"] == caso_id for c in cuaderno["casos"]):
        raise ToolError(f"El caso '{caso_id}' no existe. Usá el caso_id que vino en 'cambios'.")
    cuaderno["alertas"].append({"snapshot_id": snapshot_id, "caso_id": caso_id, "texto": texto})
    registro.guardar(cuaderno)
    return f"Alerta guardada ({caso_id}, {snapshot_id})."


@mcp.tool()
def registrar_informe(snapshot_id: str, texto: str) -> str:
    """Guarda el informe de cierre de turno. Usalo cuando procesar_snapshot trae
    'ultima_foto_del_turno' en true: uno por turno, en esa misma foto. Lo que no registres acá, no se avisó.
    snapshot_id es la foto de cierre, por ejemplo 'S016'.
    texto es el informe completo: las novedades del turno y la tabla de casos activos."""
    cuaderno = cuaderno_con_foto(snapshot_id)
    turnos = calculo.leer_turnos()
    if not any(t["snapshot_cierre"] == snapshot_id for t in turnos):
        raise ToolError(f"'{snapshot_id}' no es la última foto de su turno. El informe va solo en el cierre.")
    turno = calculo.turno_de(snapshot_id, turnos)
    cuaderno["informes"].append({"snapshot_id": snapshot_id, "turno": turno, "texto": texto})
    registro.guardar(cuaderno)
    return f"Informe guardado ({turno}, {snapshot_id})."


if __name__ == "__main__":
    mcp.run()
