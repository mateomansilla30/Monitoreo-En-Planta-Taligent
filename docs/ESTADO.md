# Estado del proyecto y cómo seguir

Documento para retomar el trabajo en otra computadora o en una sesión nueva de Claude. Actualizado el 24/11/2026.

Leer primero: este archivo, después [`README.md`](../README.md) (cómo está armado y por qué) y la guía del curso, [`Proyecto Final Monitoreo en planta.pdf`](../Proyecto%20Final%20Monitoreo%20en%20planta.pdf). Las reglas del caso están en `Data/reglas/criterio.md` y `Data/reglas/umbrales.yaml`.

## Fechas

- **Demo Day: miércoles 25/11/2026.** Hay que mostrar qué resuelve, una corrida en vivo con su costo, y la traza de una alerta: en qué foto salió, por qué y con qué cita de la bitácora.
- Pendiente de Mateo: preguntarle a Laura (la mentora) qué priorizar para la demo.

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
| 4 · Hooks, criterio como prompt MCP, permisos por agente | Los permisos por agente, en el código. Faltan hooks y criterio como prompt |
| 5 · Salida estructurada, caché, idempotencia, días 8 a 10 | La idempotencia (la foto repetida S034) y los días 8 a 10 |
| 6 · Serie completa con un comando, costo y tiempo | Completa: las 61 llegadas con `python src/agente.py` |
| 7 · Demo Day | El front está hecho (`front/` + `python src/demo.py`, ver el README). Falta ensayar |

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

| | Un agente (19/11) | Tres agentes (23/11) |
|---|---|---|
| Resultado de los 10 días | 16/17 causas, todo lo demás bien | 16/17 causas, todo lo demás bien |
| Tiempo y costo | 5,4 min · USD 0,13 | 9,9 min · USD 0,21 (coordinador 0,165, lector 0,025, redactor 0,020) |
| Registro | `salidas/corrida_S060.txt` | `salidas/multi_S060.txt` |

- La causa que falla es **C006 SUV/Brasil**, el caso límite. La bitácora T09 habla del repintado de "SUV" sin decir el mercado, y en S019 los datos ya no muestran etapa cuello. Con tres agentes salió bien en 1 de 3 corridas. Mateo decidió dejarlo así y explicarlo en la demo.
- C008 Sedán/Brasil es la trampa (la bitácora no dice por qué) y queda `no_declarada`, que es lo correcto.
- Los días 8 a 10 ya no son a ciegas. Con tres agentes, una corrida subió la severidad de la SUV por T30 ("Siguen faltando los neumáticos de la SUV local"), y se ajustó la regla del lector: `sin_fecha` solo si la frase dice que falta la fecha. Después, las 7 preguntas difíciles al lector (T17, T18 y T19 de los Pickup; T08 y T09 de C004; T29 y T30 de los neumáticos), 3 veces cada una, dieron 21 de 21. La prueba a ciegas es la del 19/11.

## Lo próximo, en orden

1. **Ensayar la demo:**
   - Armar el front una vez: `cd front && npm install && npm run build`.
   - Presentar con `python src/demo.py`.
   - En la parte 4, correr "Hasta S036" (unos 6 minutos y USD 0,12). Conviene arrancarla al principio y seguir con las partes 1 a 3 mientras corre.
   - La traza de la alerta de Pickup/Brasil en S034 está en la parte 5: sale 8 horas antes de que los números lleguen a crítica, por la bitácora T17.
   - Si la API falla en vivo, las partes 5 a 7 salen de la corrida guardada y no necesitan la API.
2. **Semana 4:** hooks en el loop y el criterio como prompt MCP.
3. **Semana 5:** salida estructurada y caché de prompts para el coordinador, que es lo que más bajaría el costo.

## Problemas conocidos (chicos)

- Con tres agentes, el coordinador a veces intenta subir la severidad de un caso que ya la tiene subida (C011 en S035). La tool lo rechaza; no cambia nada.
- Cada informe pasa dos veces por el coordinador (lo recibe del redactor y lo copia al registrarlo). Es la mayor parte del costo de más.
- El evaluador todavía no mide el ruido de los informes (nombrar como novedad un caso que no cambió) ni revisa el texto de los avisos.

## Cómo trabajar con Mateo

- **En castellano rioplatense y simple, pero completo:** explicar paso a paso, con ejemplos concretos de los datos (por ejemplo, SUV/Europa en S015–S020) y con el código real cuando hace falta, sin jerga. Cuando no entiende, explicarlo más simple, no más corto.
- **Un paso a la vez:** antes de cada cambio, contar qué se va a hacer, en qué archivo y por qué, y esperar que diga que sí. "Dale" aprueba solo el paso que se acaba de explicar.
- **Preguntar antes de correr algo que use la API.**
- **Los commits los hace él:** proponer el mensaje (estilo `feat: ...` en castellano, sobre `main`), sin coautor, y no commitear salvo que lo pida explícitamente.
- Las decisiones de diseño las toma él; dar una recomendación, no una lista de opciones.
