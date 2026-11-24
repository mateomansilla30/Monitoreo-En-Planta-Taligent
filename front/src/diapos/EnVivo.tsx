import {
  BellRing, BookOpenText, Camera, CheckCircle2, Copy, FileText, Flame, PenLine, Play, Route, ShieldAlert, Square, Workflow, X,
  type LucideIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Cita, Markdown, Numero, Rotulo, Tarjeta, Titulo } from "@/componentes/basicos";
import { Tablero } from "@/componentes/tablero";
import { useDatos } from "@/contexto";
import { AGENTES, FONDO_SEVERIDAD, NOMBRE_CATEGORIA, buscarCaso, comb, horaDe, numeroFoto, usd, type Agente } from "@/datos";
import { cn } from "@/lib/utils";
import type { AlertaVivo, ItemFeed } from "@/vivo";

const OPCIONES = [
  { hasta: 16, nombre: "Hasta S016", detalle: "alerta de SUV/Europa", estimado: "unos 3 min · USD 0,05" },
  { hasta: 36, nombre: "Hasta S036", detalle: "alertas de Pickup (T17)", estimado: "unos 6 min · USD 0,12" },
  { hasta: 38, nombre: "Hasta S038", detalle: "se levanta la subida", estimado: "unos 6½ min · USD 0,14" },
  { hasta: 60, nombre: "10 días", detalle: "las 61 llegadas", estimado: "unos 10 min · USD 0,21" },
];

const ICONO_AGENTE: Record<Agente, LucideIcon> = { coordinador: Workflow, lector: BookOpenText, redactor: PenLine };

const ESTADO_LECTOR: Record<string, { texto: string; clase: string }> = {
  sin_fecha: { texto: "sin fecha de resolución", clase: "border-sev-critica/40 bg-[#fbe9ec] text-sev-critica-t" },
  con_fecha: { texto: "con fecha", clase: "border-sev-media/50 bg-[#fdf7e6] text-sev-media-t" },
  resuelta: { texto: "resuelta", clase: "border-redactor/30 bg-[#eef4e5] text-redactor" },
  no_dice: { texto: "no dice", clase: "border-linea bg-suave text-tinta-2" },
};

/** Segundos desde que arrancó la corrida; se actualiza solo mientras corre. */
function useReloj(desde: number | undefined, hasta: number | undefined, corriendo: boolean) {
  const [ahora, setAhora] = useState(() => Date.now() / 1000);
  useEffect(() => {
    if (!corriendo) return;
    const id = window.setInterval(() => setAhora(Date.now() / 1000), 1000);
    return () => clearInterval(id);
  }, [corriendo]);
  if (!desde) return 0;
  return Math.max(0, (hasta ?? (corriendo ? ahora : desde)) - desde);
}

const reloj = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export default function EnVivo() {
  const { vivo, resumen, serie, correr, parar, ir } = useDatos();
  const [hasta, setHasta] = useState(36);
  const segundos = useReloj(resumen.inicio?.t, resumen.fin?.t, vivo.corriendo);
  const foto = resumen.llegada?.snapshot_id;
  const datosFoto = serie?.fotos.find((f) => f.id === foto);
  const cortada = !vivo.corriendo && vivo.codigo !== null && vivo.codigo !== 0 && !resumen.fin;

  // la alerta nueva aparece grande unos segundos (solo si acaba de salir: al abrir la página después de una corrida, no)
  const [alertaNueva, setAlertaNueva] = useState<AlertaVivo | null>(null);
  const vistas = useRef(resumen.alertas.length);
  useEffect(() => {
    const ultima = resumen.alertas.at(-1);
    if (ultima && resumen.alertas.length > vistas.current && Date.now() / 1000 - ultima.t < 30) {
      setAlertaNueva(ultima);
      vistas.current = resumen.alertas.length;
      const id = window.setTimeout(() => setAlertaNueva(null), 10000);
      return () => clearTimeout(id);
    }
    vistas.current = resumen.alertas.length;
  }, [resumen.alertas]);

  const ultimaAlerta = resumen.alertas.at(-1);
  const casosAbiertos = vivo.registro?.casos.filter((c) => c.estado !== "resuelto").length ?? 0;

  return (
    <div className="mx-auto max-w-[1480px] px-6 py-8 pb-20 lg:px-8">
      <Titulo
        parte="4 · En vivo"
        titulo="Corrida en vivo"
        bajada="Claude Haiku 5.5, desde S001. Cada foto abre una conversación nueva con el coordinador."
      >
        <div className="flex flex-col items-end gap-1.5">
          <div className="flex flex-wrap items-center justify-end gap-3">
            <div role="radiogroup" aria-label="Hasta qué foto correr" className="flex overflow-hidden rounded-md border border-linea bg-tarjeta">
              {OPCIONES.map((o, i) => (
                <button
                  key={o.hasta}
                  role="radio"
                  aria-checked={hasta === o.hasta}
                  disabled={vivo.corriendo}
                  onClick={() => setHasta(o.hasta)}
                  className={cn(
                    "cursor-pointer px-3.5 py-1.5 text-left transition-colors disabled:cursor-not-allowed",
                    i > 0 && "border-l border-linea",
                    hasta === o.hasta ? "bg-acento-suave" : "hover:bg-suave",
                    vivo.corriendo && hasta !== o.hasta && "opacity-50",
                  )}
                >
                  <span className={cn("block text-sm", hasta === o.hasta ? "font-semibold text-acento" : "font-medium")}>{o.nombre}</span>
                  <span className="block text-xs text-tinta-3">{o.detalle}</span>
                </button>
              ))}
            </div>
            {vivo.corriendo ? (
              <button onClick={parar} className="flex h-11 cursor-pointer items-center gap-2 rounded-md border border-linea-fuerte bg-tarjeta px-5 font-medium text-tinta transition hover:bg-suave">
                <Square className="size-3.5 fill-current" aria-hidden /> Parar
              </button>
            ) : (
              <button
                onClick={() => correr(hasta)}
                disabled={!vivo.conectado}
                className="flex h-11 cursor-pointer items-center gap-2 rounded-md bg-acento px-6 font-semibold text-white shadow-sm transition hover:bg-[#0b4b5a] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Play className="size-4 fill-current" aria-hidden /> Correr
              </button>
            )}
          </div>
          <p className="text-xs text-tinta-3">{OPCIONES.find((o) => o.hasta === hasta)?.estimado} · Claude Haiku 5.5</p>
        </div>
      </Titulo>

      {vivo.error && <p className="mt-4 rounded-md border border-sev-critica/40 bg-[#fbe9ec] px-4 py-2 text-sm text-sev-critica-t" role="alert">{vivo.error}</p>}
      {cortada && (
        <p className="mt-4 rounded-md border border-sev-alta/40 bg-[#fdf0e5] px-4 py-2 text-sm text-sev-alta-t" role="alert">
          La corrida se cortó antes de terminar (código {vivo.codigo}). El detalle está en salidas/demo/corrida.txt.
        </p>
      )}

      <Avance />

      <div className="mt-5 grid gap-5 xl:grid-cols-12">
        <div className="space-y-5 xl:col-span-4">
          <Tarjeta>
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <Rotulo>La planta {foto ? `en ${foto}` : ""}</Rotulo>
              {datosFoto && (
                <span className="font-mono text-xs text-tinta-2">
                  {horaDe(datosFoto.hora)} · {datosFoto.turno}
                  {datosFoto.cierre && <span className="ml-1.5 rounded border border-linea bg-suave px-1.5 py-0.5">cierre de turno</span>}
                </span>
              )}
            </div>
            <Tablero cuaderno={vivo.registro} foto={foto} serie={serie} />
          </Tarjeta>
          <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-linea bg-linea">
            <Contador nombre="casos abiertos" valor={casosAbiertos} />
            <Contador nombre="alertas" valor={resumen.alertas.length} clase={resumen.alertas.length ? "text-sev-critica-t" : undefined} />
            <Contador nombre="informes" valor={resumen.informes} />
            <Contador nombre="rechazados por el código" valor={resumen.frenados} clase={resumen.frenados ? "text-sev-media-t" : undefined} />
            <Contador nombre="fotos repetidas" valor={resumen.repetidas} />
            <Contador nombre="tiempo" texto={reloj(segundos)} />
          </dl>
        </div>

        <Tarjeta className="flex flex-col p-0 xl:col-span-5">
          <div className="flex items-center justify-between border-b border-linea px-5 py-3">
            <Rotulo>Qué hace cada agente</Rotulo>
            <div className="flex gap-3 text-xs text-tinta-2">
              {(Object.keys(AGENTES) as Agente[]).map((a) => (
                <span key={a} className="inline-flex items-center gap-1.5">
                  <span className={cn("size-2 rounded-full", AGENTES[a].fondo)} /> {AGENTES[a].nombre}
                </span>
              ))}
            </div>
          </div>
          <Feed items={resumen.feed} corriendo={vivo.corriendo} />
        </Tarjeta>

        <div className="space-y-5 xl:col-span-3">
          <Costo />
          <Tarjeta>
            <Rotulo className="flex items-center gap-2">
              <BellRing className="size-4 text-sev-critica-t" aria-hidden /> Última alerta
            </Rotulo>
            {ultimaAlerta ? (
              <TarjetaAlerta alerta={ultimaAlerta} onTraza={() => ir("traza")} compacta />
            ) : (
              <p className="mt-2 text-sm text-tinta-2">Todavía no hay alertas en esta corrida.</p>
            )}
          </Tarjeta>
        </div>
      </div>

      <AnimatePresence>
        {alertaNueva && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="fixed inset-x-0 bottom-6 z-40 mx-auto w-[min(640px,calc(100%-2rem))]"
            role="alert"
          >
            <div className="relative overflow-hidden rounded-lg border border-linea-fuerte bg-tarjeta p-6 pt-7 shadow-2xl shadow-black/15">
              <span className="absolute inset-x-0 top-0 h-1.5 bg-sev-critica" />
              <button onClick={() => setAlertaNueva(null)} className="absolute top-4 right-4 cursor-pointer text-tinta-3 hover:text-tinta" aria-label="Cerrar la alerta">
                <X className="size-4" />
              </button>
              <TarjetaAlerta alerta={alertaNueva} onTraza={() => { setAlertaNueva(null); ir("traza"); }} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Contador({ nombre, valor, texto, clase }: { nombre: string; valor?: number; texto?: string; clase?: string }) {
  return (
    <div className="bg-tarjeta px-3 py-2.5">
      <dd className={cn("font-mono text-2xl font-medium", clase)}>{texto ?? <Numero valor={valor ?? 0} />}</dd>
      <dt className="text-xs leading-tight text-tinta-2">{nombre}</dt>
    </div>
  );
}

/** Las llegadas de la corrida como una tira: lo que ya pasó se pinta, los cierres de turno y las alertas se marcan. */
function Avance() {
  const { serie, resumen, vivo } = useDatos();
  const total = resumen.inicio?.total ?? 0;
  const orden = resumen.llegada?.orden ?? 0;
  if (!serie || !total || !resumen.inicio) return <div className="mt-6 h-1.5 rounded-full bg-linea" />;
  const hastaN = numeroFoto(resumen.inicio.hasta);
  const llegadas = serie.llegadas.filter((s) => numeroFoto(s) <= hastaN);
  const cierres = new Set(serie.fotos.filter((f) => f.cierre).map((f) => f.id));
  const conAlerta = new Set(resumen.alertas.map((a) => a.snapshot_id));
  return (
    <div className="mt-6">
      <div className="flex items-center justify-between text-sm text-tinta-2">
        <span>
          Llegada <span className="tabular font-mono text-tinta">{orden}</span> de {total}
          {resumen.llegada && <> · foto <span className="font-mono text-tinta">{resumen.llegada.snapshot_id}</span></>}
        </span>
        <span>{vivo.corriendo ? "corriendo…" : resumen.fin ? `terminó en ${resumen.fin.minutos.toLocaleString("es-AR")} min` : ""}</span>
      </div>
      <div className="mt-2 flex h-3 gap-[2px]" aria-hidden>
        {llegadas.map((s, i) => (
          <span key={`${s}${i}`} title={s} className="relative flex-1">
            <span className={cn("absolute inset-x-0 top-0 h-1.5 rounded-[1px] transition-colors duration-300", i < orden ? "bg-acento" : "bg-linea", i === orden - 1 && vivo.corriendo && "animate-pulse")} />
            {cierres.has(s) && <span className="absolute bottom-0 left-1/2 h-1 w-px bg-tinta-3" />}
            {i < orden && conAlerta.has(s) && <span className="absolute -top-1 left-1/2 size-2 -translate-x-1/2 rounded-full bg-sev-critica ring-2 ring-fondo" />}
          </span>
        ))}
      </div>
    </div>
  );
}

// cómo se marca cada fila: solo las importantes llevan color
const MARCA: Partial<Record<ItemFeed["clase"], { icono: LucideIcon; fila: string; icono_clase: string }>> = {
  alerta: { icono: BellRing, fila: "border-l-[3px] border-sev-critica bg-[#fbe9ec]", icono_clase: "text-sev-critica-t" },
  subida: { icono: Flame, fila: "border-l-[3px] border-sev-critica bg-[#fdf3f4]", icono_clase: "text-sev-critica-t" },
  levanta: { icono: CheckCircle2, fila: "border-l-[3px] border-redactor bg-[#f2f7ea]", icono_clase: "text-redactor" },
  frenado: { icono: ShieldAlert, fila: "border-l-[3px] border-sev-media bg-[#fdf8ea]", icono_clase: "text-sev-media-t" },
  informe: { icono: FileText, fila: "", icono_clase: "text-tinta-2" },
  repetida: { icono: Copy, fila: "", icono_clase: "text-tinta-3" },
  fin: { icono: CheckCircle2, fila: "border-l-[3px] border-acento bg-acento-suave", icono_clase: "text-acento" },
};

function Feed({ items, corriendo }: { items: ItemFeed[]; corriendo: boolean }) {
  const visibles = items.slice(-90).reverse();
  if (!items.length) {
    return (
      <div className="grid flex-1 place-items-center p-10 text-center">
        <div className="max-w-sm">
          <Route className="mx-auto size-8 text-tinta-3" aria-hidden />
          <p className="mt-3 font-semibold">{corriendo ? "Arrancando el agente…" : "Elegí hasta qué foto y apretá Correr"}</p>
          <p className="mt-1 text-sm text-tinta-2">
            Acá aparece cada tool que usa cada agente, con su resultado, y los pedidos que rechaza el código.
          </p>
        </div>
      </div>
    );
  }
  return (
    <ol className="scroll-fino h-[min(640px,calc(100dvh-330px))] min-h-[420px] overflow-y-auto px-2 py-2" aria-live="polite" aria-relevant="additions">
      <AnimatePresence initial={false}>
        {visibles.map((it) => (
          <motion.li key={it.id} layout="position" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
            <ItemDelFeed it={it} />
          </motion.li>
        ))}
      </AnimatePresence>
    </ol>
  );
}

function ItemDelFeed({ it }: { it: ItemFeed }) {
  if (it.clase === "llegada") {
    return (
      <div className="mx-2 mt-3 mb-1 flex items-center gap-2 border-b border-linea pb-1.5 text-xs">
        <Camera className="size-3.5 text-tinta-3" aria-hidden />
        <span className="font-mono font-medium text-tinta">{it.titulo.replace("Llegó la foto ", "")}</span>
        {it.detalle && <span className="font-mono text-tinta-3">{it.detalle}</span>}
      </div>
    );
  }
  const marca = MARCA[it.clase];
  const Icono = marca?.icono ?? (it.agente ? ICONO_AGENTE[it.agente] : Workflow);
  return (
    <div className={cn("flex gap-3 rounded-sm px-3 py-2", marca?.fila)}>
      <Icono className={cn("mt-0.5 size-4 shrink-0", marca?.icono_clase ?? (it.agente ? AGENTES[it.agente].texto : "text-tinta-2"))} aria-hidden />
      <div className="min-w-0 flex-1 text-sm">
        <p>
          {it.agente && it.clase !== "alerta" && (
            <span className={cn("mr-2 text-xs font-semibold tracking-wide uppercase", AGENTES[it.agente].texto)}>{AGENTES[it.agente].nombre}</span>
          )}
          <span className={cn(it.clase === "alerta" ? "font-semibold text-sev-critica-t" : "text-tinta")}>{it.titulo}</span>
        </p>
        {it.detalle && <p className="text-xs text-pretty text-tinta-2">{it.detalle}</p>}
        {it.chips && it.chips.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
            {it.chips.map((c) => (
              <span key={c.texto} className="inline-flex items-center gap-1 text-xs text-tinta-2">
                {c.severidad && <span className={cn("size-2 rounded-[2px]", FONDO_SEVERIDAD[c.severidad])} />} {c.texto}
              </span>
            ))}
          </div>
        )}
        {it.cita && <Cita className="mt-1.5 text-xs" color={it.clase === "subida" ? "critica" : "lector"}>{it.cita}</Cita>}
        {it.estado && (
          <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
            <span className={cn("rounded border px-1.5 py-0.5 font-medium", ESTADO_LECTOR[it.estado]?.clase ?? "border-linea bg-suave")}>
              {ESTADO_LECTOR[it.estado]?.texto ?? it.estado}
            </span>
            {it.texto && <span className="text-tinta-2">“{it.texto}”</span>}
          </p>
        )}
        {it.clase === "alerta" && it.texto && <Markdown texto={it.texto} className="mt-2 text-xs" />}
      </div>
    </div>
  );
}

function Costo() {
  const { resumen } = useDatos();
  const c = resumen.costos;
  const total = c?.usd ?? 0;
  return (
    <Tarjeta>
      <Rotulo>Costo de esta corrida</Rotulo>
      <p className="mt-2 font-mono text-4xl font-medium tracking-tight">
        <Numero valor={total} formato={(n) => usd(n, 3)} />
      </p>
      <p className="tabular mt-1 text-xs text-tinta-3">
        {c ? `${c.input_tokens.toLocaleString("es-AR")} tokens de entrada · ${c.output_tokens.toLocaleString("es-AR")} de salida` : "todavía nada"}
      </p>
      <div className="mt-4 space-y-3">
        {(Object.keys(AGENTES) as Agente[]).map((a) => {
          const g = c?.agentes[a];
          const parte = total ? (g?.usd ?? 0) / total : 0;
          return (
            <div key={a}>
              <div className="flex items-baseline justify-between text-sm">
                <span className={cn("font-medium", AGENTES[a].texto)}>{AGENTES[a].nombre}</span>
                <span className="tabular font-mono text-xs text-tinta-2">
                  {g?.veces ?? 0} veces · <Numero valor={g?.usd ?? 0} formato={(n) => usd(n, 3)} className="text-tinta" />
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-suave">
                <motion.div className={cn("h-full rounded-full", AGENTES[a].fondo)} animate={{ width: `${Math.max(parte * 100, g?.usd ? 2 : 0)}%` }} transition={{ duration: 0.5 }} />
              </div>
            </div>
          );
        })}
      </div>
    </Tarjeta>
  );
}

/** Una alerta con su traza corta: en qué foto, por qué y con qué cita. */
function TarjetaAlerta({ alerta, onTraza, compacta }: { alerta: AlertaVivo; onTraza: () => void; compacta?: boolean }) {
  const { vivo } = useDatos();
  const caso = buscarCaso(vivo.registro, alerta.caso_id);
  // el porqué y la cita salen del cuaderno (los anota el código), no del texto que escribió el redactor
  const porBitacora = caso?.escalado_por ? caso.escalado_por === "agente" : alerta.porBitacora;
  const subida = caso && vivo.registro?.subidas.find((s) => s.modelo === caso.modelo && numeroFoto(s.subida_en) <= numeroFoto(alerta.snapshot_id));
  const cita = porBitacora ? (subida?.fragmento ?? alerta.cita) : undefined;
  return (
    <div className={cn(!compacta && "pr-6")}>
      {!compacta && <p className="text-sm font-semibold text-sev-critica-t">Alerta inmediata</p>}
      <p className={cn("font-semibold tracking-tight", compacta ? "mt-2 text-lg" : "mt-1 text-2xl")}>
        {alerta.caso_id} · {caso ? comb(caso) : ""} pasó a crítica
      </p>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-tinta-3">Foto</dt>
        <dd className="font-mono">{alerta.snapshot_id}</dd>
        <dt className="text-tinta-3">Por qué</dt>
        <dd>{porBitacora ? `la bitácora ${subida?.bitacora ?? ""} dice que la causa sigue sin fecha de resolución` : "los números llegaron a crítica"}</dd>
        {caso?.causa && (
          <>
            <dt className="text-tinta-3">Causa</dt>
            <dd>
              {NOMBRE_CATEGORIA[caso.causa.categoria] ?? caso.causa.categoria}
              {caso.causa.bitacora && <span className="text-tinta-2"> · bitácora {caso.causa.bitacora}</span>}
            </dd>
          </>
        )}
      </dl>
      {cita && <Cita className="mt-3 text-sm" color="critica">{cita}</Cita>}
      <button onClick={onTraza} className="mt-4 inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-acento hover:underline">
        <Route className="size-4" aria-hidden /> Ver la traza completa
      </button>
    </div>
  );
}
