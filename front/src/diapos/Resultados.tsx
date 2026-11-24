import { motion } from "motion/react";
import { Numero, Rotulo, Tarjeta, Titulo } from "@/componentes/basicos";
import { useDatos } from "@/contexto";
import { AGENTES, HISTORIAL, usd, type Agente, type Nota } from "@/datos";
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
  const { guardada } = useDatos();
  const ev = guardada?.evaluacion;
  const res = guardada?.resumen;
  const maxUsd = Math.max(HISTORIAL.unAgente.usd, res?.usd ?? 0);
  const maxMin = Math.max(HISTORIAL.unAgente.minutos, res?.minutos ?? 0);

  return (
    <div className="mx-auto max-w-[1320px] px-6 py-8 pb-20 lg:px-10">
      <Titulo
        parte="6 · Resultados"
        titulo="Evaluación de la corrida completa"
        bajada={`Contra el resultado esperado, verificado a mano.${res ? ` Corrida del ${res.fecha}, 61 llegadas.` : ""}`}
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
          <span className="text-sm text-tinta-2">Claude Haiku 5.5 · USD 0,10 por millón de tokens de entrada y 0,50 de salida</span>
        </div>
        <div className="mt-5 grid gap-10 lg:grid-cols-2">
          <div className="space-y-3">
            <Barra nombre="Un agente" detalle={HISTORIAL.unAgente.fecha} valor={HISTORIAL.unAgente.usd} max={maxUsd} texto={usd(HISTORIAL.unAgente.usd)} clase="bg-linea-fuerte" />
            {res && <Barra nombre="Tres agentes" detalle={res.fecha.slice(0, 5)} valor={res.usd} max={maxUsd} texto={usd(res.usd)} clase="bg-acento" />}
            <div className="pt-2" />
            <Barra nombre="Un agente" detalle="tiempo" valor={HISTORIAL.unAgente.minutos} max={maxMin} texto={`${HISTORIAL.unAgente.minutos.toLocaleString("es-AR")} min`} clase="bg-linea-fuerte" />
            {res && <Barra nombre="Tres agentes" detalle="tiempo" valor={res.minutos} max={maxMin} texto={`${res.minutos.toLocaleString("es-AR")} min`} clase="bg-acento" />}
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
              <p className="mt-3 text-sm text-tinta-2">Próximo paso para bajarlo: caché de prompts en el coordinador.</p>
            </div>
          )}
        </div>
      </Tarjeta>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Tarjeta className="border-l-[3px] border-l-sev-media">
          <Rotulo className="text-base">Causa incorrecta: C006 SUV/Brasil</Rotulo>
          <p className="mt-2 text-tinta-2">Esperada: retrabajo en pintura.</p>
          <p className="text-tinta-2">Registrada: <code className="font-mono text-tinta">no_declarada</code>.</p>
          <p className="mt-2 text-sm text-tinta-3">T09 nombra el repintado de SUV sin decir el mercado.</p>
        </Tarjeta>

        <Tarjeta>
          <Rotulo className="text-base">Días 8 a 10, sin ajustar el sistema</Rotulo>
          <p className="mt-2 text-sm text-tinta-2">Corridos una vez, el {HISTORIAL.unAgente.fecha}, sin tocar el sistema.</p>
          <dl className="mt-3 grid grid-cols-4 gap-px overflow-hidden rounded-md border border-linea bg-linea text-center">
            {(Object.entries(HISTORIAL.aCiegas) as [string, Nota][]).map(([k, [b, t]]) => (
              <div key={k} className="bg-tarjeta py-2">
                <dd className="font-mono text-lg font-medium">{b}/{t}</dd>
                <dt className="text-xs text-tinta-2">{k}</dt>
              </div>
            ))}
          </dl>
          
        </Tarjeta>

        <Tarjeta>
          <Rotulo className="text-base">Diferencias con un solo agente</Rotulo>
          <ul className="mt-2 list-disc space-y-1.5 pl-4 text-sm text-pretty text-tinta-2 marker:text-tinta-3">
            <li>Informes con los números de cada caso</li>
            <li>1 tool rechazada en toda la serie</li>
            <li>Tools limitadas por agente en el código</li>
          </ul>
        </Tarjeta>
      </div>
    </div>
  );
}

function Barra({ nombre, detalle, valor, max, texto, clase }: { nombre: string; detalle: string; valor: number; max: number; texto: string; clase: string }) {
  return (
    <div className="grid grid-cols-[150px_1fr_auto] items-center gap-3">
      <span className="text-sm">
        {nombre} <span className="text-xs text-tinta-3">{detalle}</span>
      </span>
      <div className="h-6 overflow-hidden rounded-sm bg-suave">
        <motion.div className={cn("h-full rounded-sm", clase)} initial={{ width: 0 }} animate={{ width: `${(valor / max) * 100}%` }} transition={{ duration: 0.8, ease: "easeOut" }} />
      </div>
      <span className="tabular w-24 text-right font-mono text-sm">{texto}</span>
    </div>
  );
}
