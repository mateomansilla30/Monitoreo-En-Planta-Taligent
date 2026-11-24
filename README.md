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

El agente imprime foto por foto qué encontró, qué cambió en el cuaderno, qué le pidió el coordinador a cada agente y qué quedó registrado. Al final imprime el costo de cada agente y el tiempo, los tokens y el costo total. El cuaderno queda en `salidas/registro.json`.

Para ver solo las cuentas, sin el modelo: `python src/calculo.py S036` muestra los desvíos de esa foto.

En Windows, si los acentos salen mal: `$env:PYTHONIOENCODING="utf-8"` (PowerShell) o `set PYTHONIOENCODING=utf-8` (cmd).

## La demo

Un front para presentar en vivo, en `front/`. Está hecho con React y Tailwind, con un diseño claro y sobrio: el color queda solo para la severidad. Los componentes vienen de 21st.dev: el Animated Beam de Magic UI para los conectores del diagrama, un Number Ticker y el Stepper de Origin UI. Lo sirve `src/demo.py`, un servidor chico en Python, solo con la librería estándar. Le da al front los datos y arranca el agente en vivo.

La primera vez hay que armar el front (necesita Node):

```
cd front
npm install
npm run build
```

Después, para presentar, un solo comando:

```
python src/demo.py        # abre http://127.0.0.1:8765
```

Tiene siete partes, una idea por pantalla. Se pasa de una a otra con las flechas ← →, Re Pág / Av Pág (el puntero de presentación) o los números 1 a 7. Las flechas ↑ ↓ bajan y suben dentro de una parte:

1. **El problema:** la planta y sus etapas, la información que hay, qué es un atraso (con dos ejemplos reales), cómo se sigue un caso, qué hay que avisar y por qué es difícil.
2. **Qué resuelve:** los tres tipos de aviso y las 60 fotos de los 10 días pintadas según la severidad que calcula el código, con las alertas marcadas.
3. **Cómo funciona:** los tres agentes, qué hace el código y qué el modelo, y las tools de cada agente.
4. **En vivo:** el botón para correr el agente hasta S016, S036, S038 o los 10 días. Se ve:
   - la planta foto por foto;
   - lo que hace cada agente;
   - lo que rechaza el código;
   - el costo;
   - cada alerta cuando sale.
5. **Traza:** en qué foto salió una alerta, por qué escaló y la frase de la bitácora que la respalda. Arranca en la de Pickup/Brasil en S034, 8 horas antes de que los números llegaran a crítica (S036).
6. **Resultados:** la nota del evaluador, el costo de uno contra tres agentes, la causa que falla (C006) y los días 8 a 10.
7. **Avisos:** las alertas y los informes completos, para las preguntas.

**De dónde sale cada parte:**
- La corrida en vivo usa su propio cuaderno, en `salidas/demo/`, así no pisa la de los 10 días.
- La traza, los resultados y los avisos salen de la última serie completa: `salidas/registro.json` y `salidas/resumen.json`.
- Mientras el agente corre, el indicador de arriba a la derecha muestra en todas las partes por qué foto va y cuánto lleva gastado. Así se puede arrancar la corrida al principio y seguir presentando.

**Para cambiar el front:** `python src/demo.py` en una terminal y `cd front && npm run dev` en otra. El front queda en http://127.0.0.1:5173 y se actualiza solo con cada cambio.

## Pruebas

Están en `tests/`, una por archivo de `src/`. No usan la API ni tocan `salidas/registro.json`, y cada una imprime `ok` si pasa:

```
python tests/test_calculo.py      # las cuentas, con ejemplos verificados a mano
python tests/test_registro.py     # el ciclo de un caso y las novedades del informe
python tests/test_servidor.py     # las tools: lo que devuelven y lo que rechazan
python tests/test_evaluador.py    # que el evaluador encuentre los errores de un agente
python tests/test_agente.py       # lo que puede usar cada agente y los datos que les arma el código
python tests/test_demo.py         # los eventos de la corrida en vivo que lee el front
```

## Cómo está armado

```
agente.py, una vez por foto:

"llegó S034" ──► coordinador ── procesar_snapshot, registrar_* ──► servidor_mcp.py ──► calculo.py
                  │        │                                           │  ▲
      pedir_causa │        │ pedir_texto                               ▼  │
                  ▼        ▼                               registro.py → salidas/registro.json
               lector    redactor (sin tools)                             │
                  │                                                       │
                  └──────────────────── leer_bitacora ────────────────────┘

evaluador.py → compara lo que avisó Haiku con lo que tendría que haber avisado
```

| Archivo | Qué hace |
|---|---|
| `src/calculo.py` | Las cuentas de `criterio.md`: gap contra el plan, retraso contra el embarque alcanzable, severidad mínima y etapa cuello. Ver `docs/M1.md`. |
| `src/registro.py` | El cuaderno de casos: abre, sigue, escala y resuelve casos; salta fotos repetidas; arma las novedades de cada informe. |
| `src/servidor_mcp.py` | Servidor MCP (FastMCP, stdio) con 7 tools. |
| `src/agente.py` | Los tres agentes (coordinador, lector y redactor) y la serie: recorre las llegadas de `llegadas.csv` en orden. |
| `src/evaluador.py` | Le pone nota a una corrida. |
| `src/demo.py` | El servidor de la demo: datos para el front y la corrida en vivo. |
| `front/` | El front de la demo (React + Tailwind, con componentes de 21st.dev). |
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

## Varios agentes

Cada foto la trabajan tres agentes, en `src/agente.py`. Los tres son Haiku 5.5: los distingue el prompt, las tools que reciben y el mensaje con el que arrancan.

| Agente | Qué hace | Tools que puede usar | ¿Escribe en el cuaderno? |
|---|---|---|---|
| **Coordinador** | Uno por foto. Procesa la foto, decide qué pedir y a quién, y anota todo. | `procesar_snapshot`, `registrar_causa`, `subir_severidad`, `levantar_subida`, `registrar_alerta`, `registrar_informe`, `pedir_causa`, `pedir_texto` | Sí, es el único |
| **Lector** | Lee las bitácoras de un caso y propone la causa, con su cita, y en qué estado está: sigue sin fecha de resolución (`sin_fecha`), tiene fecha (`con_fecha`), se resolvió (`resuelta`) o la bitácora no dice (`no_dice`). | `leer_bitacora` | No: devuelve un JSON |
| **Redactor** | Escribe una alerta o un informe. | Ninguna | No: devuelve el texto |

**Cómo se hablan.** El coordinador pide ayuda con dos tools que no están en el servidor MCP sino en `agente.py`: `pedir_causa` (un caso y qué bitácoras leer) y `pedir_texto` (la alerta de un caso o el informe). Para Haiku son tools como las demás. Cuando las pide, el código no llama al servidor: arma una conversación nueva con el lector o el redactor y le devuelve su respuesta al coordinador como resultado de la tool. El mensaje para cada uno lo arma el código, con solo lo que necesita:
- **Al lector:** el caso, la etapa donde se traban los autos según los datos, la causa ya registrada con su cita, y qué bitácoras leer. Si el caso ya tiene causa, se le pide solo su estado.
- **Al redactor:** la foto, los números de cada caso, la causa con su cita y, para el informe, las novedades y los casos activos sacados del cuaderno. Por eso no necesita tools, y no puede citar algo que no le llegó.

Por ejemplo, la alerta de los Pickup en S034:

```
coordinador  procesar_snapshot(S034)          → C009 y C010 abiertos: buscarles causa en T17 y T16
coordinador  pedir_causa(C009, [T17, T16])    → el lector lee T17 y T16 y propone:
                                                parada_de_linea (montaje), estado sin_fecha,
                                                "por ahora no hay fecha confirmada de vuelta"
coordinador  registrar_causa(C009, ...)       → el servidor verifica la cita
coordinador  subir_severidad(C009, T17, ...)  → C009 y C010 escalan a crítica
coordinador  pedir_texto(alerta, C009)        → el redactor escribe la alerta con los datos que le arma el código
coordinador  registrar_alerta(S034, C009, …)
```

**Un solo agente escribe.** El lector y el redactor proponen; el coordinador decide y anota con las tools del servidor, que siguen verificando cada cita. Con varios agentes escribiendo, dos podrían anotar lo mismo dos veces o pisarse.

**Los permisos los impone el código, no el prompt.** Cada agente recibe solo su lista de tools (`PERMISOS` en `agente.py`), y `Agentes.ejecutar` rechaza cualquier otra aunque el modelo la pida: el lector no puede registrar, el redactor no puede leer y el coordinador no puede leer bitácoras por su cuenta. `pedir_texto` además revisa el pedido antes de armar al redactor: la alerta, solo para un caso que escaló en esa foto y una sola vez; el informe, solo en el cierre de turno. En una corrida el coordinador pidió la alerta de un caso que ya había avisado (C007 en S022) y el código la frenó. Lo comprueba `tests/test_agente.py`, sin usar la API.

**Por qué se divide en leer y escribir, y no por tipo de problema.** Mirar el gap, el retraso contra el embarque o la etapa cuello no necesita un modelo: son cuentas de `calculo.py`. Lo que necesita un modelo es leer bitácoras y redactar, así que esos son los dos trabajos que se separan, cada uno con un prompt corto y enfocado.

**Cada agente tiene su costo.** Al final de cada corrida se imprime cuántas veces se armó cada agente y cuánto gastó (ver "Resultados").

## Decisiones de diseño

**Lo que tiene reglas fijas lo hace el código; el modelo decide qué tool usar y redacta.** Las cuentas, el ciclo de un caso y qué es novedad están escritos como reglas en `criterio.md`, así que los aplica el código: da siempre el mismo resultado y se puede probar. Haiku es un modelo chico y barato, y solo hace lo que necesita leer o escribir texto: redactar los avisos y, desde la Semana 2, leer las bitácoras.

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

**Días apartados.** Los días 8 a 10 (S043–S060) quedaron afuera mientras se armaba el agente: todo se ajustó con los días 1 a 7. Sus causas se anotaron a mano en el evaluador antes de correrlos, y se corrieron una sola vez, sin tocar el agente. Así miden si anda con datos que nunca vio. Esa prueba a ciegas es la del 19/11, con un solo agente. Después, al armar los varios agentes, una corrida de los 10 días mostró que el lector subía la severidad de la SUV por T30 ("Siguen faltando los neumáticos de la SUV local"), que no habla de la fecha, y se ajustó la regla del lector. Por eso las corridas de los días 8 a 10 con varios agentes ya no son a ciegas.

## Resultados

Las 61 llegadas (10 días, S034 llega dos veces), en dos corridas: la del 19/11 con un solo agente, que fue la prueba a ciegas de los días 8 a 10, y la del 23/11 con los tres agentes.

| | Un agente (19/11) | Tres agentes (23/11) |
|---|---|---|
| Fotos | 60 de 60 | 60 de 60 |
| Alertas | 5 de 5 | 5 de 5 |
| Informes | 30 de 30 | 30 de 30 |
| Causas | 16 de 17 | 16 de 17 |
| Subida de severidad | 1 de 1 | 1 de 1 |
| Tiempo | 5,4 min | 9,9 min |
| Tokens | 1.071.374 de entrada y 55.088 de salida | 1.556.561 de entrada y 107.992 de salida |
| Costo | **USD 0,13** | **USD 0,21** |

- **Total:** 17 casos, 5 alertas, 30 informes (10 sin novedades). La foto repetida S034 se procesó una sola vez.
- **Las alertas, en las dos corridas:**
  - SUV/Europa en S016, por los números.
  - Pickup Brasil y Local en S034 y Pickup Europa en S035, por la bitácora T17 ("por ahora no hay fecha confirmada de vuelta"). Salieron antes de que los números los volvieran críticos, en S036. La subida se levanta en S038 por T19 ("la línea de montaje de Pickup volvió a las 10:00").
  - SUV/Local en S058, por los números (faltan neumáticos).
- **Los días 8 a 10, nunca vistos, con un agente:** 18 de 18 fotos, 1 de 1 alerta, 9 de 9 informes y 6 de 6 causas. No subió ninguna severidad, y era lo correcto: los neumáticos tienen fecha de entrega y la parada de SUV "Quedó reparada".
- **La causa que falla es C006 SUV/Brasil.** La bitácora T09 habla del repintado de "SUV" sin decir el mercado, y cuando se abre el caso (S019) los datos ya no muestran etapa cuello. Haiku pone `no_declarada`. La tabla a mano dice `retrabajo` porque en S017–S018 había SUV para Brasil en repintado. Con tres agentes salió bien en 1 de 3 corridas: depende de si el lector une el repintado de T09 con este caso.

**El costo de cada agente (23/11):**

| Agente | Veces que se armó | Costo |
|---|---|---|
| Coordinador | 61, una por llegada | USD 0,165 |
| Lector | 37 | USD 0,025 |
| Redactor | 35: 5 alertas y 30 informes | USD 0,020 |

**Por qué cuesta más con tres agentes.** Casi todo el aumento es del coordinador, que por cada aviso hace una vuelta más: pide el texto y después lo registra. Así, cada alerta e informe pasa dos veces por él. Entra como resultado de `pedir_texto` y sale copiado en `registrar_alerta` o `registrar_informe`, y los tokens de salida cuestan 5 veces más que los de entrada. Además, su prompt y sus 8 tools van de nuevo en cada vuelta. La palanca para bajarlo es el caché de prompts (Semana 5), porque esa parte es igual en todas las vueltas.

**Qué se gana con tres agentes, con la misma nota del evaluador:**
- Los informes traen los números de cada caso activo, que el criterio pide en la tabla, y salen siempre con el mismo formato.
- Hay menos ruido: en toda la serie hubo un solo pedido rechazado (volver a subir la severidad de C011). El agente solo intentaba subir y levantar la subida en cada Pickup.
- Lo que puede hacer cada agente lo controla el código, y cada parte se prueba por separado.

**Ruido que no cambia nada, con un agente:**
- A veces procesa una foto dos veces (S024).
- Intenta subir o levantar la misma causa en cada Pickup, y la tool lo rechaza porque ya está hecho.
- A veces nombra como novedad un caso que no cambió.

Los registros completos quedan en `salidas/` (no están en git): `corrida_S042.txt` y `corrida_S060.txt` con un agente, y `multi_S060.txt` con tres. También están `multi_S020.txt` y `multi_S042.txt`, corridas con versiones intermedias; la de S042 dio los días 1 a 7 sin errores, con C006 bien, por USD 0,14.

## Lo que falta

- **Semanas 4 y 5:** hooks, criterio como prompt MCP, salida estructurada y caché (que bajaría el costo del coordinador). Los permisos por agente ya están.
- **Evaluador:** todavía no revisa el texto de los avisos ni mide el ruido (novedades que repiten algo ya informado).
