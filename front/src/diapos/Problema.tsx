import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import { Stepper, StepperIndicator, StepperItem, StepperSeparator, StepperTitle, StepperTrigger } from "@/components/stepper";
import { EtiquetaSeveridad } from "@/componentes/basicos";
import { useDatos } from "@/contexto";
import { FONDO_SEVERIDAD, MERCADOS, MODELOS, NOMBRE_SEVERIDAD, TEXTO_SEVERIDAD, buscarCaso, decimal, horaDe, numeroFoto, type Serie } from "@/datos";
import { cn } from "@/lib/utils";

const ESCENAS = ["La planta", "Las fotos", "El atraso", "La bitácora", "La decisión", "Los avisos"];

/** El problema contado en 5 escenas: ↓ / ↑ o los pasos de arriba para avanzar. */
export default function Problema() {
  // ?escena=3 abre directo en esa escena
  const [escena, setEscena] = useState(() => Number(new URLSearchParams(location.search).get("escena")) || 1);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") setEscena((n) => Math.min(ESCENAS.length, n + 1));
      if (e.key === "ArrowUp") setEscena((n) => Math.max(1, n - 1));
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, []);

  return (
    <div className="mx-auto flex min-h-full max-w-[1200px] flex-col px-6 py-8 lg:px-10">
      <p className="text-sm font-medium text-acento">1 · El problema</p>

      <Stepper value={escena} onValueChange={setEscena} className="mt-4">
        {ESCENAS.map((nombre, i) => (
          <StepperItem key={nombre} step={i + 1} className="flex-1 [&:last-child]:flex-none">
            <StepperTrigger className="cursor-pointer">
              <StepperIndicator className="size-7" />
              <StepperTitle className={cn("hidden text-sm md:block", escena === i + 1 ? "text-tinta" : "text-tinta-3")}>{nombre}</StepperTitle>
            </StepperTrigger>
            {i < ESCENAS.length - 1 && <StepperSeparator className="mx-3" />}
          </StepperItem>
        ))}
      </Stepper>

      <div className="relative mt-10 flex-1">
        <AnimatePresence mode="wait">
          <motion.div key={escena} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.25 }}>
            {escena === 1 && <LaPlanta />}
            {escena === 2 && <LasFotos />}
            {escena === 3 && <ElAtraso />}
            {escena === 4 && <LaBitacora />}
            {escena === 5 && <LaDecision />}
            {escena === 6 && <LosAvisos />}
          </motion.div>
        </AnimatePresence>
      </div>

      <p className="mt-6 pb-14 text-center text-sm text-tinta-3">↓ siguiente · ↑ anterior</p>
    </div>
  );
}

function Escena({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-4xl font-semibold tracking-tight md:text-5xl">{titulo}</h2>
      <div className="mt-10">{children}</div>
    </section>
  );
}

// 1 · La planta
const ETAPAS = [["Carrocería", "6 h"], ["Pintura", "8 h"], ["Montaje", "9 a 11 h"], ["Calidad", "3 h"], ["Patio", ""], ["Embarque", "camión o buque"]];

function LaPlanta() {
  return (
    <Escena titulo="Una planta que arma autos">
      <div className="flex flex-wrap items-center gap-3">
        {ETAPAS.map(([nombre, tiempo], i) => (
          <motion.div key={nombre} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.12 }} className="flex items-center gap-3">
            <div className={cn("rounded-lg border px-5 py-4", i === 5 ? "border-acento/40 bg-acento-suave" : "border-linea bg-tarjeta")}>
              <p className="text-2xl font-semibold">{nombre}</p>
              {tiempo && <p className="text-tinta-3">{tiempo}</p>}
            </div>
            {i < ETAPAS.length - 1 && <span className="text-2xl text-tinta-3">→</span>}
          </motion.div>
        ))}
      </div>
      <div className="mt-14 flex flex-wrap items-end gap-10">
        <Grande numero="3" texto="modelos" detalle="Sedán · SUV · Pickup" />
        <span className="pb-6 text-4xl text-tinta-3">×</span>
        <Grande numero="3" texto="mercados" detalle="Local · Brasil · Europa" />
        <span className="pb-6 text-4xl text-tinta-3">=</span>
        <Grande numero="9" texto="combinaciones" detalle="cada una con su plan" acento />
      </div>
    </Escena>
  );
}

function Grande({ numero, texto, detalle, acento }: { numero: string; texto: string; detalle?: string; acento?: boolean }) {
  return (
    <div>
      <p className={cn("font-mono text-7xl font-medium", acento && "text-acento")}>{numero}</p>
      <p className="text-xl">{texto}</p>
      {detalle && <p className="text-tinta-3">{detalle}</p>}
    </div>
  );
}

// 2 · Las fotos: la grilla de la planta, foto por foto
function LasFotos() {
  const { serie } = useDatos();
  const [i, setI] = useState(33); // arranca en S034
  const [jugando, setJugando] = useState(false);

  useEffect(() => {
    if (!jugando) return;
    const id = window.setInterval(() => setI((n) => (n >= 59 ? (setJugando(false), 59) : n + 1)), 450);
    return () => clearInterval(id);
  }, [jugando]);

  return (
    <Escena titulo="Cada 4 horas llega una foto">
      <div className="grid gap-10 lg:grid-cols-[1.2fr_1fr] lg:items-center">
        <Grilla serie={serie} indice={i} />
        <div>
          <p className="text-2xl text-tinta-2">Dónde está cada uno de los <b className="text-tinta">~600 autos</b>.</p>
          <p className="mt-3 text-2xl text-tinta-2"><b className="text-tinta">60 fotos</b> en 10 días.</p>
          <div className="mt-8">
            <div className="flex items-center gap-3">
              <button
                onClick={() => { if (i >= 59) setI(0); setJugando((j) => !j); }}
                className="h-10 w-24 cursor-pointer rounded-md bg-acento font-medium text-white hover:bg-[#0b4b5a]"
              >
                {jugando ? "Pausa" : "Reproducir"}
              </button>
              <span className="font-mono text-xl">{serie?.fotos[i]?.id ?? ""}</span>
              <span className="text-tinta-3">{serie ? `${horaDe(serie.fotos[i].hora)} · turno ${serie.fotos[i].turno}` : ""}</span>
            </div>
            <input
              type="range" min={0} max={59} value={i}
              onChange={(e) => { setJugando(false); setI(Number(e.target.value)); }}
              aria-label="Foto"
              className="mt-4 w-full accent-[#0f5e70]"
            />
          </div>
        </div>
      </div>
    </Escena>
  );
}

function Grilla({ serie, indice }: { serie: Serie | null; indice: number }) {
  const foto = serie?.fotos[indice];
  return (
    <div className="grid grid-cols-[auto_repeat(3,minmax(0,1fr))] gap-2">
      <span />
      {MERCADOS.map((m) => <span key={m} className="text-center text-tinta-3">{m}</span>)}
      {MODELOS.map((modelo) => (
        <div key={modelo} className="contents">
          <span className="flex items-center pr-2 text-lg font-medium">{modelo}</span>
          {MERCADOS.map((mercado) => {
            const n = foto?.combinaciones[`${modelo}/${mercado}`];
            const sev = n?.severidad ?? "ninguna";
            return (
              <div key={mercado} className={cn("flex h-20 flex-col justify-center rounded-lg px-3 transition-colors duration-300", sev === "ninguna" ? "bg-tarjeta ring-1 ring-linea" : FONDO_SEVERIDAD[sev])}>
                <span className={cn("font-medium", sev === "ninguna" ? "text-tinta-3" : "text-tinta")}>{NOMBRE_SEVERIDAD[sev]}</span>
                {n && n.faltantes > 0 && <span className={cn("text-sm", sev === "ninguna" ? "text-tinta-3" : "text-tinta/80")}>faltan {n.faltantes}</span>}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// 3 · Cuándo hay atraso
function ElAtraso() {
  const { serie } = useDatos();
  const pickup = serie?.fotos.find((f) => f.id === "S036")?.combinaciones["Pickup/Brasil"];
  const suv = serie?.fotos.find((f) => f.id === "S016")?.combinaciones["SUV/Europa"];
  return (
    <Escena titulo="¿Cuándo hay atraso?">
      <div className="grid gap-12 lg:grid-cols-2">
        <div>
          <p className="text-2xl font-semibold">Faltan autos contra el plan</p>
          <p className="mt-1 text-tinta-2">Pickup para Brasil · S036</p>
          {pickup && (
            <>
              <PlanContraReal plan={pickup.plan} real={pickup.real} />
              <p className="mt-6 text-xl text-tinta-2">
                Los <b className="text-tinta">{pickup.faltantes}</b> que faltan son el <b className="text-tinta">{decimal(pickup.pct)} %</b> del
                plan del día ({Math.round(pickup.faltantes / (pickup.pct / 100))} autos):
              </p>
              <Barra pct={pickup.pct} />
              <EtiquetaSeveridad severidad={pickup.severidad} className="mt-3 text-xl" />
            </>
          )}
        </div>
        <div>
          <p className="text-2xl font-semibold">Autos que pierden su embarque</p>
          <p className="mt-1 text-tinta-2">SUV para Europa · S016</p>
          {suv && (
            <>
              <p className="mt-6 font-mono text-6xl font-medium">
                +{decimal(suv.dias_de_retraso)}<span className="text-3xl text-tinta-3"> días</span>
              </p>
              <p className="mt-4 text-xl text-tinta-2">{suv.pierden_embarque} autos no llegan al buque del jueves. El próximo sale en una semana.</p>
              <EtiquetaSeveridad severidad={suv.severidad} className="mt-4 text-xl" />
            </>
          )}
        </div>
      </div>
    </Escena>
  );
}

/** Plan acumulado contra autos que salieron de verdad, desde S001 hasta la foto. Lo que falta, en rojo. */
function PlanContraReal({ plan, real }: { plan: number; real: number }) {
  const parte = Math.min(real / plan, 1) * 100;
  return (
    <div className="mt-6 space-y-3">
      <div className="grid grid-cols-[60px_1fr_auto] items-center gap-3">
        <span className="text-lg text-tinta-2">Plan</span>
        <div className="h-9 rounded-md bg-tinta-3/35" />
        <span className="w-16 text-right font-mono text-2xl">{plan}</span>
      </div>
      <div className="grid grid-cols-[60px_1fr_auto] items-center gap-3">
        <span className="text-lg text-tinta-2">Real</span>
        <div className="relative h-9 rounded-md bg-[repeating-linear-gradient(135deg,#fbe9ec_0_6px,#f8dbe0_6px_12px)] ring-1 ring-sev-critica/40">
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

/** La barra de faltantes con las marcas de los umbrales (10, 20 y 35 % del plan del día). */
function Barra({ pct }: { pct: number }) {
  const marcas: [number, "media" | "alta" | "critica"][] = [[10, "media"], [20, "alta"], [35, "critica"]];
  return (
    <div className="mt-5">
      <div className="relative h-4 rounded-full bg-suave">
        <motion.div className="h-full rounded-full bg-sev-critica" initial={{ width: 0 }} animate={{ width: `${Math.min(pct, 100)}%` }} transition={{ duration: 1, ease: "easeOut" }} />
        {marcas.map(([m]) => <span key={m} className="absolute top-[-4px] h-6 w-0.5 bg-tinta" style={{ left: `${m}%` }} />)}
      </div>
      <div className="relative mt-2 h-5 text-xs">
        {marcas.map(([m, sev]) => (
          <span key={m} className={cn("absolute -translate-x-1/2 font-medium", TEXTO_SEVERIDAD[sev])} style={{ left: `${m}%` }}>{m} %</span>
        ))}
      </div>
    </div>
  );
}

// 4 · La bitácora
function LaBitacora() {
  return (
    <Escena titulo="Y la bitácora del supervisor">
      <p className="text-tinta-3">Turno T17 · sábado 7/3, tarde · texto libre</p>
      <blockquote className="mt-6 border-l-4 border-acento pl-6 text-3xl leading-snug text-pretty">
        “A las 15:00 se paró la línea de montaje de Pickup por la rotura del transportador aéreo de la estación 3. (…)
        Mantenimiento espera el repuesto y <mark className="rounded bg-[#f8dbe0] px-1">por ahora no hay fecha confirmada de vuelta</mark>.”
      </blockquote>
      <p className="mt-10 text-2xl text-tinta-2">
        En ese momento los números todavía marcan <EtiquetaSeveridad severidad="media" className="text-2xl" />.
      </p>
    </Escena>
  );
}

// 5 · La decisión
function LaDecision() {
  const opciones = [
    { titulo: "Alerta ya", texto: "al jefe de planta", borde: "border-t-sev-critica" },
    { titulo: "Al informe", texto: "del cierre de turno", borde: "border-t-coord" },
    { titulo: "No avisar", texto: "si nada cambió", borde: "border-t-linea-fuerte" },
  ];
  return (
    <Escena titulo="Con cada atraso, hay que decidir">
      <div className="grid gap-5 md:grid-cols-3">
        {opciones.map((o, i) => (
          <motion.div key={o.titulo} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.12 }} className={cn("rounded-lg border border-linea border-t-4 bg-tarjeta p-6", o.borde)}>
            <p className="text-3xl font-semibold">{o.titulo}</p>
            <p className="mt-1 text-xl text-tinta-2">{o.texto}</p>
          </motion.div>
        ))}
      </div>
      <p className="mt-12 text-2xl text-tinta-2">Hoy lo hace una persona. Se puede equivocar de dos formas:</p>
      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <div className="rounded-lg bg-[#fdf0e5] p-6">
          <p className="text-2xl font-semibold">Avisar de más</p>
          <p className="mt-1 text-xl text-tinta-2">13 fotos seguidas con el mismo atraso → nadie lee los avisos</p>
        </div>
        <div className="rounded-lg bg-[#fbe9ec] p-6">
          <p className="text-2xl font-semibold">Avisar tarde</p>
          <p className="mt-1 text-xl text-tinta-2">esperar a los números → 8 horas tarde</p>
        </div>
      </div>
    </Escena>
  );
}

// 6 · Qué se avisa: los tres avisos y la vida de un caso real
function LosAvisos() {
  return (
    <Escena titulo="Qué se avisa y cuándo">
      <div className="grid gap-5 lg:grid-cols-3">
        <Aviso titulo="Alerta inmediata" borde="border-t-sev-critica" filas={[
          ["Cuándo", "En la foto en que un caso llega a crítica. Una sola vez por caso."],
          ["Desde qué nivel", "Crítica: faltan 35 % o más del plan del día, o hay 3 días o más de retraso. También si la bitácora dice que la causa sigue sin fecha."],
          ["Qué lleva", "La combinación y la foto, por qué escaló, los números y la causa con la cita de la bitácora."],
        ]} />
        <Aviso titulo="Informe de turno" borde="border-t-coord" filas={[
          ["Cuándo", "Al cierre de cada turno: 14:00, 22:00 y 06:00. Son 30 en 10 días."],
          ["Novedades", "Solo los casos que cambiaron: nuevos, escalados, resueltos o con otra severidad. También el pico más alto del turno."],
          ["Tabla", "Todos los casos abiertos, con sus números y su causa."],
        ]} />
        <Aviso titulo="Sin aviso" borde="border-t-linea-fuerte" filas={[
          ["Cuándo", "Si un caso sigue igual que en el informe anterior, no se lo vuelve a nombrar como novedad."],
          ["Fotos repetidas", "Si una foto llega dos veces (S034), no se avisa de nuevo."],
          ["Severidad media o alta", "Se sigue el caso y va al informe, pero no hay alerta."],
        ]} />
      </div>
      <VidaDeUnCaso />
    </Escena>
  );
}

function Aviso({ titulo, borde, filas }: { titulo: string; borde: string; filas: [string, string][] }) {
  return (
    <div className={cn("rounded-lg border border-linea border-t-4 bg-tarjeta p-5", borde)}>
      <p className="text-2xl font-semibold">{titulo}</p>
      <dl className="mt-3 space-y-3">
        {filas.map(([k, v]) => (
          <div key={k}>
            <dt className="text-sm font-semibold text-tinta">{k}</dt>
            <dd className="text-tinta-2">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** C009 (Pickup para Brasil) de la corrida guardada: qué aviso salió en cada foto, desde que se abrió hasta que se resolvió. */
function VidaDeUnCaso() {
  const { guardada, serie } = useDatos();
  const cuaderno = guardada?.registro;
  const caso = buscarCaso(cuaderno, "C009");
  if (!cuaderno || !caso || !serie) return null;
  const desde = numeroFoto(caso.abierto_en);
  const hasta = numeroFoto(caso.resuelto_en ?? caso.abierto_en);
  const fotos = serie.fotos.filter((f) => numeroFoto(f.id) >= desde && numeroFoto(f.id) <= hasta);
  const informes = new Map(cuaderno.informes.map((i) => [i.snapshot_id, i]));
  return (
    <div className="mt-8 rounded-lg border border-linea bg-tarjeta p-5">
      <p className="font-semibold">Un caso real: Pickup para Brasil, de {caso.abierto_en} a {caso.resuelto_en}</p>
      <div className="mt-4 grid gap-1" style={{ gridTemplateColumns: `repeat(${fotos.length}, minmax(0, 1fr))` }}>
        {fotos.map((f) => {
          const alerta = cuaderno.alertas.some((a) => a.caso_id === caso.caso_id && a.snapshot_id === f.id);
          const inf = informes.get(f.id);
          const novedad = inf?.novedades.includes(caso.caso_id);
          return (
            <div key={f.id} className="text-center">
              <p className="font-mono text-xs text-tinta-3">{f.id}</p>
              <div className="mt-1 flex h-16 flex-col items-center justify-center gap-1 rounded-md bg-suave">
                {alerta && <span className="rounded bg-sev-critica px-1.5 text-xs font-semibold text-white">alerta</span>}
                {inf && (novedad
                  ? <span className="rounded bg-coord px-1.5 text-xs font-semibold text-white">novedad</span>
                  : <span className="rounded border border-linea-fuerte px-1.5 text-xs text-tinta-2">en la tabla</span>)}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-sm text-tinta-2">
        Una alerta en {caso.alerta_enviada_en}. Entre S036 y S042 el caso no cambió: está en la tabla de cada informe, pero no
        se lo nombra como novedad. Vuelve a ser novedad cuando cambia su severidad y cuando se resuelve.
      </p>
    </div>
  );
}
