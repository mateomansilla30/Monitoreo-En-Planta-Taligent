# Estado del proyecto y cómo seguir

Documento para retomar el trabajo en otra computadora o en una sesión nueva de Claude. Actualizado el 27/11/2026: versión final, la que se entrega.

Leer primero: este archivo, después [`README.md`](../README.md) (cómo está armado y por qué) y la guía del curso, [`Proyecto Final Monitoreo en planta.pdf`](../Proyecto%20Final%20Monitoreo%20en%20planta.pdf). Las reglas del caso están en `Data/reglas/criterio.md` y `Data/reglas/umbrales.yaml`.

## Fechas

- **Demo Day: miércoles 25/11/2026.** Se mostró el problema, cómo funciona, una corrida en vivo con su costo, la traza de una alerta (en qué foto salió, por qué y con qué cita de la bitácora) y los resultados.
- **27/11/2026:** entrega del repositorio, en esta versión.

## Puesta en marcha en una compu nueva

```
pip install -r requirements.txt
```

Crear `.env` en la raíz con `ANTHROPIC_API_KEY=...` (no está en git). Si la API contesta `401 invalid x-api-key`, la key se revocó: hay que crear una nueva en la consola de Anthropic, en "API Keys". En Windows, para los acentos: `$env:PYTHONIOENCODING="utf-8"`.

Comprobar que todo anda sin gastar API:

```
python tests/test_calculo.py
python tests/test_registro.py
python tests/test_servidor.py
python tests/test_evaluador.py
python tests/test_agente.py
python tests/test_demo.py
```

Las seis tienen que imprimir `ok`. Las líneas de `ERROR` que aparecen antes son a propósito: son los rechazos que esas pruebas buscan. `salidas/registro.json` (el cuaderno de la última corrida) tampoco está en git: se genera al correr el agente.

## Qué está hecho

| Semana de la guía | Estado |
|---|---|
| 1 · Cálculo, agente con MCP, registro fuera del modelo, evaluador | Completa |
| 2 · Causa citada de la bitácora y subida de severidad | Completa y probada con Haiku |
| 3 · Varios agentes, con costo | Completa: coordinador, lector y redactor, con el costo de cada uno |
| 4 · Hooks, criterio como prompt MCP, permisos por agente | Completa: hooks antes de cada tool, después y al terminar; el criterio de cada agente es un prompt del servidor MCP |
| 5 · Salida estructurada, caché, idempotencia, días 8 a 10 | Completa: avisos estructurados y validados, salida estructurada del lector, caché (verificado con `cache_read_input_tokens`), Batch API evaluada en el README |
| 6 · Serie completa con un comando, costo y tiempo | Completa: las 61 llegadas con `python src/agente.py` |
| 7 · Demo Day | Completa: el front (`front/` + `python src/demo.py`, ver el README) con las seis partes de la presentación |

### Las piezas

- `src/calculo.py`: las cuentas (gap, retraso contra embarque, severidad mínima, etapa cuello).
- `src/registro.py`: el cuaderno de casos. Abre, escala y resuelve casos; salta fotos repetidas; arma las novedades del informe; guarda causas y subidas de severidad.
- `src/servidor_mcp.py`: 7 tools: `procesar_snapshot`, `leer_bitacora`, `registrar_causa`, `subir_severidad`, `levantar_subida`, `registrar_alerta`, `registrar_informe`.
- `src/agente.py`: los tres agentes, todos Haiku 5.5.
  - El **coordinador** se arma una vez por llegada. Procesa la foto y es el único que escribe en el cuaderno.
  - El **lector** solo tiene `leer_bitacora` y propone la causa y su estado (`sin_fecha`, `con_fecha`, `resuelta`, `no_dice`).
  - El **redactor** no tiene tools: escribe alertas e informes con los datos que le arma el código.
  - El coordinador los llama con dos tools que viven en `agente.py`, no en el servidor: `pedir_causa` y `pedir_texto`.
  - Lo que puede usar cada uno está en `PERMISOS` y lo frena `Agentes.ejecutar`.
  - Sin argumento corre las 61 llegadas; `python src/agente.py S042` corre de S001 a S042.
- `src/demo.py` y `front/`: la demo.
  - El servidor le da los datos al front: las cuentas de las 60 fotos, la última serie con la nota del evaluador y las bitácoras.
  - También arranca el agente en vivo con `REGISTRO=salidas/demo/registro.json` y `EVENTOS=salidas/demo/eventos.jsonl`. Con esas variables, `agente.py` anota cada paso para el front y no pisa la serie guardada.
  - Ojo: el servidor MCP corre en otro proceso y FastMCP no le pasa las variables de entorno. Por eso `agente.correr` le pasa `REGISTRO` explícitamente con `PythonStdioTransport(..., env=...)`.
- `src/evaluador.py`: compara lo que hizo Haiku contra `agente_perfecto`, que son las reglas del código más las causas y la subida verificadas a mano (`CAUSAS_ESPERADAS` y `SUBIDAS_ESPERADAS`, para los 10 días). Se corre con la misma foto final que el agente: `python src/evaluador.py` o `python src/evaluador.py S042`. Después de una corrida completa, evaluar con `S042` no sirve: cuenta como "de más" todo lo posterior.

### Últimas corridas con Haiku

| | Un agente (19/11) | Tres agentes, sin caché (23/11) | Tres agentes, con caché y hooks (25/11) |
|---|---|---|---|
| Resultado de los 10 días | 16/17 causas, todo lo demás bien | 16/17 causas, todo lo demás bien | 16/17 causas, todo lo demás bien |
| Tiempo y costo | 5,4 min · USD 0,13 | 9,9 min · USD 0,21 (coordinador 0,165, lector 0,025, redactor 0,020) | 10,2 min · USD 0,087 (coordinador 0,054, lector 0,014, redactor 0,019) |
| Registro | `salidas/corrida_S060.txt` | `salidas/multi_S060.txt` (cuaderno en `salidas/corrida_23-11/`) | `salidas/multi_cache_S060.txt` (cuaderno en `salidas/registro.json`, el que muestra la demo) |

- La causa que falla es **C006 SUV/Brasil**, el caso límite. La bitácora T09 habla del repintado de "SUV" sin decir el mercado, y en S019 los datos ya no muestran etapa cuello. Con tres agentes salió bien en 1 de 4 corridas. Mateo decidió dejarlo así y explicarlo en la demo.
- C008 Sedán/Brasil es la trampa (la bitácora no dice por qué) y queda `no_declarada`, que es lo correcto.
- Los días 8 a 10 ya no son a ciegas. Con tres agentes, una corrida subió la severidad de la SUV por T30 ("Siguen faltando los neumáticos de la SUV local"), y se ajustó la regla del lector: `sin_fecha` solo si la frase dice que falta la fecha. Después, las 7 preguntas difíciles al lector (T17, T18 y T19 de los Pickup; T08 y T09 de C004; T29 y T30 de los neumáticos), 3 veces cada una, dieron 21 de 21. La prueba a ciegas es la del 19/11.

## Cómo presentar la demo

- Armar el front una vez: `cd front && npm install && npm run build`. Presentar con `python src/demo.py` (abre `http://127.0.0.1:8765`).
- Seis partes: 1 El problema (12 escenas, con ↓ ↑), 2 Cómo funciona, 3 En vivo, 4 Traza, 5 Resultados, 6 Avisos.
- En la parte 3, "Hasta S016" tarda unos 2 minutos y cuesta unos USD 0,02. Las partes 4 a 6 salen de la corrida guardada y no necesitan la API.

## Mejoras posibles

- **Evaluador:** medir el ruido de los informes (novedades que repiten algo ya informado) y revisar el texto de los avisos.
- **Costo:** que el código registre la alerta o el informe apenas el redactor termina, así el texto no pasa dos veces por el coordinador.
- **Alerta anticipada:** proyectar la tendencia y avisar antes de cruzar el umbral.

## Problemas conocidos (chicos)

- Con tres agentes, el coordinador a veces intenta algo que no corresponde: en la corrida del 23/11, subir otra vez la severidad de C011 (la tool lo rechazó); en la del 25/11, mandar de nuevo la alerta de C004 en S017 (lo frenó `hook_alerta`). No cambia nada.
- Cada informe pasa dos veces por el coordinador (lo recibe del redactor y lo copia al registrarlo). Es la mayor parte del costo de más.
- El evaluador todavía no mide el ruido de los informes (nombrar como novedad un caso que no cambió) ni revisa el texto de los avisos.

## Cómo trabajar con Mateo

- **En castellano rioplatense y simple, pero completo:** explicar paso a paso, con ejemplos concretos de los datos (por ejemplo, SUV/Europa en S015–S020) y con el código real cuando hace falta, sin jerga. Cuando no entiende, explicarlo más simple, no más corto.
- **Un paso a la vez:** antes de cada cambio, contar qué se va a hacer, en qué archivo y por qué, y esperar que diga que sí. "Dale" aprueba solo el paso que se acaba de explicar.
- **Preguntar antes de correr algo que use la API.**
- **Los commits los hace él:** proponer el mensaje (estilo `feat: ...` en castellano, sobre `main`), sin coautor, y no commitear salvo que lo pida explícitamente.
- Las decisiones de diseño las toma él; dar una recomendación, no una lista de opciones.
