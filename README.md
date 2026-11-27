# Monitoreo en planta

Proyecto final del Spring AI Camp. Un sistema de agentes que sigue el avance de una planta de autos (Planta Las Acacias: 3 modelos × 3 mercados) cada 4 horas, detecta los atrasos contra el plan, lleva un registro de casos y decide qué avisar: una **alerta inmediata** cuando un caso se vuelve crítico y un **informe** al cierre de cada turno, con la causa citada de la bitácora del supervisor.

Corre con la API de Anthropic, Claude Haiku 5.5 (`claude-haiku-5-5`) y un servidor MCP propio.

**Resultado de los 10 días** (61 llegadas, contra un resultado esperado verificado a mano): 60/60 fotos, 5/5 alertas, 30/30 informes, 16/17 causas y 1/1 subida de severidad, en 10,2 minutos y por USD 0,087.

## Qué hace

En cada foto (un snapshot con dónde está cada auto y desde qué hora):

1. **Calcula los atrasos** con las reglas de `Data/reglas/criterio.md`: autos que faltan contra el plan acumulado y autos que no llegan a su camión o buque. Cada combinación modelo × mercado recibe una severidad: ninguna, media, alta o crítica.
2. **Sigue cada atraso como un caso:** lo abre, lo escala y lo resuelve, uno por combinación, sin repetir avisos.
3. **Busca la causa** en la bitácora del supervisor (texto libre) y la cita tal cual. Si ninguna bitácora la explica, queda como `no_declarada`.
4. **Sube la severidad** cuando la bitácora dice que la causa sigue sin fecha de resolución, aunque los números todavía no lo muestren. En los datos, la alerta de Pickup sale 8 horas antes de que los números lleguen a crítica.
5. **Avisa:** una alerta por caso cuando escala y un informe por turno con lo que cambió.

## Arquitectura

```
"llegó S034" ─► coordinador ── procesar_snapshot, registrar_* ──► servidor_mcp.py ──► calculo.py
                 │        │                                            │
     pedir_causa │        │ pedir_texto                                ▼
                 ▼        ▼                                registro.py → salidas/registro.json
              lector    redactor                                       ▲
                 └───────────── leer_bitacora ─────────────────────────┘
```

**Lo que tiene reglas fijas lo hace el código; lo que es texto libre, el modelo.** Las cuentas, el ciclo de un caso, cuándo corresponde un aviso y qué es novedad los aplica el código: dan siempre el mismo resultado y se pueden probar. El modelo lee las bitácoras, elige el próximo paso y redacta los avisos.

| Agente | Qué hace | Tools |
|---|---|---|
| **Coordinador** | Uno por foto. Procesa la foto, decide qué pedir y a quién, y es el único que escribe en el registro. | `procesar_snapshot`, `registrar_causa`, `subir_severidad`, `levantar_subida`, `registrar_alerta`, `registrar_informe`, `pedir_causa`, `pedir_texto` |
| **Lector** | Lee las bitácoras de un caso y propone la causa, la cita y si sigue: `sin_fecha`, `con_fecha`, `resuelta` o `no_dice`. Responde con salida estructurada (esquema JSON). | `leer_bitacora` |
| **Redactor** | Escribe las alertas y los informes con los datos que le arma el código. | Ninguna |

Los tres son el mismo modelo; los distinguen el criterio, las tools y el mensaje con el que arrancan. `pedir_causa` y `pedir_texto` viven en `agente.py`: cuando el coordinador las usa, el código arma una conversación nueva con el lector o el redactor, con solo lo que necesita.

**Las tools del servidor MCP** (`servidor_mcp.py`, FastMCP por stdio) validan todo lo que reciben:

| Tool | Qué hace | Qué rechaza |
|---|---|---|
| `procesar_snapshot` | Calcula la foto, actualiza los casos y devuelve qué cambió. | Una foto que no existe. Una foto repetida no cambia nada. |
| `leer_bitacora` | Devuelve la bitácora de un turno. | Una bitácora que todavía no está escrita. |
| `registrar_causa` | Guarda la causa en el caso. | Una cita que no está tal cual en la bitácora. |
| `subir_severidad` / `levantar_subida` | Sube un caso a crítica por la bitácora, o termina la subida. | Un caso sin causa, una cita inventada. |
| `registrar_alerta` / `registrar_informe` | Guarda el aviso. | Una alerta de un caso que no está escalado y crítico; un informe fuera del cierre de turno. |

El servidor publica además el criterio de cada agente como prompt MCP (`criterio_coordinador`, `criterio_lector`, `criterio_redactor`).

## Controles sobre el modelo

- **Permisos en el código:** cada agente recibe solo sus tools y el código rechaza cualquier otra, aunque el modelo la pida.
- **Hooks** antes de cada tool, después y al terminar la foto. Frenan alertas repetidas, informes incompletos y que el coordinador termine sin procesar la foto, sin mandar una alerta que corresponde o sin el informe del cierre. En la corrida completa, `hook_alerta` frenó una alerta repetida de C004 en S017.
- **Avisos estructurados:** cada alerta se guarda con campos fijos (combinación, severidad, estado, si escaló por los números o por la bitácora, causa y evidencia). Los completa el código; el modelo solo escribe el texto. `registro.validar_aviso` los revisa antes de guardarlos.
- **Memoria fuera del modelo:** cada foto es una conversación nueva; lo que pasó antes está en `salidas/registro.json`.
- **Caché de prompts** para las tools, el criterio y la conversación, verificado con `cache_read_input_tokens`.

## Puesta en marcha

```
pip install -r requirements.txt
```

Crear `.env` en la raíz con la key (ver `.env.example`): `ANTHROPIC_API_KEY=...`

```
python src/agente.py            # las 61 llegadas (S001 a S060)
python src/evaluador.py         # la nota contra el resultado esperado

python src/agente.py S042       # solo hasta S042
python src/evaluador.py S042

python src/calculo.py S036      # solo las cuentas de una foto, sin el modelo
```

En Windows, para los acentos: `$env:PYTHONIOENCODING="utf-8"`.

### Demo

Un front en React y Tailwind (`front/`), servido por `src/demo.py`. La primera vez hay que armarlo (necesita Node):

```
cd front && npm install && npm run build
python src/demo.py              # abre http://127.0.0.1:8765
```

Tiene seis partes, que se recorren con ← → o con los números del 1 al 6:

1. **El problema:** 12 escenas animadas, de la planta a la decisión de qué avisar.
2. **Cómo funciona:** los agentes, qué hace el código y qué el modelo, y una alerta real paso por paso.
3. **En vivo:** corre el agente contra la API (por ejemplo, hasta S016: unos 2 minutos y USD 0,02), con el diagrama de los agentes trabajando.
4. **Traza:** en qué foto salió cada alerta, por qué y con qué cita.
5. **Resultados:** la nota del evaluador, el costo de las tres corridas y el mapa de los 10 días.
6. **Avisos:** las alertas y los informes completos.

La corrida en vivo usa su propio registro (`salidas/demo/`); las partes 4 a 6 salen de la última corrida completa y no necesitan la API.

### Pruebas

No usan la API. Cada una imprime `ok`:

```
python tests/test_calculo.py
python tests/test_registro.py
python tests/test_servidor.py
python tests/test_evaluador.py
python tests/test_agente.py
python tests/test_demo.py
```

## Resultados

Tres corridas completas de las 61 llegadas, evaluadas contra un agente perfecto: las mismas reglas del código más las causas y la subida verificadas a mano.

| | Un agente (19/11) | Tres agentes, sin caché (23/11) | Tres agentes, con caché y hooks (25/11) |
|---|---|---|---|
| Fotos · alertas · informes | 60/60 · 5/5 · 30/30 | 60/60 · 5/5 · 30/30 | 60/60 · 5/5 · 30/30 |
| Causas · subidas | 16/17 · 1/1 | 16/17 · 1/1 | 16/17 · 1/1 |
| Tiempo | 5,4 min | 9,9 min | 10,2 min |
| Costo | USD 0,13 | USD 0,21 | **USD 0,087** |

- **Las 5 alertas:** SUV/Europa en S016 (pierde el buque, por los números); Pickup Brasil y Local en S034 y Pickup Europa en S035 (por la bitácora: "por ahora no hay fecha confirmada de vuelta"); SUV/Local en S058 (por los números).
- **Caché:** sin caché, la corrida del 25/11 habría costado USD 0,215; con caché, un 60 % menos y con la misma nota. Así, tres agentes cuestan menos que uno sin caché. Lo que más pesa ahora es la salida: el 62 % del costo.
- **Días 8 a 10:** se apartaron mientras se armaba el sistema y se corrieron a ciegas una vez (19/11): 18/18 fotos, 1/1 alerta, 9/9 informes y 6/6 causas. Después se ajustó una regla del lector, así que las corridas posteriores ya no son a ciegas.
- **La causa que falla, C006 (SUV/Brasil):** la bitácora habla del repintado de "SUV" sin decir el mercado. El sistema pone `no_declarada`; lo esperado es retrabajo en pintura. Acertó en 1 de 4 corridas con tres agentes.

## Decisiones de diseño

- **Una sola tool para procesar la foto:** calcula y anota en el mismo paso, así el modelo no puede mirar una foto sin registrarla ni registrarla dos veces.
- **Una foto repetida se procesa una vez:** S034 llega dos veces a propósito y la segunda no cambia nada.
- **La bitácora de un turno se lee en su foto de cierre:** antes, el supervisor la está escribiendo.
- **Escalado no vuelve atrás:** si la severidad baja, el caso sigue escalado; así no se repite la alerta.
- **La subida la decide el modelo y la aplica el código:** el modelo la justifica con una cita verificada; el código lleva los casos a crítica y no los deja resolverse mientras siga vigente. Si los números se normalizan pero ninguna bitácora dice que se resolvió, el informe lo marca "A confirmar".
- **Se evalúa contra un agente perfecto,** no contra el registro que dejó el modelo, para que un error del modelo no quede escondido.
- **Batch API descartada:** cada foto depende de la anterior y el aviso tiene que salir en el momento.

## Limitaciones y próximos pasos

- El evaluador no mide el ruido de los informes ni revisa el texto de los avisos.
- Cada aviso pasa dos veces por el coordinador (lo recibe del redactor y lo copia al registrarlo). Que lo registre el código directamente bajaría el costo.
- Avisar antes: proyectar la tendencia y alertar antes de cruzar el umbral.

## Estructura

| Ruta | Contenido |
|---|---|
| `src/calculo.py` | Las cuentas: atraso contra el plan, embarque, severidad y etapa donde se traban. Explicadas en `docs/M1.md`. |
| `src/registro.py` | El registro de casos, las novedades del informe y la validación de los avisos. |
| `src/servidor_mcp.py` | El servidor MCP: 7 tools y 3 prompts. |
| `src/agente.py` | Los tres agentes, los permisos, los hooks y la serie completa. |
| `src/evaluador.py` | La nota de una corrida contra el resultado esperado. |
| `src/demo.py`, `front/` | El servidor y el front de la demo. |
| `tests/` | Una prueba por archivo de `src/`. |
| `Data/` | Fotos, bitácoras, plan, embarques y reglas del caso. |
| `docs/` | `M1.md` (las cuentas, con ejemplos) y `ESTADO.md` (estado del proyecto). |

`salidas/` (los registros y las corridas) no está en git: se genera al correr el agente.
