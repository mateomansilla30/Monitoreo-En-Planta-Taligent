import {
  BellRing, BookOpenText, CheckCircle2, ChevronRight, Copy, FileText, Flame, FolderOpen, PenLine, Play, Route, ShieldAlert, Square, Workflow, X,
  type LucideIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Timeline, type TimelineEvent, type TimelineGroup } from "@/components/ui/timeline";
import { Cita, EtiquetaSeveridad, Markdown, Numero, Rotulo, Tarjeta, Titulo } from "@/componentes/basicos";
import { AgentesEnVivo } from "@/componentes/AgentesEnVivo";
import { Cargando } from "@/componentes/Cargando";
import { Tablero } from "@/componentes/tablero";
import { useDatos } from "@/contexto";
import {
  AGENTES, FONDO_SEVERIDAD, NOMBRE_CATEGORIA, NOMBRE_SEVERIDAD, buscarCaso, comb, costoSinCache, decimal, horaDe, idsDe, numeroFoto, usd,
  type Agente, type Cuaderno,
} from "@/datos";
import { cn } from "@/lib/utils";
import type { AlertaVivo, Apertura, ItemFeed } from "@/vivo";

// con caché: S016 y S038 medidos el 24/11, los 10 días el 25/11 (10,2 min · USD 0,087); S036, estimado
const OPCIONES = [
  { hasta: 16, nombre: "Hasta S016", detalle: "La alerta de SUV/Europa, por los números", estimado: "unos 2 min · USD 0,02" },
  { hasta: 36, nombre: "Hasta S036", detalle: "Las alertas de Pickup, por la bitácora T17", estimado: "unos 6 min · USD 0,05" },
  { hasta: 38, nombre: "Hasta S038", detalle: "Además, se levanta la subida de Pickup", estimado: "unos 6½ min · USD 0,05" },
  { hasta: 60, nombre: "10 días", detalle: "Las 61 llegadas", estimado: "unos 10 min · USD 0,09" },
];

/** Cuántas fotos se muestran en el feed: las últimas. */
const FOTOS_EN_EL_FEED = 8;

const ICONO_AGENTE: Record<Agente, LucideIcon> = { coordinador: Workflow, lector: BookOpenText, redactor: PenLine };
const MARCADOR_AGENTE: Record<Agente, string> = {
  coordinador: "border-coord/30 bg-[#eef3fe] text-coord",
  lector: "border-lector/30 bg-[#e9f5f7] text-lector",
  redactor: "border-redactor/30 bg-[#ecf6ee] text-redactor",
};
// lo que no es un paso común lleva su ícono y su color
const MARCA: Partial<Record<ItemFeed["clase"], { icono: LucideIcon; marcador: string; fila?: string }>> = {
  // la apertura la hace el código (registro.py), no un agente: va con el color del código
  apertura: { icono: FolderOpen, marcador: "border-codigo bg-codigo text-white", fila: "rounded-md bg-[#eef1f5]" },
  alerta: { icono: BellRing, marcador: "border-sev-critica bg-sev-critica text-white", fila: "rounded-md bg-[#fdf1f3]" },
  subida: { icono: Flame, marcador: "border-sev-critica/50 bg-[#fbe9ec] text-sev-critica-t" },
  levanta: { icono: CheckCircle2, marcador: "border-redactor/40 bg-[#ecf6ee] text-redactor" },
  frenado: { icono: ShieldAlert, marcador: "border-sev-media bg-[#fdf7e6] text-sev-media-t", fila: "rounded-md bg-[#fefaf0]" },
  informe: { icono: FileText, marcador: "border-acento bg-acento text-white", fila: "rounded-md bg-acento-suave" },
  repetida: { icono: Copy, marcador: "text-tinta-3" },
};

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
  const { vivo, resumen, correr, parar } = useDatos();
  const [hasta, setHasta] = useState(36);
  const opcion = OPCIONES.find((o) => o.hasta === hasta)!;
  const cortada = !vivo.corriendo && vivo.codigo !== null && vivo.codigo !== 0 && !resumen.fin;

  return (
    <div className="mx-auto max-w-[1480px] px-6 py-8 pb-20 lg:px-8">
      <Titulo parte="3 · En vivo" titulo="Corrida en vivo" bajada="Claude Haiku 5.5 desde S001. Cada foto es una conversación nueva con el coordinador.">
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-3">
            <SegmentedControl
              label="Hasta qué foto correr"
              options={OPCIONES.map((o) => ({ value: String(o.hasta), label: o.nombre }))}
              value={String(hasta)}
              onValueChange={(v) => setHasta(Number(v))}
              disabled={vivo.corriendo}
            />
            {vivo.corriendo ? (
              <button onClick={parar} className="flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-linea-fuerte bg-tarjeta px-4 text-sm font-medium transition hover:bg-suave">
                <Square className="size-3 fill-current" aria-hidden /> Parar
              </button>
            ) : (
              <button
                onClick={() => correr(hasta)}
                disabled={!vivo.conectado}
                className="flex h-9 cursor-pointer items-center gap-2 rounded-lg bg-acento px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0b4b5a] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Play className="size-3.5 fill-current" aria-hidden /> Correr
              </button>
            )}
          </div>
          <p className="text-xs text-tinta-2">
            {opcion.detalle} <span className="text-tinta-3">· {opcion.estimado}</span>
          </p>
        </div>
      </Titulo>

      {vivo.error && <p className="mt-4 rounded-md border border-sev-critica/40 bg-[#fbe9ec] px-4 py-2 text-sm text-sev-critica-t" role="alert">{vivo.error}</p>}
      {cortada && (
        <p className="mt-4 rounded-md border border-sev-alta/40 bg-[#fdf0e5] px-4 py-2 text-sm text-sev-alta-t" role="alert">
          La corrida se cortó antes de terminar (código {vivo.codigo}). El detalle está en salidas/demo/corrida.txt.
        </p>
      )}

      <Banda />

      <div className="mt-5 grid items-start gap-5 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <PanelIzquierdo />
        <Actividad />
      </div>

      <AlertaNueva />
    </div>
  );
}

/** Dónde va la corrida: la foto, el avance y los tres números que importan. */
function Banda() {
  const { vivo, resumen, serie } = useDatos();
  const segundos = useReloj(resumen.inicio?.t, resumen.fin?.t, vivo.corriendo);
  const foto = resumen.llegada?.snapshot_id;
  const datos = serie?.fotos.find((f) => f.id === foto);
  const c = resumen.costos;
  const leidos = c?.cache_read_input_tokens ?? 0;

  return (
    <Tarjeta className="mt-5 grid items-center gap-x-8 gap-y-4 p-0 lg:grid-cols-[230px_minmax(0,1fr)_auto]">
      <div className="px-6 pt-4 lg:py-4">
        <Etiqueta>Foto</Etiqueta>
        <p className="mt-1.5 flex items-center gap-2 font-mono text-3xl leading-none font-medium tracking-tight">
          {foto ? (
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span key={`${foto}${resumen.llegada?.orden}`} className="inline-block" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
                {foto}
              </motion.span>
            </AnimatePresence>
          ) : (
            <span className="text-tinta-3">—</span>
          )}
          {datos?.cierre && <span className="rounded border border-linea bg-suave px-1.5 py-0.5 font-sans text-xs font-normal tracking-normal text-tinta-2">cierre de turno</span>}
        </p>
        <p className="mt-2 text-xs text-tinta-2">
          {datos
            ? `${new Date(datos.hora).toLocaleDateString("es-AR", { weekday: "long" })} ${horaDe(datos.hora)} · turno ${datos.turno}`
            : vivo.corriendo ? "arrancando…" : "todavía no corrió"}
        </p>
      </div>

      <div className="px-6 lg:px-0">
        <Avance />
      </div>

      <dl className="flex border-t border-linea lg:border-t-0 lg:border-l">
        <Dato nombre="Costo" className="min-w-[160px]">
          <Numero valor={c?.usd ?? 0} formato={(n) => usd(n, 3)} />
          <span className="mt-2 block">
            <CostoPorAgente />
          </span>
          <span className="mt-1.5 block font-sans text-xs font-normal tracking-normal text-tinta-3">
            {leidos > 0 && c ? <>sin caché <Numero valor={costoSinCache(c)} formato={(n) => usd(n, 3)} className="font-mono" /></> : " "}
          </span>
        </Dato>
        <Dato nombre="Alertas" pie={`${resumen.informes} informes`} className={resumen.alertas.length > 0 ? "text-sev-critica-t" : undefined}>
          <Numero valor={resumen.alertas.length} />
        </Dato>
        <Dato nombre="Frenados" pie="por el código" className={resumen.frenados > 0 ? "text-sev-media-t" : undefined}>
          <Numero valor={resumen.frenados} />
        </Dato>
        <Dato nombre="Tiempo" pie={vivo.corriendo ? "corriendo" : resumen.fin ? "terminó" : " "}>
          <span className="tabular">{reloj(segundos)}</span>
        </Dato>
      </dl>
    </Tarjeta>
  );
}

function Etiqueta({ children }: { children: React.ReactNode }) {
  return <span className="text-xs font-medium tracking-wide text-tinta-3 uppercase">{children}</span>;
}

/** Uno de los números de la banda: nombre, valor grande y una línea chica abajo. */
function Dato({ nombre, pie, className, children }: { nombre: string; pie?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className="min-w-[112px] flex-1 border-l border-linea px-6 py-4 first:border-l-0 lg:flex-none">
      <dt><Etiqueta>{nombre}</Etiqueta></dt>
      <dd className={cn("mt-1.5 font-mono text-3xl leading-none font-medium tracking-tight", className)}>{children}</dd>
      {pie && <dd className="mt-2 text-xs text-tinta-3">{pie}</dd>}
    </div>
  );
}

/** El costo repartido entre los tres agentes, en una barra con sus colores. */
function CostoPorAgente() {
  const { resumen } = useDatos();
  const c = resumen.costos;
  const total = c?.usd ?? 0;
  return (
    <span className="flex h-1.5 w-full overflow-hidden rounded-full bg-suave" aria-hidden>
      {(Object.keys(AGENTES) as Agente[]).map((a) => (
        <motion.span
          key={a}
          title={`${AGENTES[a].nombre}: ${usd(c?.agentes[a]?.usd ?? 0, 3)}`}
          className={AGENTES[a].fondo}
          animate={{ width: `${total ? ((c?.agentes[a]?.usd ?? 0) / total) * 100 : 0}%` }}
          transition={{ duration: 0.5 }}
        />
      ))}
    </span>
  );
}

/** Las llegadas de la corrida como una tira: lo que ya pasó se pinta, los cierres de turno y las alertas se marcan. */
function Avance() {
  const { serie, resumen, vivo } = useDatos();
  const total = resumen.inicio?.total ?? 0;
  const orden = resumen.llegada?.orden ?? 0;
  if (!serie || !total || !resumen.inicio) {
    return (
      <div>
        <p className="text-sm text-tinta-3">{vivo.corriendo ? "Esperando la primera foto…" : "Elegí hasta qué foto y apretá Correr."}</p>
        <div className="mt-3 h-2 rounded-full bg-suave" />
      </div>
    );
  }
  const hastaN = numeroFoto(resumen.inicio.hasta);
  const llegadas = serie.llegadas.filter((s) => numeroFoto(s) <= hastaN);
  const cierres = new Set(serie.fotos.filter((f) => f.cierre).map((f) => f.id));
  const conAlerta = new Set(resumen.alertas.map((a) => a.snapshot_id));
  return (
    <div>
      <p className="flex items-baseline justify-between text-sm text-tinta-2">
        <span>
          Llegada <span className="tabular font-mono text-tinta">{orden}</span> de {total}
        </span>
        <span className="text-xs text-tinta-3">hasta {resumen.inicio.hasta}</span>
      </p>
      <div className="mt-2.5 flex h-4 gap-[2px]" aria-hidden>
        {llegadas.map((s, i) => (
          <span key={`${s}${i}`} title={s} className="relative flex-1">
            <span
              className={cn(
                "absolute inset-x-0 top-0 h-2 rounded-[2px] transition-colors duration-300",
                i < orden ? "bg-acento" : "bg-suave",
                i === orden - 1 && vivo.corriendo && "animate-pulse",
              )}
            />
            {cierres.has(s) && <span className="absolute bottom-0 left-1/2 h-1.5 w-px bg-linea-fuerte" />}
            {i < orden && conAlerta.has(s) && <span className="absolute -top-1 left-1/2 size-2.5 -translate-x-1/2 rounded-full bg-sev-critica ring-2 ring-tarjeta" />}
          </span>
        ))}
      </div>
    </div>
  );
}

/** A la izquierda: los agentes trabajando (mientras corre) o la planta con sus casos (al terminar). */
function PanelIzquierdo() {
  const { vivo } = useDatos();
  const [vista, setVista] = useState(vivo.corriendo ? "agentes" : "planta");
  useEffect(() => setVista(vivo.corriendo ? "agentes" : "planta"), [vivo.corriendo]);
  const selector = (
    <SegmentedControl label="Qué mostrar" options={[{ value: "agentes", label: "Agentes" }, { value: "planta", label: "Planta" }]} value={vista} onValueChange={setVista} />
  );
  return vista === "agentes" ? <AgentesEnVivo selector={selector} /> : <Planta selector={selector} />;
}

/** La planta en la foto actual y, al pie, las alertas que salieron en la corrida. */
function Planta({ selector }: { selector: ReactNode }) {
  const { vivo, resumen, serie, ir } = useDatos();
  const foto = resumen.llegada?.snapshot_id;
  return (
    <Tarjeta className="p-0">
      <div className="px-5 pt-4 pb-5">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <Rotulo>La planta {foto ? `en ${foto}` : ""} <span className="ml-1 text-xs font-normal text-tinta-3">el caso de cada combinación</span></Rotulo>
          {selector}
        </div>
        <Tablero cuaderno={vivo.registro} foto={foto} serie={serie} />
      </div>

      <div className="border-t border-linea">
        <p className="flex items-center gap-2 px-5 pt-3 pb-1">
          <BellRing className="size-3.5 text-sev-critica-t" aria-hidden />
          <Etiqueta>Alertas de esta corrida</Etiqueta>
        </p>
        {resumen.alertas.length === 0 ? (
          <p className="px-5 pt-1 pb-4 text-sm text-tinta-3">Todavía ninguna.</p>
        ) : (
          <ul className="pb-2">
            {resumen.alertas.map((a) => {
              const caso = buscarCaso(vivo.registro, a.caso_id);
              const porBitacora = caso?.escalado_por ? caso.escalado_por === "agente" : a.porBitacora;
              return (
                <motion.li key={`${a.snapshot_id}${a.caso_id}`} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}>
                  <button onClick={() => ir("traza")} className="group flex w-full cursor-pointer items-center gap-4 px-5 py-2 text-left transition-colors hover:bg-suave">
                    <span className="font-mono text-sm text-tinta-2">{a.snapshot_id}</span>
                    <span className="flex-1 text-sm font-medium">
                      {a.caso_id} · {caso ? comb(caso) : ""}
                    </span>
                    <span className={cn("rounded border px-1.5 py-0.5 text-xs", porBitacora ? "border-sev-critica/30 bg-[#fbe9ec] text-sev-critica-t" : "border-linea bg-suave text-tinta-2")}>
                      {porBitacora ? "por la bitácora" : "por los números"}
                    </span>
                    <ChevronRight className="size-4 text-tinta-3 transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </button>
                </motion.li>
              );
            })}
          </ul>
        )}
      </div>
    </Tarjeta>
  );
}

/** El feed: cada foto es un grupo, con lo que hizo cada agente en orden. */
function Actividad() {
  const { vivo, resumen } = useDatos();
  const grupos = useMemo(() => agrupar(resumen.feed, resumen.inicio?.t, vivo.registro), [resumen.feed, resumen.inicio?.t, vivo.registro]);
  return (
    <Tarjeta className="flex flex-col p-0">
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
      {grupos.length === 0 ? (
        <div className="grid min-h-[420px] flex-1 place-items-center p-10 text-center">
          {vivo.corriendo ? (
            <Cargando />
          ) : (
            <div className="max-w-sm">
              <Route className="mx-auto size-8 text-tinta-3" aria-hidden />
              <p className="mt-3 font-semibold">Acá aparece cada paso de cada agente</p>
              <p className="mt-1 text-sm text-tinta-2">Foto por foto: qué procesa, qué lee, qué escribe y qué frena el código.</p>
            </div>
          )}
        </div>
      ) : (
        <Timeline groups={grupos} label="Lo que hace cada agente, foto por foto" maxHeight="max(380px, calc(100dvh - 455px))" className="px-4 pb-2" />
      )}
    </Tarjeta>
  );
}

/** Arma los grupos del feed: uno por llegada, con sus pasos en orden. El más nuevo arriba. */
function agrupar(feed: ItemFeed[], inicio: number | undefined, registro: Cuaderno | null): TimelineGroup[] {
  const grupos: TimelineGroup[] = [];
  for (const it of feed) {
    if (it.clase === "llegada") {
      grupos.push({ id: `ll-${it.id}`, label: it.foto ?? "", sublabel: it.detalle, events: [] });
    } else if (it.clase !== "fin" && grupos.length) {
      grupos[grupos.length - 1].events.push(evento(it, inicio, registro));
    }
  }
  return grupos.slice(-FOTOS_EN_EL_FEED).reverse();
}

function evento(it: ItemFeed, inicio: number | undefined, registro: Cuaderno | null): TimelineEvent {
  const marca = MARCA[it.clase];
  const Icono = marca?.icono ?? (it.agente ? ICONO_AGENTE[it.agente] : Workflow);
  const estado = it.estado ? ESTADO_LECTOR[it.estado] : undefined;
  const esAlerta = it.clase === "alerta";
  const esInforme = it.clase === "informe";
  const caso = esAlerta ? buscarCaso(registro, it.titulo.replace("ALERTA · ", "")) : undefined;
  // las novedades y los casos activos del informe, del cuaderno
  const informe = esInforme ? registro?.informes.find((i) => i.snapshot_id === it.foto) : undefined;
  const novedades = informe ? idsDe(informe.novedades) : [];

  return {
    id: `ev-${it.id}`,
    actor: it.agente && !esAlerta && !esInforme ? AGENTES[it.agente].nombre : undefined,
    actorClassName: it.agente ? AGENTES[it.agente].texto : undefined,
    icon: <Icono aria-hidden />,
    markerClassName: marca?.marcador || (it.agente ? MARCADOR_AGENTE[it.agente] : undefined),
    rowClassName: marca?.fila,
    time: inicio ? reloj(it.t - inicio) : undefined,
    title: esAlerta ? (
      <span className="font-semibold text-sev-critica-t">
        Alerta: {caso ? `${caso.caso_id} · ${comb(caso)}` : it.titulo.replace("ALERTA · ", "")} pasó a crítica
      </span>
    ) : esInforme ? (
      <span className="font-semibold text-acento">{it.titulo}</span>
    ) : it.apertura ? (
      <span className="font-semibold text-codigo">{it.titulo}</span>
    ) : (
      it.titulo
    ),
    meta: (
      <>
        {it.detalle}
        {it.apertura && (
          <span className="inline-flex flex-wrap items-center gap-x-1.5">
            <EtiquetaSeveridad severidad={it.apertura.severidad} className="text-xs" />
            <span>· faltan {it.apertura.faltantes} ({decimal(it.apertura.pct)} %)</span>
            {it.apertura.pierden > 0 && <span>· {it.apertura.pierden} pierden el embarque</span>}
          </span>
        )}
        {informe && (
          <>
            {novedades.length ? `Novedades: ${novedades.join(", ")}` : "Sin novedades"}
            {" · "}
            {informe.casos_activos.length} {informe.casos_activos.length === 1 ? "caso activo" : "casos activos"}
          </>
        )}
        {it.chips && it.chips.length > 0 && (
          <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
            {it.chips.map((c) => (
              <span key={c.texto} className="inline-flex items-center gap-1">
                {c.severidad && <span className={cn("size-2 rounded-[2px]", FONDO_SEVERIDAD[c.severidad])} />} {c.texto}
              </span>
            ))}
          </span>
        )}
        {estado && <span className={cn("ml-1.5 inline-block rounded border px-1.5 py-px text-[11px] font-medium", estado.clase)}>{estado.texto}</span>}
        {(it.clase === "subida" || it.clase === "levanta") && it.cita && (
          <Cita className="mt-1.5 text-xs" color={it.clase === "subida" ? "critica" : "redactor"}>{it.cita}</Cita>
        )}
      </>
    ),
    detail: esAlerta && it.texto ? (
      <Markdown texto={it.texto} className="rounded-md border border-linea bg-tarjeta p-3 text-xs" />
    ) : esInforme && it.texto ? (
      <div className="scroll-fino max-h-[440px] overflow-auto rounded-md border border-acento/20 bg-tarjeta p-4">
        <Markdown texto={it.texto} className="text-xs" />
      </div>
    ) : it.apertura ? (
      <DetalleApertura a={it.apertura} />
    ) : it.clase === "agente" && it.agente === "lector" && (it.cita || it.texto) ? (
      <div className="space-y-1.5 text-xs">
        {it.cita && <Cita color="lector">{it.cita}</Cita>}
        {it.texto && <p className="text-tinta-2">Sobre el estado: “{it.texto}”</p>}
      </div>
    ) : undefined,
  };
}

/** Por qué se abrió un caso: las dos cuentas del código y la severidad que sale de ellas. */
function DetalleApertura({ a }: { a: Apertura }) {
  return (
    <div className="rounded-md border border-codigo/20 bg-tarjeta p-3 text-xs">
      <dl className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-2">
        <dt className="text-tinta-3">Contra el plan</dt>
        <dd>
          {a.plan !== undefined && a.real !== undefined && <>Tendrían que haber salido {a.plan} autos y salieron {a.real}: </>}
          faltan <b>{a.faltantes}</b>, el {decimal(a.pct)} % del plan del día.
        </dd>
        <dd><EtiquetaSeveridad severidad={a.sevFaltantes} className="text-xs" /></dd>

        <dt className="text-tinta-3">Embarques</dt>
        <dd>
          {a.pierden > 0
            ? <>{a.pierden} autos no llegan a su embarque: {a.dias} {a.dias === 1 ? "día" : "días"} de retraso.</>
            : "Todos los autos llegan a su embarque."}
        </dd>
        <dd><EtiquetaSeveridad severidad={a.sevEmbarque} className="text-xs" /></dd>

        {a.etapa && (
          <>
            <dt className="text-tinta-3">Dónde se traban</dt>
            <dd className="col-span-2">{a.etapa}</dd>
          </>
        )}
      </dl>
      <p className="mt-2.5 border-t border-linea pt-2 text-tinta-2">
        La severidad es la peor de las dos: <b className="text-tinta">{NOMBRE_SEVERIDAD[a.severidad]}</b>. Desde media, el código abre un caso
        para seguirlo.
      </p>
    </div>
  );
}

/** Cuando sale una alerta, aparece grande abajo unos segundos (solo si acaba de salir, no al abrir la página después). */
function AlertaNueva() {
  const { resumen, ir } = useDatos();
  const [alerta, setAlerta] = useState<AlertaVivo | null>(null);
  const vistas = useRef(resumen.alertas.length);
  useEffect(() => {
    const ultima = resumen.alertas.at(-1);
    if (ultima && resumen.alertas.length > vistas.current && Date.now() / 1000 - ultima.t < 30) {
      setAlerta(ultima);
      vistas.current = resumen.alertas.length;
      const id = window.setTimeout(() => setAlerta(null), 10000);
      return () => clearTimeout(id);
    }
    vistas.current = resumen.alertas.length;
  }, [resumen.alertas]);

  return (
    <AnimatePresence>
      {alerta && (
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
            <button onClick={() => setAlerta(null)} className="absolute top-4 right-4 cursor-pointer text-tinta-3 hover:text-tinta" aria-label="Cerrar la alerta">
              <X className="size-4" />
            </button>
            <TarjetaAlerta alerta={alerta} onTraza={() => { setAlerta(null); ir("traza"); }} />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Una alerta con su traza corta: en qué foto, por qué y con qué cita. */
function TarjetaAlerta({ alerta, onTraza }: { alerta: AlertaVivo; onTraza: () => void }) {
  const { vivo } = useDatos();
  const caso = buscarCaso(vivo.registro, alerta.caso_id);
  // el porqué y la cita salen del cuaderno (los anota el código), no del texto que escribió el redactor
  const porBitacora = caso?.escalado_por ? caso.escalado_por === "agente" : alerta.porBitacora;
  const subida = caso && vivo.registro?.subidas.find((s) => s.modelo === caso.modelo && numeroFoto(s.subida_en) <= numeroFoto(alerta.snapshot_id));
  const cita = porBitacora ? (subida?.fragmento ?? alerta.cita) : undefined;
  return (
    <div className="pr-6">
      <p className="text-sm font-semibold text-sev-critica-t">Alerta inmediata</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">
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
