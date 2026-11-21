# Estado del proyecto y cómo seguir

Documento para retomar el trabajo en otra computadora o en una sesión nueva de Claude. Actualizado el 18/11/2026.

Leer primero: este archivo, después [`README.md`](../README.md) (cómo está armado y por qué) y la guía del curso, [`Proyecto Final Monitoreo en planta.pdf`](../Proyecto%20Final%20Monitoreo%20en%20planta.pdf). Las reglas del caso están en `Data/reglas/criterio.md` y `Data/reglas/umbrales.yaml`.

## Fechas

- **Demo Day: miércoles 25/11/2026.** Hay que mostrar qué resuelve, una corrida en vivo con su costo, y la traza de una alerta: en qué foto salió, por qué y con qué cita de la bitácora.
- Mateo tiene alrededor de **1 hora por día**. Por eso se prioriza lo que se muestra en la demo; las semanas 3 a 5 de la guía (varios agentes, hooks, caché) quedan afuera salvo que sobre tiempo.
- Pendiente de Mateo: preguntarle a Laura (la mentora) qué priorizar para la demo.

## Puesta en marcha en una compu nueva

```
pip install -r requirements.txt
```

Crear `.env` en la raíz con `ANTHROPIC_API_KEY=...` (no está en git). En Windows, para los acentos: `$env:PYTHONIOENCODING="utf-8"`.

Comprobar que todo anda sin gastar API:

```
python tests/test_calculo.py
python tests/test_registro.py
python tests/test_servidor.py
python tests/test_evaluador.py
```

Las cuatro tienen que imprimir `ok`. `salidas/registro.json` (el cuaderno de la última corrida) tampoco está en git: se genera al correr el agente.

## Qué está hecho

| Semana de la guía | Estado |
|---|---|
| 1 · Cálculo, agente con MCP, registro fuera del modelo, evaluador | Completa |
| 2 · Causa citada de la bitácora y subida de severidad | Completa y probada con Haiku |
| 3 · Varios agentes | No. Sí está medido el costo |
| 4 · Hooks, criterio como prompt MCP, permisos por agente | No. El cierre de turno ya corre solo |
| 5 · Salida estructurada, caché, idempotencia, días 8 a 10 | La idempotencia (la foto repetida S034) y los días 8 a 10, corridos una vez |
| 6 · Serie completa con un comando, costo y tiempo | Completa: las 61 llegadas con `python src/agente.py` |
| 7 · Demo Day | Falta preparar |

### Las piezas

- `src/calculo.py`: las cuentas (gap, retraso contra embarque, severidad mínima, etapa cuello).
- `src/registro.py`: el cuaderno de casos. Abre, escala y resuelve casos; salta fotos repetidas; arma las novedades del informe; guarda causas y subidas de severidad.
- `src/servidor_mcp.py`: 7 tools: `procesar_snapshot`, `leer_bitacora`, `registrar_causa`, `subir_severidad`, `levantar_subida`, `registrar_alerta`, `registrar_informe`.
- `src/agente.py`: Haiku 5.5 recorre las llegadas de `llegadas.csv` en orden, una conversación nueva por foto. Sin nada corre las 61 llegadas; `python src/agente.py S042` corre de S001 a S042.
- `src/evaluador.py`: compara lo que hizo Haiku contra `agente_perfecto` (las reglas del código más las causas y la subida verificadas a mano en `CAUSAS_ESPERADAS` y `SUBIDAS_ESPERADAS`, que cubren los 10 días). Se corre con la misma foto final que el agente: `python src/evaluador.py` o `python src/evaluador.py S042`.

### Última corrida con Haiku (19/11/2026)

Las 61 llegadas, 5,4 min, **USD 0,13**. Detalle en la sección "Resultados" del README.

- **Días 1 a 7:** 42/42 fotos, 4/4 alertas, 21/21 informes, 10/11 causas, 1/1 subida. La subida anduvo:
  - Haiku sube la severidad de los Pickup en S034 por T17 ("por ahora no hay fecha confirmada de vuelta").
  - C011 escala en S035.
  - La subida se levanta en S038 por T19.
- **Días 8 a 10, corridos una sola vez sin tocar el agente:** 18/18 fotos, 1/1 alerta (SUV/Local en S058), 9/9 informes, 6/6 causas. Haiku no subió la severidad por los neumáticos de la SUV, y estaba bien, porque hay fecha de entrega. Las causas de estos días se anotaron a mano en el evaluador antes de correrlos.
- La causa que falla es **C006 SUV/Brasil**. La bitácora T09 habla del repintado de "SUV" sin decir el mercado, y cuando se abre el caso (S019) los datos ya no muestran etapa cuello. Haiku pone `no_declarada`. Mateo decidió dejarlo así y explicarlo en la demo como el caso límite.
- C008 Sedán/Brasil es la trampa (la bitácora no dice por qué) y Haiku la deja `no_declarada`, que es lo correcto.
- Los registros de las corridas quedan en `salidas/corrida_S042.txt` y `salidas/corrida_S060.txt` (no están en git).

## Lo próximo, en orden

1. **Preparar la demo:** mostrar la traza de la alerta de los Pickup en S034 (en qué foto salió, por qué y con qué cita): avisa 8 horas antes que los números (S036), por la bitácora T17. Está todo en `salidas/corrida_S060.txt`, de la línea 390 en adelante.
2. Margen para errores. Si sobra tiempo, los varios agentes de la Semana 3: uno principal que procesa la foto y es el único que escribe en el cuaderno, uno que lee las bitácoras y uno que redacta alertas e informes.

## Problemas conocidos (chicos)

- Haiku a veces nombra como novedad un caso que no cambió (por ejemplo C015 en el informe de S060). Es "ruido"; el evaluador todavía no lo mide.
- Haiku a veces llama a `procesar_snapshot` dos veces en la misma foto (S024). No rompe nada.
- Cuando una subida alcanza a varios casos, Haiku intenta subirla o levantarla en cada uno. La tool rechaza las repeticiones, así que no cambia nada.
- `casos_activos` no trae los números de cada caso (gap, retraso, cuello) que el criterio pide en la tabla del informe; Haiku los toma de `problemas`, que solo trae los casos con problema en esa foto.

## Cómo trabajar con Mateo

- **En castellano rioplatense y simple:** explicaciones cortas, con ejemplos concretos de los datos (por ejemplo, SUV/Europa en S015–S020) y sin jerga. Cuando no entiende, explicarlo más simple, no más largo.
- **Un paso a la vez:** antes de cada cambio, contar qué se va a hacer, en qué archivo y por qué, y esperar que diga que sí. "Dale" aprueba solo el paso que se acaba de explicar.
- **Preguntar antes de correr algo que use la API.**
- **Los commits los hace él:** proponer el mensaje (estilo `feat: ...` en castellano, sobre `main`) y no commitear, salvo que lo pida explícitamente.
- Las decisiones de diseño las toma él; dar una recomendación, no una lista de opciones.
