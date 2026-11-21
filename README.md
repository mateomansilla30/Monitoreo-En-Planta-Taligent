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
python src/agente.py           # las 61 llegadas, los 10 días (S001 a S060)
python src/evaluador.py

python src/agente.py S042      # solo hasta S042 (días 1 a 7)
python src/evaluador.py S042
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
| `src/servidor_mcp.py` | Servidor MCP (FastMCP, stdio) con 7 tools. |
| `src/agente.py` | El loop con Haiku: recorre las llegadas de `llegadas.csv` en orden. |
| `src/evaluador.py` | Le pone nota a una corrida. |
| `tests/` | Las pruebas de cada archivo. |
| `docs/M1.md` | Explicación de las cuentas, con ejemplos. |

### Las tools

| Tool | Cuándo la usa Haiku | Qué rechaza |
|---|---|---|
| `procesar_snapshot(snapshot_id)` | En cada foto. Devuelve los problemas, los cambios en el cuaderno, a qué casos buscarles causa (`buscar_causa`) y, en el cierre de turno, las novedades, los casos activos y qué revisar de las subidas (`revisar_subidas`). | Una foto que no existe. |
| `leer_bitacora(turno_id)` | Para buscar la causa de un caso. | Una bitácora que todavía no está escrita: la de un turno se lee desde su foto de cierre. |
| `registrar_causa(caso_id, categoria, etapa, bitacora, fragmento)` | Cuando encontró la causa, o `no_declarada` si ninguna bitácora la nombra. | Una cita que no está en la bitácora, una bitácora del futuro, una `no_declarada` con cita o con una etapa distinta de la que muestran los datos. |
| `subir_severidad(caso_id, bitacora, fragmento)` | Cuando la bitácora dice que la causa sigue sin fecha de resolución. | Un caso sin causa, una cita inventada, una causa ya subida. |
| `levantar_subida(caso_id, bitacora, fragmento)` | Cuando una bitácora posterior dice que la causa se resolvió. | Un caso sin subida vigente, una cita inventada. |
| `registrar_alerta(snapshot_id, caso_id, texto)` | Cuando un caso se escala. | Una foto no procesada o un caso que no existe. |
| `registrar_informe(snapshot_id, texto)` | En la última foto del turno. | Una foto no procesada o que no es cierre. |

## Decisiones de diseño

**Lo que tiene reglas fijas lo hace el código; el modelo decide qué tool usar y redacta.** Las cuentas, el ciclo de un caso y qué es novedad están escritos como reglas en `criterio.md`, así que los aplica el código, que no se equivoca ni inventa. Haiku es un modelo chico y barato: lo que no tiene que decidir, no se lo dejamos decidir. Al modelo le queda lo que el código no puede hacer: redactar los avisos y, desde la Semana 2, leer las bitácoras.

**El registro de casos vive fuera del modelo.** Es un archivo JSON (`salidas/registro.json`) con las fotos procesadas, los casos, las alertas y los informes. Cada foto es una conversación nueva con Haiku: no hace falta que recuerde nada porque la memoria es el cuaderno. Eso mantiene cada request chico y barato.

**Una sola tool por foto para procesar.** `procesar_snapshot` calcula y anota en el cuaderno en el mismo paso. Si fueran dos tools, el modelo podría mirar una foto sin anotarla, o anotarla dos veces.

**Las tools validan con código.** Una alerta de un caso que no existe o un informe fuera del cierre de turno se rechazan con un error que el modelo lee y puede corregir.

**Una foto repetida se procesa una sola vez.** El cuaderno guarda qué fotos ya pasaron; si llega otra vez (S034 llega dos veces en `llegadas.csv`), no cambia nada y la tool avisa `ya_procesada`.

**Las novedades las arma el código.** En el cierre, `registro.cerrar_turno` compara cada caso con cómo estaba en el informe anterior (con `abierto` y `en_seguimiento` como el mismo estado) y guarda la severidad máxima del turno, para no perder un pico que subió y bajó entre dos cierres. Lo que no cambió no se vuelve a nombrar.

**La causa la lee el modelo, pero el código decide qué leer y verifica la cita.** `procesar_snapshot` le dice a Haiku a qué casos buscarles causa y en qué bitácoras: a un caso nuevo, las dos últimas escritas; a uno `no_declarada`, solo la bitácora nueva de cada cierre. Así cada bitácora se lee una vez por caso. La bitácora de un turno recién se puede leer en su foto de cierre: antes el supervisor la está escribiendo, y leerla sería saber el futuro. Una alerta a mitad de turno sale igual, con la causa que se pueda citar hasta ahí. `registrar_causa` rechaza cualquier fragmento que no esté tal cual en la bitácora, así que el modelo no puede inventar una cita, y en una `no_declarada` solo acepta la etapa que muestran los datos.

**La subida de severidad es una decisión del modelo, pero sus efectos los aplica el código.** Haiku decide si la bitácora dice que la causa sigue sin fecha (eso es leer texto) y lo justifica con una cita verificada. Desde ahí el cuaderno lleva el caso a crítica, lo escala con origen `agente`, no lo deja resolverse mientras la subida esté vigente y la aplica a los casos del mismo modelo que reciben la misma causa. La subida termina cuando una bitácora posterior dice que se resolvió.

**Las novedades del informe se confirman al registrarlo.** `procesar_snapshot` le muestra al modelo las novedades del cierre, pero recién `registrar_informe` las anota como informadas. Así cuenta lo que escaló en la misma foto de cierre por una subida.

**El evaluador compara contra un agente perfecto.** `agente_perfecto` recorre las mismas fotos con un cuaderno propio, sin Haiku: las reglas del código más las causas y la subida verificadas a mano leyendo las bitácoras (`CAUSAS_ESPERADAS`, `SUBIDAS_ESPERADAS`). Compara fotos no procesadas, alertas que faltan, sobran o se repiten, informes, causas y subidas. No se compara contra el cuaderno que dejó el agente: si Haiku se salteara una foto, ese cuaderno quedaría mal y el error no se vería. Las alertas se comparan por combinación, no por número de caso.

**Decisiones chicas donde el criterio no dice nada:**
- Etapa cuello: si dos etapas empatan, gana la que viene primero en el proceso.
- Los umbrales se leen como "desde": un gap de exactamente 10 % ya es media.
- Una subida alcanza a los casos del mismo modelo con la misma causa (categoría y etapa): la línea de montaje de Pickup parada afecta a Pickup en los tres mercados.

**Días apartados.** Los días 8 a 10 (S043–S060) quedaron afuera mientras se armaba el agente: todo se ajustó con los días 1 a 7. Sus causas se anotaron a mano en el evaluador antes de correrlos, y se corrieron una sola vez, sin tocar el agente. Así miden si anda con datos que nunca vio.

## Resultados

Corrida de las 61 llegadas (10 días, S034 llega dos veces), 19/11/2026:

| | Días 1 a 7 (con los que se ajustó) | Días 8 a 10 (nunca vistos) |
|---|---|---|
| Fotos | 42 de 42 | 18 de 18 |
| Alertas | 4 de 4: SUV/Europa en S016; Pickup Brasil y Local en S034 y Europa en S035, por la bitácora T17 ("por ahora no hay fecha confirmada de vuelta"), antes de que los números los volvieran críticos en S036 | 1 de 1: SUV/Local en S058, por los números (faltan neumáticos) |
| Informes | 21 de 21 | 9 de 9 |
| Causas | 10 de 11 | 6 de 6 |
| Subida de severidad | 1 de 1: Pickup desde S034 (T17), levantada en S038 (T19, "la línea de montaje de Pickup volvió a las 10:00") | Ninguna, y era lo correcto: los neumáticos tienen fecha de entrega y la parada de SUV "Quedó reparada" |

- **Total:** 17 casos, 5 alertas, 30 informes (10 sin novedades). La foto repetida S034 se procesó una sola vez.
- **Tiempo y costo:** 5,4 min · 1.071.374 tokens de entrada y 55.088 de salida · **USD 0,13** por los 10 días.
- **La causa que falla es C006 SUV/Brasil.** La bitácora T09 habla del repintado de "SUV" sin decir el mercado, y cuando se abre el caso (S019) los datos ya no muestran etapa cuello. Haiku pone `no_declarada`, que es prudente. La tabla a mano dice `retrabajo` porque en S017–S018 había SUV para Brasil en repintado.
- **Ruido que no cambia nada:**
  - Haiku a veces procesa una foto dos veces (S024).
  - Intenta subir o levantar la misma causa en cada Pickup, y la tool lo rechaza porque ya está hecho.
  - A veces nombra como novedad un caso que no cambió.

Los registros completos de las dos corridas quedan en `salidas/corrida_S042.txt` y `salidas/corrida_S060.txt` (no están en git).

## Lo que falta

- **Semanas 3 a 5:** varios agentes con uno solo que escribe en el registro, hooks, criterio como prompt MCP, salida estructurada y caché.
- **Evaluador:** todavía no revisa el texto de los avisos ni mide el ruido (novedades que repiten algo ya informado).
