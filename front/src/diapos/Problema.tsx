import { AnimatePresence, motion } from "motion/react";
import {
  ArrowRight, BellOff, BellRing, Camera, CarFront, CornerDownRight, Check, CheckCircle2, CircleHelp, Clock, Eye, FileText, Flame, FolderOpen,
  OctagonX, PackageX, PanelLeftClose, PanelLeftOpen, RotateCcw, ShieldX, Ship, UserX, X,
  type LucideIcon,
} from "lucide-react";
import { Fragment, useEffect, useState, type ReactNode } from "react";
import { Stepper, StepperIndicator, StepperItem, StepperSeparator, StepperTitle, StepperTrigger } from "@/components/stepper";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { EtiquetaSeveridad } from "@/componentes/basicos";
import { Fabrica } from "@/componentes/Fabrica";
import { Oficina } from "@/componentes/Oficina";
import { ESTACIONES, LineaDeMontaje } from "@/componentes/LineaDeMontaje";
import { useDatos } from "@/contexto";
import {
  FONDO_SEVERIDAD, MERCADOS, MODELOS, NOMBRE_SEVERIDAD, SEVERIDADES, TEXTO_SEVERIDAD,
  decimal, horaDe, numeroFoto, type EstadoCaso, type Serie, type Severidad,
} from "@/datos";
import { cn } from "@/lib/utils";

const ESCENAS = [
  "La planta", "La línea", "El plan", "Las fotos", "¿Faltan autos?", "¿Llega al embarque?", "La severidad",
  "El caso", "La causa", "Subir la severidad", "La decisión", "Hoy, a mano",
];

/** El problema contado en escenas: ↓ / ↑ o los pasos de arriba para avanzar. */
export default function Problema() {
  // ?escena=3 abre directo en esa escena
  const [escena, setEscena] = useState(() => Number(new URLSearchParams(location.search).get("escena")) || 1);
  // el índice abierto o cerrado se recuerda en este navegador (si no hay almacenamiento, arranca abierto)
  const [abierto, setAbierto] = useState(() => {
    try {
      return localStorage.getItem("indice-problema") !== "cerrado";
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("indice-problema", abierto ? "abierto" : "cerrado");
    } catch {
      /* sin almacenamiento: no se recuerda */
    }
  }, [abierto]);

  useEffect(() => {
    // ↑ ↓ cambian de escena siempre, aunque se haya tocado un deslizador o un control
    const tecla = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === "ArrowDown") setEscena((n) => Math.min(ESCENAS.length, n + 1));
      if (e.key === "ArrowUp") setEscena((n) => Math.max(1, n - 1));
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, []);

  return (
    <div className="mx-auto grid min-h-full max-w-[1480px] grid-cols-[auto_minmax(0,1fr)] gap-10 px-6 py-8 lg:px-10">
      {/* el índice de escenas, a la izquierda y fijo mientras cambia la escena; se cierra a una columna de números */}
      <motion.aside className="sticky top-8 self-start overflow-hidden" initial={false} animate={{ width: abierto ? 200 : 32 }} transition={{ duration: 0.25, ease: "easeOut" }}>
        <div className="flex h-7 items-center justify-between gap-2">
          {abierto && <p className="text-sm font-medium whitespace-nowrap text-acento">1 · El problema</p>}
          <button
            onClick={(e) => { setAbierto((a) => !a); e.currentTarget.blur(); }}
            aria-label={abierto ? "Cerrar el índice" : "Abrir el índice"}
            aria-expanded={abierto}
            className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-md text-tinta-3 transition-colors hover:bg-suave hover:text-tinta"
          >
            {abierto ? <PanelLeftClose className="size-4" aria-hidden /> : <PanelLeftOpen className="size-4" aria-hidden />}
          </button>
        </div>
        <Stepper value={escena} onValueChange={setEscena} orientation="vertical" className="mt-5 w-full">
          {ESCENAS.map((nombre, i) => (
            <StepperItem key={nombre} step={i + 1} className="relative w-full items-start pb-2.5">
              <StepperTrigger className="w-full cursor-pointer items-center gap-3 rounded-md text-left" title={abierto ? undefined : nombre}>
                <StepperIndicator className="size-7 shrink-0" />
                {abierto && (
                  <StepperTitle className={cn("text-sm whitespace-nowrap transition-colors", escena === i + 1 ? "font-semibold text-tinta" : "font-normal text-tinta-3 hover:text-tinta-2")}>{nombre}</StepperTitle>
                )}
              </StepperTrigger>
              {i < ESCENAS.length - 1 && (
                <StepperSeparator className="absolute top-[30px] left-3.5 m-0 -translate-x-1/2 bg-linea group-data-[orientation=vertical]/stepper:h-[calc(100%-32px)]" />
              )}
            </StepperItem>
          ))}
        </Stepper>
        {abierto && <p className="mt-6 text-sm whitespace-nowrap text-tinta-3">↓ siguiente · ↑ anterior</p>}
      </motion.aside>

      <div className="relative min-w-0">
        <AnimatePresence mode="wait">
          <motion.div key={escena} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.25 }}>
            {escena === 1 && <LaPlanta />}
            {escena === 2 && <LaLinea />}
            {escena === 3 && <ElPlan />}
            {escena === 4 && <LasFotos />}
            {escena === 5 && <FaltanAutos />}
            {escena === 6 && <LosEmbarques />}
            {escena === 7 && <LaSeveridad />}
            {escena === 8 && <ElCaso />}
            {escena === 9 && <LaCausa />}
            {escena === 10 && <SubirSeveridad />}
            {escena === 11 && <LaDecision />}
            {escena === 12 && <AMano />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function Escena({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-4xl font-semibold tracking-tight md:text-5xl">{titulo}</h2>
      <div className="mt-8">{children}</div>
    </section>
  );
}

/** Un ícono en un círculo, el elemento visual que se repite en las escenas. */
function Icono({ icono: I, clase, grande }: { icono: LucideIcon; clase?: string; grande?: boolean }) {
  return (
    <span className={cn("grid shrink-0 place-items-center rounded-full", grande ? "size-14" : "size-10", clase ?? "bg-suave text-tinta-2")}>
      <I className={grande ? "size-7" : "size-5"} aria-hidden />
    </span>
  );
}

// 1 · La planta: la fábrica funcionando
function LaPlanta() {
  return (
    <section>
      <Fabrica />
    </section>
  );
}

// 2 · La línea: un auto que entra a cada galpón y sale cambiado, y las 9 combinaciones
function LaLinea() {
  return (
    <Escena titulo="Así se arma un auto">
      <LineaDeMontaje />

      <div className="mt-10 grid items-center gap-12 lg:grid-cols-[auto_1fr]">
        <div>
          <p className="font-mono text-6xl font-medium">3 <span className="text-tinta-3">×</span> 3 <span className="text-tinta-3">=</span> <span className="text-acento">9</span></p>
          <p className="mt-2 text-xl text-tinta-2">modelos × mercados = combinaciones</p>
          <p className="mt-1 text-lg text-tinta-3">Cada una se sigue por separado.</p>
        </div>
        <div className="grid grid-cols-[auto_repeat(3,minmax(0,1fr))] gap-2">
          <span />
          {MERCADOS.map((m) => <span key={m} className="text-center text-tinta-3">{m}</span>)}
          {MODELOS.map((modelo, i) => (
            <div key={modelo} className="contents">
              <span className="flex items-center pr-3 text-lg font-medium">{modelo}</span>
              {MERCADOS.map((m, j) => (
                <motion.span
                  key={m}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.6 + (i * 3 + j) * 0.06 }}
                  className="flex h-14 items-center justify-center gap-2 rounded-lg border border-linea bg-tarjeta text-tinta-2"
                >
                  <CarFront className="size-5 text-acento" aria-hidden /> {modelo}/{m}
                </motion.span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </Escena>
  );
}

// 3 · El plan: cuántos autos tiene que terminar cada combinación por turno, y cómo se va sumando foto a foto
const PLAN: Record<string, number[]> = { Sedán: [12, 8, 4], SUV: [8, 6, 10], Pickup: [10, 10, 4] }; // por turno: Local, Brasil, Europa

function ElPlan() {
  return (
    <Escena titulo="Cada turno tiene un plan">
      <p className="max-w-5xl text-2xl text-pretty text-tinta-2">
        El plan de producción dice <b className="text-tinta">cuántos autos tienen que terminar</b> (salir de calidad) en cada turno de 8 horas, para cada combinación.
        Hay tres turnos por día: mañana (6 a 14), tarde (14 a 22) y noche (22 a 6).
      </p>
      <div className="mt-10 max-w-3xl">
        <div className="flex flex-col rounded-2xl border border-linea bg-tarjeta p-6">
          <p className="text-xl font-semibold">Por turno, auto por auto</p>
          <p className="mt-1 text-lg text-tinta-2">Cada cuadradito es un auto que tiene que terminar en el turno.</p>
          <div className="mt-6 grid grid-cols-[auto_repeat(3,minmax(0,1fr))] gap-x-5 gap-y-4">
            <span />
            {MERCADOS.map((m) => <span key={m} className="text-tinta-3">{m}</span>)}
            {MODELOS.map((modelo, i) => (
              <div key={modelo} className="contents">
                <span className="text-lg font-medium">{modelo}</span>
                {PLAN[modelo].map((n, j) => (
                  <div key={j} className="flex items-start gap-2">
                    <div className="flex max-w-[136px] flex-wrap gap-1">
                      {Array.from({ length: n }, (_, k) => (
                        <motion.span key={k} className={cn("size-4 rounded-[3px]", modelo === "Pickup" && j === 1 ? "bg-acento" : "bg-acento/45")} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.2 + (i * 3 + j) * 0.06 + k * 0.012 }} />
                      ))}
                    </div>
                    <span className="font-mono text-tinta-2">{n}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <p className="mt-auto border-t border-linea pt-4 text-xl">
            <b className="font-mono">72</b> autos por turno · <b className="font-mono">216</b> por día
            <span className="block text-lg text-tinta-2">El mismo plan en todos los turnos.</span>
          </p>
        </div>
      </div>
    </Escena>
  );
}

// 4 · Las fotos: qué trae cada foto y qué se usa de cada dato
// S034 (sábado 7/3, 22:00), contado de Data/snapshots/S034.json: autos en cada estación, en total y de Pickup para Brasil
const FOTO_S034 = [
  { nombre: "Carrocería", total: 54, pickup: 8, porFila: 7 },
  { nombre: "Pintura", total: 74, pickup: 10, porFila: 8 },
  { nombre: "Montaje", total: 110, pickup: 20, porFila: 10 },
  { nombre: "Calidad", total: 19, pickup: 0, porFila: 5 },
  { nombre: "Patio", total: 272, pickup: 20, porFila: 16 },
];
// una línea de la foto: el auto U02472 tal como viene, y para qué sirve cada dato (docs/M1.md)
const FICHA: { campo: string; valor: string; uso: string; noSeUsa?: boolean }[] = [
  { campo: "Modelo y mercado", valor: "Pickup · Brasil", uso: "Su combinación: se compara con su plan" },
  { campo: "Estación", valor: "montaje", uso: "No terminó: terminado es estar en el patio" },
  { campo: "Entró ahí", valor: "sáb 06:24", uso: "Lleva 15 h 36 min. Lo normal son 9 h" },
  { campo: "Embarque", valor: "BRA-0308", uso: "Su camión: en el patio antes del dom 06:00" },
  { campo: "Retrabajos", valor: "0", uso: "1 o más: lo están volviendo a pintar" },
  { campo: "Color", valor: "Negro", uso: "No se usa", noSeUsa: true },
];

function LasFotos() {
  return (
    <Escena titulo="Cada 4 horas llega una foto">
      <p className="-mt-2 text-2xl text-tinta-2">Una lista de todos los autos: <b className="text-tinta">dónde está cada uno y desde qué hora</b>. No dice si hay un problema.</p>
      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_1.05fr] lg:items-start">
        <div>
          <FotoDeLaPlanta />
          <FotosDelPeriodo />
        </div>
        <div>
          <FichaDeUnAuto />
          <DosPreguntas />
        </div>
      </div>
    </Escena>
  );
}

/** La foto S034: cada cuadradito es un auto, en la estación donde está, en el orden de la línea. */
function FotoDeLaPlanta() {
  const flecha = (c: number) => c > 0;
  return (
    <div className="relative overflow-hidden rounded-2xl border border-linea bg-tarjeta p-6">
      {/* el flash de la cámara */}
      <motion.div className="pointer-events-none absolute inset-0 z-10 bg-white" initial={{ opacity: 0 }} animate={{ opacity: [0, 0.95, 0] }} transition={{ duration: 0.7, times: [0, 0.15, 1] }} />
      <div className="flex items-start gap-3">
        <Icono icono={Camera} clase="bg-acento text-white" />
        <div>
          <p className="text-xl font-semibold">Dónde está cada auto a las 22:00</p>
          <p className="text-tinta-3">foto <span className="font-mono">S034</span> · sábado 7/3</p>
        </div>
        <p className="ml-auto text-right">
          <b className="font-mono text-3xl font-medium">529</b>
          <span className="block text-tinta-3">autos</span>
        </p>
      </div>

      <div className="mt-5 grid items-end gap-x-1" style={{ gridTemplateColumns: "auto 1fr auto 1fr auto 1fr auto 1fr auto" }}>
        {/* los autos, apilados desde abajo */}
        {FOTO_S034.map((e, c) => (
          <Fragment key={e.nombre}>
            {flecha(c) && <span />}
            <div className="mx-auto flex h-[136px] flex-wrap-reverse content-start gap-[2px]" style={{ width: e.porFila * 8 - 2 }}>
              {Array.from({ length: e.total }, (_, k) => {
                const pickup = k < e.pickup;
                const marcado = e.nombre === "Montaje" && k === 0; // U02472, el que lleva más tiempo en montaje
                return (
                  <motion.span
                    key={k}
                    className={cn("size-[6px] rounded-[1px]", marcado && "relative z-10 ring-2 ring-acento ring-offset-1")}
                    initial={{ opacity: 0, backgroundColor: "#c9d0d8" }}
                    animate={{ opacity: 1, backgroundColor: pickup ? "#0f5e70" : "#c9d0d8", scale: marcado ? [1, 1.7, 1] : 1 }}
                    transition={{
                      opacity: { delay: 0.3 + c * 0.12 + k * 0.002 },
                      backgroundColor: { delay: 1.4, duration: 0.4 },
                      scale: marcado ? { delay: 2, duration: 1.2, repeat: Infinity, repeatDelay: 1 } : undefined,
                    }}
                  />
                );
              })}
            </div>
          </Fragment>
        ))}

        {/* las estaciones, con flechas: es la línea, en orden */}
        {FOTO_S034.map((e, c) => (
          <Fragment key={e.nombre}>
            {flecha(c) && <ArrowRight className="mt-3.5 size-4 self-start justify-self-center text-tinta-3" aria-hidden />}
            <p className="mt-3 self-start text-center font-medium whitespace-nowrap">
              {e.nombre}
              {e.nombre === "Patio" && <span className="block text-sm font-normal text-tinta-3">terminados</span>}
            </p>
          </Fragment>
        ))}

        {/* cuántos hay: todos, y de Pickup para Brasil */}
        {FOTO_S034.map((e, c) => (
          <Fragment key={e.nombre}>
            {flecha(c) && <span />}
            <p className="mt-1 text-center font-mono text-lg text-tinta-2">{e.total}</p>
          </Fragment>
        ))}
        {FOTO_S034.map((e, c) => (
          <Fragment key={e.nombre}>
            {flecha(c) && <span />}
            <motion.p className="text-center font-mono text-lg font-semibold text-acento" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.5 }}>
              {e.pickup}
            </motion.p>
          </Fragment>
        ))}
      </div>

      <motion.div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-tinta-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.5 }}>
        <span className="flex items-center gap-2"><span className="size-3 rounded-[2px] bg-[#c9d0d8]" aria-hidden /> = 1 auto</span>
        <span className="flex items-center gap-2"><span className="size-3 rounded-[2px] bg-acento" aria-hidden /> = Pickup para Brasil (58)</span>
      </motion.div>
      {/* la foto trae también los que salieron de calidad desde la anterior (liberadas en S034.json) */}
      <motion.p className="mt-3 flex gap-2 border-t border-linea pt-3 text-tinta-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.8 }}>
        <CornerDownRight className="mt-1 size-4 shrink-0 text-tinta-3" aria-hidden />
        <span>
          En las últimas 4 horas llegaron <b className="font-mono text-tinta">24</b> al patio. De Pickup, <b className="text-sev-critica-t">ninguno</b>: su línea está parada.
        </span>
      </motion.p>
    </div>
  );
}

/** Un auto de la foto, dato por dato, con lo que se saca de cada uno. */
function FichaDeUnAuto() {
  return (
    <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1.9, duration: 0.4 }}>
      <p className="text-xl font-semibold">
        Un auto de la foto: <span className="font-mono text-acento">U02472</span>
      </p>
      <p className="text-tinta-3">el marcado en montaje</p>
      <div className="mt-4 divide-y divide-linea rounded-2xl border border-linea bg-tarjeta">
        {FICHA.map((f, i) => (
          <motion.div
            key={f.campo}
            className={cn("grid grid-cols-[160px_1fr] items-center gap-4 px-5 py-2", f.noSeUsa && "text-tinta-3")}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 2.2 + i * 0.35 }}
          >
            <div>
              <p className="text-sm text-tinta-3">{f.campo}</p>
              <p className={cn("font-mono text-lg font-medium whitespace-nowrap", f.noSeUsa ? "line-through" : "text-tinta")}>{f.valor}</p>
            </div>
            <p className={f.noSeUsa ? "" : "text-tinta-2"}>{f.uso}</p>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

/** Las 60 fotos de los 10 días, 6 por día, con S034 marcada. */
function FotosDelPeriodo() {
  return (
    <motion.div className="mt-5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.6 }}>
      <div className="flex gap-2.5">
        {Array.from({ length: 10 }, (_, d) => (
          <div key={d} className="flex gap-[3px]">
            {Array.from({ length: 6 }, (_, k) => {
              const n = d * 6 + k + 1;
              return <span key={k} className={cn("h-5 w-1.5 rounded-[2px]", n === 34 ? "bg-acento" : n < 34 ? "bg-linea-fuerte" : "bg-linea")} />;
            })}
          </div>
        ))}
      </div>
      <p className="mt-2 text-lg text-tinta-2"><b className="text-tinta">60 fotos</b> en 10 días, 6 por día · cada foto trae entre 387 y 817 autos</p>
    </motion.div>
  );
}

/** Lo que se hace con cada foto. */
function DosPreguntas() {
  return (
    <motion.div className="mt-5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 4.4 }}>
      <p className="text-xl text-tinta-2">Con cada foto, dos preguntas por combinación:</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        {[
          { pregunta: "¿Faltan autos?", como: "Suma los terminados y los compara con el plan" },
          { pregunta: "¿Llega al embarque?", como: "Calcula cuándo llega cada auto al patio" },
        ].map((p) => (
          <div key={p.pregunta} className="rounded-lg bg-acento-suave px-4 py-3">
            <p className="text-lg font-semibold text-acento">{p.pregunta}</p>
            <p className="text-tinta-2">{p.como}</p>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

// Escalas de severidad: zonas de color con una marca (escenas 4 y 6)
type Zona = { desde: number; sev: Severidad; etiqueta?: string; en?: number };
const ZONAS_FALTAN: Zona[] = [
  { desde: 0, sev: "ninguna" },
  { desde: 10, sev: "media", etiqueta: "10 %" },
  { desde: 20, sev: "alta", etiqueta: "20 %" },
  { desde: 35, sev: "critica", etiqueta: "35 %" },
];
const fondoZonas = (zonas: Zona[], max: number) =>
  `linear-gradient(to right, ${zonas.map((z, i) => `var(--color-sev-${z.sev}) ${(z.desde / max) * 100}% ${((zonas[i + 1]?.desde ?? max) / max) * 100}%`).join(", ")})`;

function Etiquetas({ zonas, max }: { zonas: Zona[]; max: number }) {
  return (
    <div className="relative mt-2 h-5 text-sm">
      {zonas.filter((z) => z.etiqueta).map((z) => (
        <span key={z.desde} className={cn("absolute -translate-x-1/2 font-medium whitespace-nowrap", TEXTO_SEVERIDAD[z.sev])} style={{ left: `${((z.en ?? z.desde) / max) * 100}%` }}>
          {z.etiqueta}
        </span>
      ))}
    </div>
  );
}

/** La escala con una marca que se mueve hasta el valor. */
function Escala({ valor, max, zonas, sinEtiquetas }: { valor: number; max: number; zonas: Zona[]; sinEtiquetas?: boolean }) {
  return (
    <div>
      <div className="relative h-5 rounded-full" style={{ background: fondoZonas(zonas, max) }}>
        <motion.span
          className="absolute -top-2 -bottom-2 w-1.5 -translate-x-1/2 rounded-full bg-tinta ring-2 ring-tarjeta"
          initial={{ left: "0%" }}
          animate={{ left: `${(Math.min(valor, max) / max) * 100}%` }}
          transition={{ duration: 1, ease: "easeOut" }}
        />
      </div>
      {!sinEtiquetas && <Etiquetas zonas={zonas} max={max} />}
    </div>
  );
}

/** Debajo de la escala, una caja por nivel, del ancho de su color; la del valor queda marcada. */
function NivelesDeLaEscala({ zonas, max, valor, textos }: { zonas: Zona[]; max: number; valor: number; textos: string[] }) {
  return (
    <div className="mt-3 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${zonas.length}, minmax(0, 1fr))` }}>
      {zonas.map((z, i) => {
        const hasta = zonas[i + 1]?.desde ?? max;
        const aca = valor >= z.desde && (valor < hasta || i === zonas.length - 1);
        return (
          <div
            key={z.sev}
            className={cn("rounded-md border px-2.5 py-1.5 leading-tight whitespace-nowrap", aca ? "border-tinta-3 bg-tarjeta shadow-sm" : "border-linea")}
          >
            <EtiquetaSeveridad severidad={z.sev} className="text-base" />
            <p className={cn("mt-0.5 text-sm", aca ? "text-tinta" : "text-tinta-2")}>{textos[i]}</p>
          </div>
        );
      })}
    </div>
  );
}

// 5 · Primera pregunta: ¿faltan autos contra el plan?
function FaltanAutos() {
  const { serie } = useDatos();
  const pickup = serie?.fotos.find((f) => f.id === "S036")?.combinaciones["Pickup/Brasil"];
  if (!pickup) return <Escena titulo="Primera pregunta: ¿faltan autos?">{null}</Escena>;
  const delDia = Math.round(pickup.faltantes / (pickup.pct / 100));
  return (
    <Escena titulo="Primera pregunta: ¿faltan autos?">
      <div className="grid gap-14 lg:grid-cols-[1.15fr_1fr]">
        <div>
          <p className="text-2xl font-semibold">Pickup para Brasil · S036</p>
          <p className="mt-1 text-lg text-tinta-2">El plan acumulado desde el día 1, contra los terminados que trajeron todas las fotos</p>
          <PlanContraReal plan={pickup.plan} real={pickup.real} />
        </div>
        <div>
          <div className="flex items-end gap-5">
            <p className="font-mono text-6xl font-medium">{pickup.faltantes}<span className="text-3xl text-tinta-3"> / {delDia}</span></p>
            <p className="pb-2 text-2xl text-tinta-3">=</p>
            <p className="font-mono text-6xl font-medium text-sev-critica-t">{decimal(pickup.pct)} %</p>
          </div>
          <p className="mt-1 text-lg text-tinta-2">de lo que tiene que sacar en un día</p>
          <p className="mt-6 text-lg text-pretty text-tinta-2">
            La <b className="text-tinta">severidad</b> dice qué tan grave es. En esta pregunta depende de qué parte de un día falta:
          </p>
          <div className="mt-4">
            <Escala valor={pickup.pct} max={60} zonas={ZONAS_FALTAN} sinEtiquetas />
            <NivelesDeLaEscala zonas={ZONAS_FALTAN} max={60} valor={pickup.pct} textos={["menos de 10 %", "desde 10 %", "desde 20 %", "desde 35 %"]} />
          </div>
        </div>
      </div>

      <MitadDeTurno />
    </Escena>
  );
}

// la primera foto (lunes 10:00, mitad del turno mañana): Pickup para Brasil tiene que haber sacado 5
const CASOS_MEDIO_TURNO: { caso: string; salieron: number; sev: Severidad; detalle: string }[] = [
  { caso: "Si todo anda bien", salieron: 5, sev: "ninguna", detalle: "" },
  { caso: "Si salieron 3", salieron: 3, sev: "ninguna", detalle: "menos de 3 autos no cuenta" },
  { caso: "Si no salió ninguno", salieron: 0, sev: "media", detalle: "5 de 30 = 17 %" },
];

function Cuadraditos({ llenos, total, clase }: { llenos: number; total: number; clase: string }) {
  return (
    <span className="flex gap-1">
      {Array.from({ length: total }, (_, k) => (
        <span key={k} className={cn("size-5 rounded-[4px]", k < llenos ? clase : "border-2 border-dashed border-sev-critica/50")} />
      ))}
    </span>
  );
}

/** Los tres casos posibles en la primera foto: el plan es la mitad del turno, no el día. */
function MitadDeTurno() {
  return (
    <div className="mt-8 rounded-2xl border border-linea bg-tarjeta px-6 py-5">
      <p className="text-xl font-semibold">La primera foto: lunes 10:00, a mitad del primer turno</p>
      <p className="mt-1 text-lg text-tinta-2">Pickup para Brasil hace 10 por turno: a esa hora tienen que haber salido 5, no los 30 del día.</p>
      <div className="mt-4 grid grid-cols-[200px_auto_auto_70px_1fr] items-center gap-x-8 gap-y-2">
        <span />
        <span className="text-tinta-3">Plan</span>
        <span className="text-tinta-3">Salieron</span>
        <span className="text-tinta-3">Faltan</span>
        <span />
        {CASOS_MEDIO_TURNO.map((c) => (
          <div key={c.caso} className="contents">
            <span className="text-lg font-medium">{c.caso}</span>
            <Cuadraditos llenos={5} total={5} clase="bg-tinta-3/35" />
            <Cuadraditos llenos={c.salieron} total={5} clase="bg-acento" />
            <span className="font-mono text-2xl">{5 - c.salieron}</span>
            <span className="flex items-center gap-3 text-lg">
              <EtiquetaSeveridad severidad={c.sev} className="text-lg" />
              {c.detalle && <span className="text-tinta-2">{c.detalle}</span>}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-5 border-t border-linea pt-3 text-lg text-tinta-2">
        El porcentaje es contra un día de producción: así se mide con la misma vara una combinación que hace 36 autos por día y otra que hace 12.
      </p>
    </div>
  );
}

/** Plan acumulado contra autos que salieron de verdad, desde S001 hasta la foto. Lo que falta, en rojo. */
function PlanContraReal({ plan, real }: { plan: number; real: number }) {
  const parte = Math.min(real / plan, 1) * 100;
  return (
    <div className="mt-8 space-y-3">
      <div className="grid grid-cols-[60px_1fr_auto] items-center gap-3">
        <span className="text-lg text-tinta-2">Plan</span>
        <div className="h-10 rounded-md bg-tinta-3/35" />
        <span className="w-16 text-right font-mono text-2xl">{plan}</span>
      </div>
      <div className="grid grid-cols-[60px_1fr_auto] items-center gap-3">
        <span className="text-lg text-tinta-2">Real</span>
        <div className="relative h-10 rounded-md bg-[repeating-linear-gradient(135deg,#fbe9ec_0_6px,#f8dbe0_6px_12px)] ring-1 ring-sev-critica/40">
          <motion.div className="h-full rounded-md bg-acento" initial={{ width: 0 }} animate={{ width: `${parte}%` }} transition={{ duration: 1, ease: "easeOut" }} />
        </div>
        <span className="w-16 text-right font-mono text-2xl">{real}</span>
      </div>
      <p className="flex justify-between pr-[88px] pl-[72px] text-sm">
        <span className="whitespace-nowrap text-tinta-3">autos acumulados desde el día 1</span>
        <span className="whitespace-nowrap font-semibold text-sev-critica-t">faltan {plan - real} ↑</span>
      </p>
    </div>
  );
}

// 6 · Segunda pregunta: ¿cada auto llega a su camión o a su buque?
function LosEmbarques() {
  return (
    <Escena titulo="Segunda pregunta: ¿llega a su embarque?">
      <p className="-mt-2 text-xl text-pretty text-tinta-2">
        Para cada auto que se está fabricando: <b className="text-tinta">hora de la foto + lo que le falta</b> de su estación + las estaciones que le quedan = cuándo llega al patio.
        Si es después del corte, pierde su embarque.
      </p>
      <div className="mt-6 grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <TablaEmbarques />
        <SeveridadPorMercado />
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <LineaEmbarque />
        <CalendarioBuque />
      </div>
      <p className="mt-4 text-lg text-tinta-2">La combinación toma la nota de su auto más atrasado.</p>
    </Escena>
  );
}

// Data/planta/embarques.csv y los umbrales de retraso
const EMBARQUES: { mercado: string; como: string; corte: string; sale: string; pierde: string }[] = [
  { mercado: "Local", como: "camión diario", corte: "14:00", sale: "16:00", pierde: "+1 día" },
  { mercado: "Brasil", como: "camión diario", corte: "06:00", sale: "08:00", pierde: "+1 día" },
  { mercado: "Europa", como: "buque semanal", corte: "miércoles 20:00", sale: "jueves 14:00", pierde: "+7 días" },
];

// la severidad según los días tarde, por mercado (Data/reglas/umbrales.yaml); Europa solo puede llegar a tiempo o perder 7 días
const SEV_EMBARQUE: { dias: string; sev: (Severidad | null)[] }[] = [
  { dias: "a tiempo", sev: ["ninguna", "ninguna", "ninguna"] },
  { dias: "1 día", sev: ["media", "alta", null] },
  { dias: "2 días", sev: ["alta", "alta", null] },
  { dias: "3 o más", sev: ["critica", "critica", "critica"] },
];

function SeveridadPorMercado() {
  return (
    <div className="overflow-hidden rounded-2xl border border-linea bg-tarjeta">
      <table className="w-full">
        <thead className="bg-suave text-left text-base text-tinta-3">
          <tr>
            {["Días tarde", "Local", "Brasil", "Europa"].map((t) => <th key={t} className="px-3 py-2 font-medium whitespace-nowrap">{t}</th>)}
          </tr>
        </thead>
        <tbody>
          {SEV_EMBARQUE.map((f) => (
            <tr key={f.dias} className="border-t border-linea">
              <td className="px-3 py-2.5 font-mono whitespace-nowrap text-tinta-2">{f.dias}</td>
              {f.sev.map((s, i) => (
                <td key={i} className="px-3 py-2.5 whitespace-nowrap">
                  {s ? <EtiquetaSeveridad severidad={s} className="text-base" /> : <span className="text-tinta-3">—</span>}
                  {i === 2 && s === "critica" && <span className="ml-1 text-sm text-tinta-3">(son 7)</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TablaEmbarques() {
  return (
    <div className="overflow-hidden rounded-2xl border border-linea bg-tarjeta">
      <table className="w-full">
        <thead className="bg-suave text-left text-base text-tinta-3">
          <tr>
            {["Mercado", "Cómo", "Corte", "Sale", "Si lo pierde"].map((t) => <th key={t} className="px-4 py-2 font-medium whitespace-nowrap">{t}</th>)}
          </tr>
        </thead>
        <tbody>
          {EMBARQUES.map((e) => (
            <tr key={e.mercado} className="border-t border-linea">
              <td className="px-4 py-2.5 font-semibold">{e.mercado}</td>
              <td className="px-4 py-2.5 whitespace-nowrap text-tinta-2">{e.como}</td>
              <td className="px-4 py-2.5 font-mono whitespace-nowrap">{e.corte}</td>
              <td className="px-4 py-2.5 font-mono whitespace-nowrap text-tinta-2">{e.sale}</td>
              <td className="px-4 py-2.5 font-mono whitespace-nowrap">{e.pierde}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Un auto real (Pickup para Brasil, en S034): cuándo llega al patio contra el corte de su camión. De 22:00 a 08:00. */
function LineaEmbarque() {
  const x = (horasDesdeLas22: number) => `${(horasDesdeLas22 / 10) * 100}%`;
  return (
    <div className="rounded-xl border border-redactor/30 bg-tarjeta px-7 pt-5 pb-5">
      <p className="flex items-center gap-2 text-xl font-semibold text-redactor"><Check className="size-6" aria-hidden /> Llega</p>
      <p className="mt-1 text-tinta-2">Pickup para Brasil · S034, sábado 22:00. Ya pasó su tiempo de montaje: le falta calidad, 3 h.</p>
      <div className="relative mt-12 mb-10 h-3 rounded-full bg-suave">
        <motion.div className="absolute inset-y-0 left-0 rounded-full bg-acento" initial={{ width: 0 }} animate={{ width: x(3) }} transition={{ duration: 1, ease: "easeOut" }} />
        <Marca en={x(0)} arriba="22:00" abajo="ahora" />
        <Marca en={x(3)} arriba="01:00" abajo="al patio" fuerte />
        <Marca en={x(8)} arriba="06:00" abajo="corte" rojo />
        <Marca en={x(10)} arriba="08:00" abajo="sale" />
      </div>
      <p className="text-lg"><b className="font-mono">0 días</b> <span className="text-tinta-2">· 5 horas de margen</span></p>
    </div>
  );
}

function Marca({ en, arriba, abajo, fuerte, rojo }: { en: string; arriba: string; abajo: string; fuerte?: boolean; rojo?: boolean }) {
  return (
    <span className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: en }}>
      <span className={cn("block size-4 rounded-full border-2 border-tarjeta", rojo ? "bg-sev-critica" : fuerte ? "bg-acento" : "bg-linea-fuerte")} />
      <span className="absolute bottom-6 left-1/2 -translate-x-1/2 font-mono text-sm whitespace-nowrap text-tinta-2">{arriba}</span>
      <span className={cn("absolute top-6 left-1/2 -translate-x-1/2 text-sm whitespace-nowrap", rojo ? "font-medium text-sev-critica-t" : fuerte ? "font-medium text-tinta" : "text-tinta-3")}>{abajo}</span>
    </span>
  );
}

/** SUV para Europa en S016: el buque de esa semana ya cerró, se van en el del jueves siguiente. */
const DIAS = ["Mié 4", "Jue 5", "Vie 6", "Sáb 7", "Dom 8", "Lun 9", "Mar 10", "Mié 11", "Jue 12"];

function CalendarioBuque() {
  return (
    <div className="rounded-xl border border-sev-critica/30 bg-tarjeta px-7 pt-5 pb-5">
      <p className="flex items-center gap-2 text-xl font-semibold text-sev-critica-t"><X className="size-6" aria-hidden /> No llega</p>
      <p className="mt-1 text-tinta-2">SUV para Europa · S016, miércoles 22:00. Una auditoría los retuvo en calidad y el buque cerró a las 20:00.</p>
      <div className="mt-6 grid grid-cols-9 gap-1 text-center">
        {DIAS.map((d, i) => (
          <div key={d}>
            <p className="text-xs text-tinta-3">{d}</p>
            <div
              className={cn(
                "mt-1 grid h-12 place-items-center rounded-md",
                i === 0 ? "bg-suave ring-2 ring-tinta-3" : i === 1 ? "bg-[#fbe9ec]" : i === 8 ? "bg-acento-suave" : "bg-suave",
              )}
            >
              {i === 0 && <Camera className="size-4 text-tinta-2" aria-label="la foto" />}
              {i === 1 && (
                <span className="relative">
                  <Ship className="size-6 text-sev-critica" aria-hidden />
                  <X className="absolute -top-2 -right-3 size-4 text-sev-critica" strokeWidth={3} aria-label="lo pierde" />
                </span>
              )}
              {i === 8 && (
                <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.8, type: "spring" }}>
                  <Ship className="size-6 text-acento" aria-label="se van en este" />
                </motion.span>
              )}
            </div>
          </div>
        ))}
      </div>
      {/* la semana que se pierde: del jueves 5 al jueves 12 */}
      <div className="relative mx-[5.5%] mt-2 h-6">
        <motion.div className="absolute top-1 left-[12.5%] h-2 rounded-b-md border-x-2 border-b-2 border-sev-critica" initial={{ width: 0 }} animate={{ width: "87.5%" }} transition={{ delay: 0.4, duration: 0.8 }} />
      </div>
      <p className="text-lg"><b className="font-mono">+7 días</b> <span className="text-tinta-2">· 4 autos</span> <EtiquetaSeveridad severidad="critica" className="ml-2 text-lg" /></p>
    </div>
  );
}

// 7 · La severidad: cada pregunta da una nota, y vale la peor. Interactiva.
const sevFaltan = (pct: number): Severidad => (pct >= 35 ? "critica" : pct >= 20 ? "alta" : pct >= 10 ? "media" : "ninguna");
const sevEmbarque = (dias: number, mercado: string): Severidad =>
  dias >= 3 ? "critica" : mercado === "Local" ? (dias >= 2 ? "alta" : dias >= 1 ? "media" : "ninguna") : dias >= 1 ? "alta" : "ninguna";
const peor = (a: Severidad, b: Severidad) => (SEVERIDADES.indexOf(a) >= SEVERIDADES.indexOf(b) ? a : b);
// los días son enteros: cada zona va de medio día antes a medio día después
const zonasDias = (mercado: string): Zona[] =>
  mercado === "Europa"
    ? [
        { desde: 0, sev: "ninguna", etiqueta: "a tiempo", en: 0.9 },
        { desde: 3.5, sev: "critica", etiqueta: "pierde el buque", en: 5.6 },
      ]
    : mercado === "Local"
    ? [
        { desde: 0, sev: "ninguna" },
        { desde: 0.5, sev: "media", etiqueta: "1 día", en: 1 },
        { desde: 1.5, sev: "alta", etiqueta: "2", en: 2 },
        { desde: 2.5, sev: "critica", etiqueta: "3 días", en: 3 },
      ]
    : [
        { desde: 0, sev: "ninguna" },
        { desde: 0.5, sev: "alta", etiqueta: "1 día", en: 1 },
        { desde: 2.5, sev: "critica", etiqueta: "3 días", en: 3 },
      ];

function LaSeveridad() {
  // arranca con SUV para Europa en S016: faltan pocos, pero pierden el buque
  const [pct, setPct] = useState(17);
  const [dias, setDias] = useState(7);
  const [mercado, setMercado] = useState("Europa");
  const a = sevFaltan(pct);
  const b = sevEmbarque(dias, mercado);
  const final = peor(a, b);
  return (
    <Escena titulo="Dos preguntas, una severidad">
      <p className="-mt-2 mb-8 text-xl text-tinta-2">Arranca en un caso real: SUV para Europa en S016, la primera alerta de los 10 días.</p>
      <div className="grid gap-12 lg:grid-cols-[1.35fr_1fr] lg:items-center">
        <div className="space-y-10">
          <Deslizador titulo="¿Faltan autos?" valor={`${pct} %`} severidad={a} zonas={ZONAS_FALTAN} max={60} actual={pct} onChange={setPct} />
          <div>
            <Deslizador
              titulo="¿Llega a su embarque?"
              valor={dias === 0 ? "a tiempo" : `+${dias} ${dias === 1 ? "día" : "días"}`}
              severidad={b}
              zonas={zonasDias(mercado)}
              max={7}
              actual={dias}
              onChange={setDias}
              paso={mercado === "Europa" ? 7 : 1}
            />
            <div className="mt-3 flex flex-wrap items-center gap-4">
              <SegmentedControl
                label="Mercado"
                options={MERCADOS.map((m) => ({ value: m, label: m }))}
                value={mercado}
                onValueChange={(m) => { setMercado(m); if (m === "Europa" && dias > 0) setDias(7); }}
              />
              {mercado === "Europa" && <span className="text-tinta-2">El buque sale una vez por semana: perderlo son 7 días.</span>}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-linea bg-tarjeta p-8 text-center">
          <div className="flex items-center justify-center gap-3 text-lg">
            <EtiquetaSeveridad severidad={a} className="text-lg" />
            <span className="text-tinta-3">y</span>
            <EtiquetaSeveridad severidad={b} className="text-lg" />
          </div>
          <p className="mt-2 text-tinta-3">vale la peor</p>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.p
              key={final}
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85 }}
              className={cn("mt-4 inline-block rounded-xl px-8 py-4 text-6xl font-semibold", final === "ninguna" ? "bg-suave text-tinta-3" : cn(FONDO_SEVERIDAD[final], final === "media" ? "text-tinta" : "text-white"))}
            >
              {NOMBRE_SEVERIDAD[final]}
            </motion.p>
          </AnimatePresence>
          <div className="mt-6 flex items-center justify-center gap-2 text-lg text-tinta-2">
            {final === "ninguna" ? (
              "No pasa nada"
            ) : final === "critica" ? (
              <><FolderOpen className="size-5" aria-hidden /> caso <span className="text-tinta-3">+</span> <BellRing className="size-5 text-sev-critica" aria-hidden /> alerta</>
            ) : (
              <><FolderOpen className="size-5" aria-hidden /> se abre un caso</>
            )}
          </div>
        </div>
      </div>

      <div className="mt-12 grid gap-4 md:grid-cols-3">
        {[
          { sev: ["ninguna"] as Severidad[], texto: "No pasa nada" },
          { sev: ["media", "alta"] as Severidad[], texto: "Se abre un caso y va al informe del turno" },
          { sev: ["critica"] as Severidad[], texto: "El caso escala y sale una alerta" },
        ].map((n) => (
          <div key={n.texto} className="rounded-xl border border-linea bg-tarjeta px-5 py-4">
            <p className="flex gap-3">{n.sev.map((s) => <EtiquetaSeveridad key={s} severidad={s} className="text-lg" />)}</p>
            <p className="mt-1 text-lg text-tinta-2">{n.texto}</p>
          </div>
        ))}
      </div>
      <p className="mt-4 text-lg text-tinta-2">Es un piso: más adelante la bitácora la puede subir, nunca bajar.</p>
    </Escena>
  );
}

/** Un deslizador con las zonas de severidad pintadas en la pista. */
function Deslizador({ titulo, valor, severidad, zonas, max, actual, onChange, paso = 1 }: {
  titulo: string; valor: string; severidad: Severidad; zonas: Zona[]; max: number; actual: number; onChange: (n: number) => void; paso?: number;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-2xl font-semibold">{titulo}</p>
        <p className="font-mono text-3xl font-medium">{valor}</p>
      </div>
      <input
        type="range" min={0} max={max} step={paso} value={actual} onChange={(e) => onChange(Number(e.target.value))} aria-label={titulo}
        style={{ background: fondoZonas(zonas, max) }}
        className={cn(
          "mt-4 h-5 w-full cursor-pointer appearance-none rounded-full",
          "[&::-webkit-slider-thumb]:size-8 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-4 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-tinta [&::-webkit-slider-thumb]:shadow-md",
          "[&::-moz-range-thumb]:size-7 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-4 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-tinta",
        )}
      />
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1"><Etiquetas zonas={zonas} max={max} /></div>
        <EtiquetaSeveridad severidad={severidad} className="mt-1.5 text-lg" />
      </div>
    </div>
  );
}

// 8 · El caso: los estados, y la vida real de C004 (SUV para Europa) foto por foto
const ESTADOS: { estado: EstadoCaso; nombre: string; cuando: string; icono: LucideIcon; clase: string }[] = [
  { estado: "abierto", nombre: "Abierto", cuando: "aparece el atraso", icono: FolderOpen, clase: "bg-codigo text-white" },
  { estado: "en_seguimiento", nombre: "En seguimiento", cuando: "sigue en la foto siguiente", icono: Eye, clase: "bg-[#dfe4ea] text-codigo" },
  { estado: "escalado", nombre: "Escalado", cuando: "llega a crítica · no vuelve atrás", icono: BellRing, clase: "bg-sev-critica text-white" },
  { estado: "resuelto", nombre: "Resuelto", cuando: "2 fotos sin atraso", icono: CheckCircle2, clase: "bg-redactor text-white" },
];
const CLASE_ESTADO = Object.fromEntries(ESTADOS.map((e) => [e.estado, e])) as Record<EstadoCaso, (typeof ESTADOS)[number]>;

/** El estado del caso foto por foto, con las reglas del criterio (sin subidas por bitácora). */
function vidaDelCaso(serie: Serie, combinacion: string, desde: number, hasta: number) {
  let estado: EstadoCaso | null = null;
  let sinAtraso = 0;
  return serie.fotos.filter((f) => numeroFoto(f.id) >= desde && numeroFoto(f.id) <= hasta).map((f) => {
    const sev = f.combinaciones[combinacion].severidad;
    const antes = estado;
    if (estado === "resuelto") estado = null;
    if (sev !== "ninguna") {
      sinAtraso = 0;
      estado = estado === null ? "abierto" : estado === "abierto" ? "en_seguimiento" : estado;
      if (sev === "critica") estado = "escalado";
    } else if (estado) {
      sinAtraso += 1;
      if (sinAtraso >= 2) estado = "resuelto";
    }
    return { foto: f, sev, estado, cambio: estado !== antes ? estado : null, sinAtraso: sev === "ninguna" && antes && antes !== "resuelto" ? sinAtraso : 0 };
  });
}

function ElCaso() {
  const { serie } = useDatos();
  const vida = serie ? vidaDelCaso(serie, "SUV/Europa", 14, 21) : [];
  return (
    <Escena titulo="Cada atraso se sigue como un caso">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {ESTADOS.map((e, i) => (
          <motion.div key={e.estado} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.12 }} className="flex items-center gap-3 rounded-xl border border-linea bg-tarjeta px-4 py-3">
            <Icono icono={e.icono} clase={e.clase} />
            <div>
              <p className="text-lg font-semibold">{e.nombre}</p>
              <p className="text-tinta-2">{e.cuando}</p>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="mt-8 rounded-xl border border-linea bg-tarjeta px-6 pt-5 pb-6">
        <p className="text-xl font-semibold">Un caso real: SUV para Europa <span className="font-normal text-tinta-2">(C004)</span></p>
        <div className="mt-5 grid gap-x-1.5 gap-y-2" style={{ gridTemplateColumns: `110px repeat(${vida.length}, minmax(0, 1fr))` }}>
          <span />
          {vida.map(({ foto }) => (
            <span key={foto.id} className="text-center font-mono text-sm text-tinta-2">
              {foto.id}<span className="block text-xs text-tinta-3">{horaDe(foto.hora)}</span>
            </span>
          ))}

          <span className="flex items-center text-tinta-2">Los números</span>
          {vida.map(({ foto, sev }, i) => (
            <motion.span key={foto.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 + i * 0.12 }} className={cn("grid h-12 place-items-center rounded-md text-sm font-medium", FONDO_SEVERIDAD[sev], sev === "critica" || sev === "alta" ? "text-white" : "text-tinta-2")}>
              {NOMBRE_SEVERIDAD[sev]}
            </motion.span>
          ))}

          <span className="flex items-center text-tinta-2">El caso</span>
          {vida.map(({ foto, estado, cambio }, i) => {
            const e = estado ? CLASE_ESTADO[estado] : null;
            return (
              <motion.span key={foto.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 + i * 0.12 }} className={cn("flex h-12 items-center justify-center gap-1.5 rounded-md text-sm font-medium", e ? e.clase : "border border-dashed border-linea text-tinta-3")}>
                {e && cambio && <e.icono className="size-4" aria-hidden />}
                {e ? (cambio ? e.nombre : "") : "sin caso"}
              </motion.span>
            );
          })}

          <span />
          {vida.map(({ foto, cambio, sinAtraso }) => (
            <span key={foto.id} className="text-center text-sm">
              {cambio === "escalado" && <span className="inline-flex items-center gap-1 font-semibold text-sev-critica-t"><BellRing className="size-4" aria-hidden /> alerta</span>}
              {sinAtraso > 0 && <span className="text-tinta-2">{sinAtraso}.ª sin atraso</span>}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-x-10 gap-y-2 text-lg text-tinta-2">
        <span>Un caso por combinación, aunque el atraso dure muchas fotos.</span>
        <span>Escalado no vuelve atrás: si volviera, cada subida sería otra alerta.</span>
        <span>Si vuelve después de resuelto, es otro caso.</span>
        <span><b className="text-tinta">17 casos</b> en los 10 días.</span>
      </div>
    </Escena>
  );
}

// 9 · La causa: los números dicen dónde se traban los autos; la bitácora dice por qué
const BITACORA_T17: { texto: string; tipo?: "causa" | "ruido" | "titulo" }[] = [
  { texto: "Producción", tipo: "titulo" },
  { texto: "Se liberaron 60 unidades de calidad, contra 72 del plan del turno." },
  { texto: "Novedades de línea", tipo: "titulo" },
  { texto: "A las 15:00 se paró la línea de montaje de Pickup por la rotura del transportador aéreo de la estación 3.", tipo: "causa" },
  { texto: "Mantenimiento espera el repuesto y por ahora no hay fecha confirmada de vuelta." },
  { texto: "Seguridad", tipo: "titulo" },
  { texto: "Sin accidentes. Se repuso un extintor vencido en la cabina de pintura 2.", tipo: "ruido" },
  { texto: "Otros", tipo: "titulo" },
  { texto: "Logística avisó que el patio está al 70 % de su capacidad.", tipo: "ruido" },
];
const CAUSAS: { nombre: string; icono: LucideIcon }[] = [
  { nombre: "Parada de línea", icono: OctagonX },
  { nombre: "Faltante de piezas", icono: PackageX },
  { nombre: "Retrabajo", icono: RotateCcw },
  { nombre: "Retención de calidad", icono: ShieldX },
  { nombre: "Ausentismo", icono: UserX },
  { nombre: "No declarada", icono: CircleHelp },
];

function LaCausa() {
  return (
    <Escena titulo="¿Por qué pasa? Lo dice la bitácora">
      <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr]">
        <div>
          <p className="text-2xl font-semibold">Los números dicen dónde</p>
          <p className="mt-1 text-lg text-tinta-2">Pickup para Brasil · S034</p>
          <div className="mt-6 flex items-center gap-2">
            {ESTACIONES.map((e, i) => (
              <div key={e.nombre} className="contents">
                <div className={cn("flex flex-1 flex-col items-center rounded-xl border py-4", e.nombre === "Montaje" ? "border-sev-critica bg-[#fdf1f3]" : "border-linea bg-tarjeta")}>
                  <Icono icono={e.icono} clase={e.nombre === "Montaje" ? "bg-sev-critica text-white" : "bg-suave text-tinta-3"} />
                  <p className={cn("mt-2 text-sm font-medium", e.nombre === "Montaje" ? "text-sev-critica-t" : "text-tinta-3")}>{e.nombre}</p>
                </div>
                {i < 3 && <span className="text-tinta-3">→</span>}
              </div>
            ))}
          </div>
          <p className="mt-4 text-lg text-tinta-2">
            Los autos se traban en <b className="text-sev-critica-t">montaje</b>: llevan ahí más de lo normal, más una hora.
          </p>

          <p className="mt-10 text-2xl font-semibold">La bitácora dice por qué</p>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {CAUSAS.map((c, i) => (
              <div key={c.nombre} className={cn("flex items-center gap-2 rounded-lg border px-3 py-2.5", i === 0 ? "border-acento bg-acento text-white" : "border-linea bg-tarjeta text-tinta-2")}>
                <c.icono className="size-5 shrink-0" aria-hidden />
                <span className="text-sm font-medium">{c.nombre}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-tinta-2">
            <CircleHelp className="mr-1 inline size-4" aria-hidden />Si nadie dice por qué: no declarada. No se adivina.
          </p>
          <p className="mt-1 text-tinta-2">
            <Clock className="mr-1 inline size-4" aria-hidden />La bitácora de un turno se lee en la foto del cierre: antes, el supervisor la está escribiendo.
          </p>
        </div>

        <div className="rounded-xl border border-linea bg-tarjeta p-6">
          <p className="text-sm text-tinta-3">Bitácora T17 (partes) · sábado, turno tarde · texto libre del supervisor</p>
          <div className="mt-3 space-y-1.5 text-lg leading-relaxed">
            {BITACORA_T17.map((l, i) =>
              l.tipo === "titulo" ? (
                <p key={i} className="pt-2 text-sm font-semibold tracking-wide text-tinta-3 uppercase">{l.texto}</p>
              ) : (
                <p key={i} className={cn(l.tipo === "ruido" && "text-tinta-3 line-through decoration-linea-fuerte", l.tipo === "causa" && "rounded bg-acento-suave px-1.5 font-medium")}>{l.texto}</p>
              ),
            )}
          </div>
          <div className="mt-5 flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded-sm bg-acento-suave ring-1 ring-acento/40" /> la causa: se cita tal cual</span>
            <span className="inline-flex items-center gap-1.5 text-tinta-3"><span className="h-px w-4 bg-tinta-3" /> no importa para esto</span>
          </div>
        </div>
      </div>
    </Escena>
  );
}

// 10 · Subir la severidad: la bitácora puede adelantarse a los números
function SubirSeveridad() {
  const { serie } = useDatos();
  const fotos = serie?.fotos.filter((f) => numeroFoto(f.id) >= 32 && numeroFoto(f.id) <= 39) ?? [];
  const sevDe = (id: string) => serie?.fotos.find((f) => f.id === id)?.combinaciones["Pickup/Brasil"].severidad ?? "ninguna";
  // la subida: vale de S034 a S037; en S038 una bitácora dice que se resolvió
  const conSubida = (n: number) => n >= 34 && n < 38;

  return (
    <Escena titulo="A veces la bitácora dice más que los números">
      <blockquote className="border-l-4 border-sev-critica pl-6 text-2xl leading-snug text-pretty md:text-3xl">
        “Mantenimiento espera el repuesto y <mark className="rounded bg-[#f8dbe0] px-1">por ahora no hay fecha confirmada de vuelta</mark>.”
        <footer className="mt-2 text-base text-tinta-3">Bitácora T17 · sábado 22:00</footer>
      </blockquote>

      <div className="mt-8 rounded-xl border border-linea bg-tarjeta px-6 pt-5 pb-5">
        <p className="text-xl font-semibold">Pickup para Brasil</p>
        <div className="mt-4 grid gap-x-1.5 gap-y-2" style={{ gridTemplateColumns: `150px repeat(${fotos.length}, minmax(0, 1fr))` }}>
          <span />
          {fotos.map((f) => (
            <span key={f.id} className={cn("text-center font-mono text-sm", f.id === "S034" ? "font-semibold text-tinta" : "text-tinta-2")}>
              {f.id}<span className="block text-xs text-tinta-3">{horaDe(f.hora)}</span>
            </span>
          ))}
          <span className="flex items-center text-tinta-2">Solo los números</span>
          {fotos.map((f, i) => {
            const s = sevDe(f.id);
            return <motion.span key={f.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 + i * 0.1 }} className={cn("h-11 rounded-md", FONDO_SEVERIDAD[s])} title={NOMBRE_SEVERIDAD[s]} />;
          })}
          <span className="flex items-center text-tinta-2">Con la bitácora</span>
          {fotos.map((f, i) => {
            const n = numeroFoto(f.id);
            const s = conSubida(n) ? "critica" : sevDe(f.id);
            return (
              <motion.span key={f.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 + i * 0.1 }} className={cn("grid h-11 place-items-center rounded-md", FONDO_SEVERIDAD[s])}>
                {n === 34 && <BellRing className="size-5 text-white" aria-label="alerta" />}
                {conSubida(n) && n !== 34 && <Flame className="size-4 text-white/80" aria-hidden />}
                {n === 38 && <CheckCircle2 className="size-5 text-white" aria-label="se levanta la subida" />}
              </motion.span>
            );
          })}
          <span />
          {fotos.map((f) => {
            const n = numeroFoto(f.id);
            return (
              <span key={f.id} className="text-center text-sm">
                {n === 34 && <span className="font-semibold text-sev-critica-t">alerta</span>}
                {n === 36 && <span className="text-tinta-2">los números, 8 h después</span>}
                {n === 38 && <span className="text-redactor">se levanta (T19)</span>}
              </span>
            );
          })}
        </div>
      </div>

      <p className="mt-5 text-lg text-tinta-2">
        Alcanza a todos los casos con esa causa: Pickup para Brasil y Local en S034, y Pickup para Europa en S035. Mientras sigue, el caso no se resuelve.
      </p>
      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <Regla icono={Flame} clase="bg-sev-critica text-white" veredicto="Se sube" cita="por ahora no hay fecha confirmada de vuelta" bitacora="T17" />
        <Regla icono={Clock} clase="bg-suave text-tinta-2" veredicto="No se sube: tiene horario" cita="estuvo parada de 14:30 a 18:30" bitacora="T23" />
        <Regla icono={CheckCircle2} clase="bg-redactor text-white" veredicto="Se levanta" cita="la línea de montaje de Pickup volvió a las 10:00" bitacora="T19" />
      </div>
    </Escena>
  );
}

function Regla({ icono, clase, veredicto, cita, bitacora }: { icono: LucideIcon; clase: string; veredicto: string; cita: string; bitacora: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-linea bg-tarjeta p-4">
      <Icono icono={icono} clase={clase} />
      <div>
        <p className="text-lg font-semibold">{veredicto}</p>
        <p className="text-tinta-2 italic">“{cita}” <span className="font-mono text-xs not-italic text-tinta-3">{bitacora}</span></p>
      </div>
    </div>
  );
}

// 11 · La decisión: tres respuestas posibles y dos formas de equivocarse
function LaDecision() {
  const opciones = [
    {
      titulo: "Alerta ya", texto: "al jefe de planta", icono: BellRing, clase: "bg-sev-critica text-white", borde: "border-t-sev-critica",
      filas: ["En la foto en que el caso llega a crítica", "Una sola vez por caso", "Dice por qué: los números o la bitácora, con la cita"],
    },
    {
      titulo: "Al informe", texto: "del cierre de turno", icono: FileText, clase: "bg-acento text-white", borde: "border-t-acento",
      filas: ["Al cierre de cada turno: 30 en 10 días", "Novedades: solo lo que cambió", "La tabla de casos abiertos, con el pico del turno"],
    },
    {
      titulo: "No avisar", texto: "si nada cambió", icono: BellOff, clase: "bg-suave text-tinta-2", borde: "border-t-linea-fuerte",
      filas: ["Si el caso sigue igual", "Si la foto llega repetida (S034)", "Media o alta: no hay alerta, va al informe"],
    },
  ];
  return (
    <Escena titulo="Con cada atraso, hay que decidir">
      <div className="grid gap-5 md:grid-cols-3">
        {opciones.map((o, i) => (
          <motion.div key={o.titulo} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.12 }} className={cn("rounded-xl border border-t-4 border-linea bg-tarjeta px-6 py-5", o.borde)}>
            <div className="flex items-center gap-4">
              <Icono icono={o.icono} grande clase={o.clase} />
              <div>
                <p className="text-3xl font-semibold">{o.titulo}</p>
                <p className="text-xl text-tinta-2">{o.texto}</p>
              </div>
            </div>
            <ul className="mt-4 space-y-1.5 border-t border-linea pt-4 text-lg text-tinta-2">
              {o.filas.map((f) => (
                <li key={f} className="flex gap-2"><Check className="mt-1.5 size-4 shrink-0 text-tinta-3" aria-hidden />{f}</li>
              ))}
            </ul>
          </motion.div>
        ))}
      </div>
      <p className="mt-8 text-2xl text-tinta-2">Hoy lo decide una persona. Se puede equivocar de dos formas:</p>
      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <div className="rounded-xl bg-[#fdf0e5] p-6">
          <p className="text-2xl font-semibold">Avisar de más</p>
          <div className="mt-4 flex flex-wrap gap-1.5" aria-hidden>
            {Array.from({ length: 13 }, (_, i) => (
              <motion.span key={i} initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.4 + i * 0.07 }}>
                <BellRing className="size-7 text-sev-alta" />
              </motion.span>
            ))}
          </div>
          <p className="mt-3 text-lg text-tinta-2">13 fotos con el mismo atraso. Nadie lee el aviso que importa.</p>
        </div>
        <div className="rounded-xl bg-[#fbe9ec] p-6">
          <p className="text-2xl font-semibold">Avisar tarde</p>
          <div className="mt-4 flex items-center gap-3">
            <Clock className="size-10 text-sev-critica" aria-hidden />
            <p className="text-5xl font-semibold text-sev-critica-t">8 horas</p>
          </div>
          <p className="mt-3 text-lg text-tinta-2">Esperar a los números con la línea de Pickup parada.</p>
        </div>
      </div>
      <p className="mt-8 text-2xl text-tinta-2">
        <b className="text-tinta">Lo que hace el sistema:</b> una alerta por caso, en la foto en que se vuelve grave, con la causa citada.
      </p>
    </Escena>
  );
}

// 12 · Hoy, a mano: todo lo anterior lo hace hoy una persona de control de producción, cada 4 horas
const TAREAS: { que: string; detalle: string }[] = [
  { que: "Contar qué salió y compararlo con el plan", detalle: "en las 9 combinaciones" },
  { que: "Revisar auto por auto si llega a su embarque", detalle: "su camión o su buque, contra la hora de corte" },
  { que: "Leer la bitácora y encontrar la causa", detalle: "texto libre del supervisor, mezclado con lo que no importa" },
  { que: "Acordarse de cada problema", detalle: "de una foto a la otra, sin repetir avisos" },
  { que: "Decidir qué avisar y escribirlo", detalle: "una alerta, el informe del turno o nada" },
];
function AMano() {
  return (
    <Escena titulo="Hoy, todo esto lo hace una persona">
      <p className="-mt-2 text-2xl text-tinta-2">Alguien del área de control de producción, cada 4 horas, de día y de noche.</p>
      <div className="mt-6 grid gap-10 lg:grid-cols-[1.15fr_1fr] lg:items-center">
        <Oficina />
        <div>
          <p className="text-xl font-semibold">Cada 4 horas, a mano</p>
          <ol className="mt-4 space-y-3">
            {TAREAS.map((t, i) => (
              <motion.li key={t.que} className="flex gap-4" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 + i * 0.35 }}>
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-suave font-mono text-tinta-2">{i + 1}</span>
                <span>
                  <b className="text-lg font-semibold">{t.que}</b>
                  <span className="block text-tinta-2">{t.detalle}</span>
                </span>
              </motion.li>
            ))}
          </ol>
        </div>
      </div>

      <motion.p className="mt-10 text-2xl text-tinta-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.4 }}>
        Por eso: <b className="text-tinta">un sistema que haga este trabajo en cada foto</b>.
      </motion.p>
    </Escena>
  );
}
