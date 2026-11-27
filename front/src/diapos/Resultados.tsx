import { motion } from "motion/react";
import { Numero, Rotulo, Tarjeta, Titulo } from "@/componentes/basicos";
import { MapaDeCalor } from "@/componentes/MapaDeCalor";
import { useDatos } from "@/contexto";
import { AGENTES, HISTORIAL, costoSinCache, miles, usd, type Agente, type Nota, type Resumen } from "@/datos";
import { cn } from "@/lib/utils";

const NOTAS: { clave: "fotos" | "alertas" | "informes" | "causas" | "subidas"; nombre: string; detalle: string }[] = [
  { clave: "fotos", nombre: "Fotos", detalle: "S034 llega dos veces" },
  { clave: "alertas", nombre: "Alertas", detalle: "en la foto correcta" },
  { clave: "informes", nombre: "Informes", detalle: "uno por cierre de turno" },
  { clave: "causas", nombre: "Causas", detalle: "verificadas a mano" },
  { clave: "subidas", nombre: "Subidas de severidad", detalle: "por bitácora" },
];

function Nota({ nota }: { nota: Nota }) {
  const [bien, total] = nota;
  const completa = bien === total;
  return (
    <>
      <p className="font-mono text-3xl font-medium tracking-tight">
        <Numero valor={bien} />
        <span className="text-tinta-3">/{total}</span>
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-suave">
        <motion.div
          className={cn("h-full rounded-full", completa ? "bg-acento" : "bg-sev-media")}
          initial={{ width: 0 }}
          animate={{ width: `${total ? (bien / total) * 100 : 0}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      </div>
    </>
  );
}

export default function Resultados() {
  const { guardada, serie } = useDatos();
  const ev = guardada?.evaluacion;
  const res = guardada?.resumen;
  // las corridas completas de los 10 días: un agente, tres sin caché y la guardada (con caché y hooks)
  const conCache = !!res?.cache_read_input_tokens;
  const corridas = [
    { nombre: "Un agente", detalle: `${HISTORIAL.unAgente.fecha} · sin caché`, usd: HISTORIAL.unAgente.usd, minutos: HISTORIAL.unAgente.minutos, clase: "bg-linea-fuerte" },
    ...(conCache || !res ? [{ nombre: "Tres agentes", detalle: `${HISTORIAL.tresAgentes.fecha} · sin caché`, usd: HISTORIAL.tresAgentes.usd, minutos: HISTORIAL.tresAgentes.minutos, clase: "bg-acento/40" }] : []),
    ...(res ? [{ nombre: "Tres agentes", detalle: `${res.fecha.slice(0, 5)} · ${conCache ? "con caché y hooks" : "sin caché"}`, usd: res.usd, minutos: res.minutos, clase: "bg-acento" }] : []),
  ];
  const maxUsd = Math.max(...corridas.map((c) => c.usd));
  const maxMin = Math.max(...corridas.map((c) => c.minutos));

  return (
    <div className="mx-auto max-w-[1320px] px-6 py-8 pb-20 lg:px-10">
      <Titulo
        parte="5 · Resultados"
        titulo="Evaluación de la corrida completa"
        bajada={`Contra el resultado esperado, verificado a mano.${res ? ` Corrida del ${res.fecha.slice(0, 10)}, 61 llegadas.` : ""}`}
      />

      <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-linea bg-linea md:grid-cols-5">
        {NOTAS.map((n) => (
          <div key={n.clave} className="bg-tarjeta p-5">
            <p className="text-sm font-semibold">{n.nombre}</p>
            <p className="mb-3 text-xs text-tinta-2">{n.detalle}</p>
            {ev ? <Nota nota={ev[n.clave]} /> : <div className="h-12 animate-pulse rounded bg-suave" />}
          </div>
        ))}
      </div>

      <Tarjeta className="mt-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <Rotulo className="text-base">Costo y tiempo de los 10 días</Rotulo>
          <span className="text-sm text-tinta-2">Claude Haiku 5.5 · por millón de tokens: USD 0,10 de entrada, 0,01 leídos del caché, 0,50 de salida</span>
        </div>
        <div className="mt-5 grid gap-10 lg:grid-cols-2">
          <div className="space-y-5">
            <div className="space-y-2">
              <p className="text-sm font-medium text-tinta-2">Costo</p>
              {corridas.map((c) => <Barra key={c.detalle} nombre={c.nombre} detalle={c.detalle} valor={c.usd} max={maxUsd} texto={usd(c.usd, 3)} clase={c.clase} />)}
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-tinta-2">Tiempo</p>
              {corridas.map((c) => <Barra key={c.detalle} nombre={c.nombre} detalle={c.detalle} valor={c.minutos} max={maxMin} texto={`${c.minutos.toLocaleString("es-AR")} min`} clase={c.clase} />)}
            </div>
            <p className="text-sm text-tinta-2">
              Las tres con la misma nota del evaluador. Con caché, los tres agentes cuestan menos que uno solo sin caché; tardan casi el doble, porque cada aviso hace más vueltas.
            </p>
          </div>
          {res && (
            <div>
              <p className="text-sm text-tinta-2">Cómo se reparte el costo de los tres agentes</p>
              <div className="mt-2 flex h-8 overflow-hidden rounded-md">
                {(Object.keys(AGENTES) as Agente[]).map((a) => (
                  <motion.div
                    key={a}
                    className={cn("grid place-items-center text-xs font-medium text-white", AGENTES[a].fondo)}
                    initial={{ width: 0 }}
                    animate={{ width: `${(res.agentes[a].usd / res.usd) * 100}%` }}
                    transition={{ duration: 0.8, delay: 0.2 }}
                  >
                    {Math.round((res.agentes[a].usd / res.usd) * 100)} %
                  </motion.div>
                ))}
              </div>
              <table className="mt-3 w-full text-sm">
                <tbody>
                  {(Object.keys(AGENTES) as Agente[]).map((a) => (
                    <tr key={a} className="border-b border-linea last:border-0">
                      <td className="py-1.5">
                        <span className={cn("mr-2 inline-block size-2 rounded-full", AGENTES[a].fondo)} />
                        {AGENTES[a].nombre}
                      </td>
                      <td className="py-1.5 text-tinta-2">se armó {res.agentes[a].veces} veces</td>
                      <td className="tabular py-1.5 text-right font-mono">{usd(res.agentes[a].usd, 3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 text-sm text-tinta-2">
                Con caché, la entrada casi no cuesta: lo que pesa es lo que escriben, porque la salida cuesta 5 veces más. El coordinador sigue siendo el que más gasta, porque cada aviso pasa dos veces por él: lo recibe del redactor y lo copia al registrarlo.
              </p>
            </div>
          )}
        </div>
        <Cache conCache={res?.cache_read_input_tokens ? res : null} />
      </Tarjeta>

      <MapaDeCalor serie={serie} cuaderno={guardada?.registro ?? null} />
    </div>
  );
}

/** Lo que bajó el caché. Si la corrida guardada ya tiene caché, sale de ella; si no, de la prueba hasta S038 del 24/11. */
function Cache({ conCache }: { conCache: Resumen | null }) {
  const c = conCache
    ? { hasta: conCache.hasta, antes: costoSinCache(conCache), despues: conCache.usd, leidos: conCache.cache_read_input_tokens ?? 0, pagados: conCache.input_tokens }
    : HISTORIAL.cache;
  const menos = Math.round((1 - c.despues / c.antes) * 100);
  return (
    <div className="mt-6 grid gap-x-10 gap-y-3 border-t border-linea pt-5 lg:grid-cols-2">
      <div className="space-y-3">
        <p className="text-sm text-tinta-2">
          Caché de prompts, hasta {c.hasta}{conCache ? "" : " (prueba del 24/11, misma nota del evaluador)"}
        </p>
        <Barra nombre="Sin caché" detalle={conCache ? "calculado" : ""} valor={c.antes} max={c.antes} texto={usd(c.antes, 3)} clase="bg-linea-fuerte" />
        <Barra nombre="Con caché" detalle="" valor={c.despues} max={c.antes} texto={usd(c.despues, 3)} clase="bg-acento" />
      </div>
      <div className="flex items-center gap-6">
        <p className="shrink-0 font-mono text-5xl font-medium tracking-tight whitespace-nowrap text-acento">−{menos} %</p>
        <p className="text-sm text-pretty text-tinta-2">
          Las tools, el criterio y la conversación se repiten en cada vuelta. De la entrada,{" "}
          <b className="text-tinta">{miles(c.leidos)}</b> tokens se leyeron del caché (al 10 % del precio) y solo{" "}
          <b className="text-tinta">{miles(c.pagados)}</b> se pagaron completos.
        </p>
      </div>
    </div>
  );
}

function Barra({ nombre, detalle, valor, max, texto, clase }: { nombre: string; detalle: string; valor: number; max: number; texto: string; clase: string }) {
  return (
    <div className="grid grid-cols-[170px_1fr_auto] items-center gap-3">
      <span className="text-sm leading-tight">
        {nombre} <span className="block text-xs text-tinta-3">{detalle}</span>
      </span>
      <div className="h-6 overflow-hidden rounded-sm bg-suave">
        <motion.div className={cn("h-full rounded-sm", clase)} initial={{ width: 0 }} animate={{ width: `${(valor / max) * 100}%` }} transition={{ duration: 0.8, ease: "easeOut" }} />
      </div>
      <span className="tabular w-24 text-right font-mono text-sm">{texto}</span>
    </div>
  );
}
