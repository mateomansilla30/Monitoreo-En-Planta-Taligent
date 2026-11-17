# Monitoreo en planta

Proyecto final del Spring AI Camp. Un monitor que sigue el avance de la Planta Las Acacias (3 modelos × 3 mercados) foto por foto, detecta los desvíos contra el plan, lleva un registro de casos y decide qué avisar y cuándo: una **alerta inmediata** cuando un caso se vuelve crítico y un **informe** al cierre de cada turno.

Corre con la API de Anthropic y Claude Haiku 5.5 (`claude-haiku-5-5`), con tools de un servidor MCP propio.

## Cómo se corre

```
pip install -r requirements.txt
```

Crear un archivo `.env` en la raíz con la key (ver `.env.example`):

```
ANTHROPIC_API_KEY=...
```

Correr el agente y después el evaluador, con la misma foto final:

```
python src/agente.py           # todas las llegadas hasta S042 (días 1 a 7)
python src/evaluador.py

python src/agente.py S016      # solo hasta S016
python src/evaluador.py S016
```

El agente imprime foto por foto qué encontró, qué cambió en el cuaderno y qué escribió Haiku, y al final el tiempo, los tokens y el costo. El cuaderno queda en `salidas/registro.json`.

Para ver solo las cuentas, sin el modelo: `python src/calculo.py S036` muestra los desvíos de esa foto.

En Windows, si los acentos salen mal: `$env:PYTHONIOENCODING="utf-8"` (PowerShell) o `set PYTHONIOENCODING=utf-8` (cmd).

## Pruebas

Están en `tests/`, una por archivo de `src/`. No usan la API ni tocan `salidas/registro.json`, y cada una imprime `ok` si pasa:

```
python tests/test_calculo.py      # las cuentas, con ejemplos verificados a mano
python tests/test_registro.py     # el ciclo de un caso y las novedades del informe
python tests/test_servidor.py     # las tools: lo que devuelven y lo que rechazan
python tests/test_evaluador.py    # que el evaluador encuentre los errores de un agente
```

## Cómo está armado

```
agente.py ──"llegó S016"──► Haiku
    ▲                          │ pide tools
    │                          ▼
    └──── resultado ◄──── servidor_mcp.py ──► calculo.py
                               │
                               ▼
                         registro.py → salidas/registro.json

evaluador.py → compara lo que avisó Haiku con lo que tendría que haber avisado
```

| Archivo | Qué hace |
|---|---|
| `src/calculo.py` | Las cuentas de `criterio.md`: gap contra el plan, retraso contra el embarque alcanzable, severidad mínima y etapa cuello. Ver `docs/M1.md`. |
| `src/registro.py` | El cuaderno de casos: abre, sigue, escala y resuelve casos; salta fotos repetidas; arma las novedades de cada informe. |
| `src/servidor_mcp.py` | Servidor MCP (FastMCP, stdio) con 3 tools. |
| `src/agente.py` | El loop con Haiku: recorre las llegadas de `llegadas.csv` en orden. |
| `src/evaluador.py` | Le pone nota a una corrida. |
| `tests/` | Las pruebas de cada archivo. |
| `docs/M1.md` | Explicación de las cuentas, con ejemplos. |

### Las tools

| Tool | Cuándo la usa Haiku | Qué rechaza |
|---|---|---|
| `procesar_snapshot(snapshot_id)` | En cada foto. Devuelve los problemas, los cambios en el cuaderno y, en el cierre de turno, las novedades y los casos activos. | Una foto que no existe. |
| `registrar_alerta(snapshot_id, caso_id, texto)` | Cuando un caso se escala. | Una foto no procesada o un caso que no existe. |
| `registrar_informe(snapshot_id, texto)` | En la última foto del turno. | Una foto no procesada o que no es cierre. |

## Decisiones de diseño

**Lo que tiene reglas fijas lo hace el código; el modelo decide qué tool usar y redacta.** Las cuentas, el ciclo de un caso y qué es novedad están escritos como reglas en `criterio.md`, así que los aplica el código, que no se equivoca ni inventa. Haiku es un modelo chico y barato: lo que no tiene que decidir, no se lo dejamos decidir. Al modelo le queda lo que el código no puede hacer: redactar los avisos y, desde la Semana 2, leer las bitácoras.

**El registro de casos vive fuera del modelo.** Es un archivo JSON (`salidas/registro.json`) con las fotos procesadas, los casos, las alertas y los informes. Cada foto es una conversación nueva con Haiku: no hace falta que recuerde nada porque la memoria es el cuaderno. Eso mantiene cada request chico y barato.

**Una sola tool por foto para procesar.** `procesar_snapshot` calcula y anota en el cuaderno en el mismo paso. Si fueran dos tools, el modelo podría mirar una foto sin anotarla, o anotarla dos veces.

**Las tools validan con código.** Una alerta de un caso que no existe o un informe fuera del cierre de turno se rechazan con un error que el modelo lee y puede corregir.

**Una foto repetida se procesa una sola vez.** El cuaderno guarda qué fotos ya pasaron; si llega otra vez (S034 llega dos veces en `llegadas.csv`), no cambia nada y la tool avisa `ya_procesada`.

**Las novedades las arma el código.** En el cierre, `registro.cerrar_turno` compara cada caso con cómo estaba en el informe anterior (con `abierto` y `en_seguimiento` como el mismo estado) y guarda la severidad máxima del turno, para no perder un pico que subió y bajó entre dos cierres. Lo que no cambió no se vuelve a nombrar.

**El evaluador calcula lo esperado por su cuenta.** Recorre las mismas fotos con un cuaderno propio en memoria, sin Haiku, y compara: fotos no procesadas, alertas que faltan, sobran o se repiten, informes que faltan o se repiten. No se compara contra el cuaderno que dejó el agente: si Haiku se salteara una foto, ese cuaderno quedaría mal y el error no se vería. Las alertas se comparan por combinación, no por número de caso.

**Decisiones chicas donde el criterio no dice nada:**
- Etapa cuello: si dos etapas empatan, gana la que viene primero en el proceso.
- Los umbrales se leen como "desde": un gap de exactamente 10 % ya es media.

**Días apartados.** Los días 8 a 10 (S043–S060) no se usan hasta la Semana 5: el agente no los deja correr.

## Resultados

Corrida de las 43 llegadas hasta S042 (días 1 a 7, con S034 dos veces):

| | |
|---|---|
| Casos | 11: los Sedán de los días 2–3 y del día 5, los SUV de los días 3–4 y la caída de Pickup en los tres mercados en los días 6–7 |
| Alertas | 4: SUV/Europa en S016 (4 autos pierden el buque, 7 días) y Pickup Brasil, Local y Europa en S036 |
| Informes | 21, uno por turno; 8 sin novedades |
| S034 repetida | Se procesó una sola vez: la segunda llegada no cambió nada ni generó avisos |
| Evaluador | 42/42 fotos, 4/4 alertas, 21/21 informes, sin errores |
| Tiempo y costo | 2,7 min · 241.001 tokens de entrada y 21.406 de salida · USD 0,035 |

## Lo que falta

- **Semana 2 (M3):** la causa de cada caso desde la bitácora, con el fragmento citado, y subir la severidad cuando la causa sigue sin fecha de resolución.
- **Semanas 3 a 5:** varios agentes con uno solo que escribe en el registro, hooks, criterio como prompt MCP, salida estructurada, caché y los días 8 a 10.
- **Evaluador:** todavía no revisa el texto de los avisos ni mide el ruido (novedades que repiten algo ya informado).
