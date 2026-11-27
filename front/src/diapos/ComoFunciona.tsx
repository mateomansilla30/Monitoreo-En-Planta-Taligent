import {
  BookOpenText, Calculator, Camera, Lock, NotebookPen, PenLine, ScrollText, Server, ShieldAlert, Workflow,
  type LucideIcon,
} from "lucide-react";
import { motion } from "motion/react";
import { forwardRef, useRef } from "react";
import { AnimatedBeam } from "@/components/ui/animated-beam";
import { Tarjeta, Titulo } from "@/componentes/basicos";
import { cn } from "@/lib/utils";

interface NodoProps {
  icono: LucideIcon;
  nombre: string;
  texto: string;
  tono?: "coord" | "lector" | "redactor"; // los tres agentes llevan su color
}

const TONO = {
  coord: "border-coord/40 bg-[#eef3fe] text-coord",
  lector: "border-lector/40 bg-[#e9f5f7] text-lector",
  redactor: "border-redactor/40 bg-[#ecf6ee] text-redactor",
};

const Nodo = forwardRef<HTMLDivElement, NodoProps>(({ icono: Icono, nombre, texto, tono }, ref) => (
  <div
    ref={ref}
    className={cn(
      "relative z-10 flex w-full max-w-[230px] items-center gap-2.5 rounded-md border px-3 py-2.5",
      tono ? cn(TONO[tono], "shadow-sm") : "border-linea bg-tarjeta text-tinta-2",
    )}
  >
    <Icono className="size-5 shrink-0" aria-hidden />
    <span className="min-w-0">
      <span className="block font-semibold whitespace-nowrap text-tinta">{nombre}</span>
      <span className="block text-xs text-tinta-2">{texto}</span>
    </span>
  </div>
));
Nodo.displayName = "Nodo";

const PERMISOS: { agente: string; color: string; tools: string[] }[] = [
  { agente: "Coordinador", color: "text-coord", tools: ["procesar_snapshot", "registrar_causa", "subir_severidad", "levantar_subida", "registrar_alerta", "registrar_informe", "pedir_causa", "pedir_texto"] },
  { agente: "Lector", color: "text-lector", tools: ["leer_bitacora"] },
  { agente: "Redactor", color: "text-redactor", tools: [] },
];

// los hooks de agente.py: lo que frenan, con un motivo que el modelo recibe como error
const HOOKS = [
  { cuando: "Antes de cada tool", frena: ["Una tool que no es del agente", "Una alerta repetida o de un caso no crítico", "Un informe al que le falta un caso"] },
  { cuando: "Después de cada tool", frena: ["No frena: anota qué tools se usaron y si la foto llegó repetida"] },
  { cuando: "Al terminar la foto", frena: ["Una foto sin procesar", "Un caso escalado sin alerta", "Un cierre de turno sin informe"] },
];

export default function ComoFunciona() {
  const caja = useRef<HTMLDivElement>(null);
  const foto = useRef<HTMLDivElement>(null);
  const coordinador = useRef<HTMLDivElement>(null);
  const lector = useRef<HTMLDivElement>(null);
  const redactor = useRef<HTMLDivElement>(null);
  const servidor = useRef<HTMLDivElement>(null);
  const cuaderno = useRef<HTMLDivElement>(null);
  const bitacoras = useRef<HTMLDivElement>(null);
  const cuentas = useRef<HTMLDivElement>(null);

  // conectores grises con un pulso que avanza despacio
  const haz = { containerRef: caja, pathColor: "#9aa5b1", pathOpacity: 0.45, pathWidth: 1.5 };
  const azul = { gradientStartColor: "#1d4ed8", gradientStopColor: "#1d4ed8" };
  const gris = { gradientStartColor: "#475569", gradientStopColor: "#475569" };

  return (
    <div className="mx-auto max-w-[1320px] px-6 py-8 pb-20 lg:px-10">
      <Titulo parte="2 · Cómo funciona" titulo="Tres agentes y un servidor MCP" bajada="Los tres son Claude Haiku 5.5. Cada foto arranca de cero: el modelo no recuerda nada, lo anterior está en el registro, y solo el coordinador escribe ahí." />

      <div className="mt-6">
        <Tarjeta className="p-0">
          <div ref={caja} className="relative grid grid-cols-4 place-items-center gap-x-8 gap-y-10 bg-[radial-gradient(#dfe3e8_1px,transparent_1px)] [background-size:16px_16px] px-6 py-10">
            <span />
            <Nodo ref={lector} icono={BookOpenText} nombre="Lector" texto="encuentra la causa" tono="lector" />
            <Nodo ref={bitacoras} icono={ScrollText} nombre="Bitácoras" texto="una por turno" />
            <span />

            <Nodo ref={foto} icono={Camera} nombre="Foto nueva" texto="cada 4 horas" />
            <Nodo ref={coordinador} icono={Workflow} nombre="Coordinador" texto="decide y registra" tono="coord" />
            <Nodo ref={servidor} icono={Server} nombre="Servidor MCP" texto="7 tools · 3 prompts" />
            <Nodo ref={cuaderno} icono={NotebookPen} nombre="Registro" texto="casos y avisos" />

            <span />
            <Nodo ref={redactor} icono={PenLine} nombre="Redactor" texto="escribe los avisos" tono="redactor" />
            <Nodo ref={cuentas} icono={Calculator} nombre="Cálculo" texto="los atrasos" />
            <span />

            <AnimatedBeam {...haz} {...azul} fromRef={foto} toRef={coordinador} duration={6} />
            <AnimatedBeam {...haz} gradientStartColor="#1d4ed8" gradientStopColor="#0e7490" fromRef={coordinador} toRef={lector} duration={6} delay={0.6} />
            <AnimatedBeam {...haz} gradientStartColor="#1d4ed8" gradientStopColor="#15803d" fromRef={coordinador} toRef={redactor} duration={6} delay={1.8} />
            <AnimatedBeam {...haz} {...azul} fromRef={coordinador} toRef={servidor} duration={6} delay={1.2} />
            <AnimatedBeam {...haz} gradientStartColor="#0e7490" gradientStopColor="#475569" fromRef={lector} toRef={servidor} duration={6} delay={2.4} curvature={-30} />
            <AnimatedBeam {...haz} {...gris} fromRef={servidor} toRef={bitacoras} duration={6} delay={3} />
            <AnimatedBeam {...haz} {...gris} fromRef={servidor} toRef={cuentas} duration={6} delay={0.3} />
            <AnimatedBeam {...haz} {...gris} fromRef={servidor} toRef={cuaderno} duration={6} delay={1.5} />
          </div>
        </Tarjeta>
      </div>

      <QuienHaceQue />

      <Tarjeta className="mt-5 py-4">
        <div className="grid gap-4 md:grid-cols-[1.6fr_1fr_1fr]">
          {PERMISOS.map(({ agente, color, tools }) => (
            <div key={agente}>
              <p className={cn("text-sm font-semibold", color)}>{agente}</p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {tools.length ? (
                  tools.map((t) => <code key={t} className="rounded border border-linea bg-suave px-1.5 py-0.5 font-mono text-xs">{t}</code>)
                ) : (
                  <span className="text-sm text-tinta-3">sin tools</span>
                )}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 flex items-center gap-2 border-t border-linea pt-3 text-sm text-tinta-2">
          <Lock className="size-4 text-tinta-3" aria-hidden /> Si un agente pide otra tool, el código la rechaza. Cada tool valida lo que recibe: una cita que no está tal cual en la bitácora no se guarda. El criterio de cada agente es un prompt del servidor MCP.
        </p>
      </Tarjeta>

      <Tarjeta className="mt-5 py-4">
        <p className="flex items-center gap-2 font-semibold">
          <ShieldAlert className="size-4 text-sev-media-t" aria-hidden /> Hooks: el código revisa al modelo
        </p>
        <div className="mt-3 grid gap-4 md:grid-cols-3">
          {HOOKS.map(({ cuando, frena }) => (
            <div key={cuando}>
              <p className="text-sm font-semibold text-tinta-2">{cuando}</p>
              <ul className="mt-1 space-y-0.5 text-sm">
                {frena.map((f) => <li key={f}>{f}</li>)}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-3 border-t border-linea pt-3 font-mono text-xs text-tinta-2">
          hook_alerta frena registrar_alerta: Aviso repetido: C004 ya tuvo su alerta en S016. Es una alerta por caso.
        </p>
      </Tarjeta>
    </div>
  );
}

// una alerta real (Pickup en S034), paso por paso: cada paso cae del lado de quien lo hace
type Lado = "codigo" | "coordinador" | "lector" | "redactor";
// una alerta real (Pickup en S034): lo que pide el coordinador y quién le contesta
const PASOS: { llamada: string; responde: Lado; respuesta: string; nota?: string }[] = [
  { llamada: 'procesar_snapshot("S034")', responde: "codigo", respuesta: "“Se abrió C009. Es cierre de turno.”" },
  {
    llamada: "pedir_causa(C009, T17)", responde: "lector", respuesta: "“Parada de línea en montaje: ‘se paró la línea…’. Sin fecha.”",
    nota: "En este momento la causa existe solo en la conversación. El registro no la tiene.",
  },
  { llamada: 'registrar_causa(C009, parada de línea, montaje, T17, "se paró la línea…")', responde: "codigo", respuesta: "Verifica que la frase esté en T17 y la guarda en el caso. “Causa guardada.”" },
  { llamada: 'subir_severidad(C009, "por ahora no hay fecha…")', responde: "codigo", respuesta: "“C009 y C010 escalan. Falta su alerta.”" },
  {
    llamada: "pedir_texto(alerta, C009)", responde: "redactor", respuesta: "“ALERTA · C009 Pickup/Brasil pasó a crítica…”",
    nota: "El texto existe solo en la conversación. Nadie recibió la alerta todavía.",
  },
  { llamada: 'registrar_alerta(S034, C009, "ALERTA · C009…")', responde: "codigo", respuesta: "Verifica que corresponda y la guarda. Recién ahí la alerta existe." },
];
const LADO: Record<Lado, { nombre: string; icono: LucideIcon; texto: string; punto: string; caja: string }> = {
  codigo: { nombre: "El código", icono: Calculator, texto: "text-codigo", punto: "bg-codigo", caja: "border-codigo/25 bg-[#f3f5f8]" },
  coordinador: { nombre: "Coordinador", icono: Workflow, texto: "text-coord", punto: "bg-coord", caja: "border-coord/30 bg-[#eef3fe]" },
  lector: { nombre: "Lector", icono: BookOpenText, texto: "text-lector", punto: "bg-lector", caja: "border-lector/30 bg-[#e9f5f7]" },
  redactor: { nombre: "Redactor", icono: PenLine, texto: "text-redactor", punto: "bg-redactor", caja: "border-redactor/30 bg-[#ecf6ee]" },
};

// el versus: las responsabilidades de cada lado (la alerta se parte en dos: cuándo, el código; el texto, el redactor)
const CODIGO_HACE: { que: string; ej: string }[] = [
  { que: "Calcula los atrasos", ej: "faltan autos, llega al embarque, severidad, dónde se traban" },
  { que: "Abre, escala y resuelve los casos", ej: "uno por combinación, con las reglas del criterio" },
  { que: "Decide cuándo hay alerta y cuándo informe", ej: "alerta al escalar, una por caso; informe al cierre de cada turno" },
  { que: "Decide qué es novedad", ej: "lo que cambió desde el último informe" },
  { que: "Verifica cada cita", ej: "tiene que estar tal cual en la bitácora" },
  { que: "Frena lo que no corresponde", ej: "los hooks: avisos repetidos, informes incompletos" },
  { que: "Guarda todo en el registro", ej: "es la memoria: el modelo no recuerda nada" },
];
const AGENTES_HACEN: { lado: Lado; que: string; ej: string }[] = [
  { lado: "coordinador", que: "Elige qué hacer en cada foto y en qué orden", ej: "qué pedir, a quién y qué registrar" },
  { lado: "lector", que: "Lee la bitácora y propone la causa", ej: "tipo y etapa, con la frase citada tal cual" },
  { lado: "lector", que: "Dice si la causa sigue", ej: "sin fecha, con fecha, resuelta o no dice" },
  { lado: "coordinador", que: "Decide subir o levantar la severidad", ej: "con la frase de la bitácora que lo justifica" },
  { lado: "redactor", que: "Escribe el texto de alertas e informes", ej: "con los datos que le pasa el código" },
];

/** Quién hace qué: el código a la izquierda, los agentes a la derecha, y una alerta real que va y viene entre los dos. */
function QuienHaceQue() {
  return (
    <Tarjeta className="mt-5 p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xl font-semibold">Quién hace qué</p>
        <p className="text-tinta-3">el código contra los agentes</p>
      </div>

      <div className="mt-5 grid grid-cols-[minmax(0,1fr)_56px_minmax(0,1fr)] gap-x-2">
        {/* las dos cabeceras: el principio de cada lado */}
        <div className="rounded-xl bg-codigo px-5 py-4 text-white">
          <p className="flex items-center gap-2 text-lg font-semibold"><Calculator className="size-5" aria-hidden /> El código</p>
          <p className="mt-1 text-white/85">Lo que tiene reglas fijas: da siempre lo mismo, se puede probar y no gasta tokens.</p>
        </div>
        <span />
        <div className="rounded-xl border border-linea bg-suave px-5 py-4">
          <p className="flex items-center gap-2 text-lg font-semibold">
            <span className="flex gap-1">
              <Workflow className="size-5 text-coord" aria-hidden /><BookOpenText className="size-5 text-lector" aria-hidden /><PenLine className="size-5 text-redactor" aria-hidden />
            </span>
            Los agentes <span className="font-normal text-tinta-2">· Claude Haiku 5.5</span>
          </p>
          <p className="mt-1 text-tinta-2">Lo que hay que leer o escribir en texto libre, y elegir el próximo paso.</p>
        </div>

        {/* el versus: qué le toca a cada lado */}
        <ul className="mt-3 space-y-1 rounded-xl border border-codigo/25 bg-[#f3f5f8] px-5 py-4">
          {CODIGO_HACE.map((c, i) => (
            <motion.li key={c.que} initial={{ opacity: 0, x: -8 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 + i * 0.08 }} className="flex gap-3 py-1">
              <span className="mt-2 size-2 shrink-0 rounded-[2px] bg-codigo" aria-hidden />
              <span>
                <b className="font-semibold">{c.que}</b>
                <span className="block text-tinta-2">{c.ej}</span>
              </span>
            </motion.li>
          ))}
        </ul>
        <div className="flex items-center justify-center">
          <span className="grid size-12 place-items-center rounded-full border-2 border-linea-fuerte bg-tarjeta font-mono text-lg font-semibold text-tinta-2">vs</span>
        </div>
        <ul className="mt-3 space-y-1 self-start rounded-xl border border-linea bg-suave px-5 py-4">
          {AGENTES_HACEN.map((a, i) => (
            <motion.li key={a.que} initial={{ opacity: 0, x: 8 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 + i * 0.08 }} className="py-1">
              <span className={cn("text-sm font-semibold tracking-wide uppercase", LADO[a.lado].texto)}>{LADO[a.lado].nombre}</span>
              <b className="block font-semibold">{a.que}</b>
              <span className="block text-tinta-2">{a.ej}</span>
            </motion.li>
          ))}
        </ul>

        <p className="col-span-3 mt-8 border-t border-linea pt-5 text-lg font-semibold">
          Cómo trabajan juntos: una alerta real, paso por paso <span className="font-normal text-tinta-3">· Pickup para Brasil en S034</span>
        </p>

        {/* el ida y vuelta: el coordinador pide (derecha) y contesta el código (izquierda) o otro agente (derecha) */}
        {PASOS.map((p, i) => {
          const r = LADO[p.responde];
          const delCodigo = p.responde === "codigo";
          const aparece = (lado: "izq" | "der", d: number) => ({
            initial: { opacity: 0, x: lado === "izq" ? -12 : 12 },
            whileInView: { opacity: 1, x: 0 },
            viewport: { once: true, amount: 0.5 },
            transition: { delay: d, duration: 0.35 },
          });
          const respuesta = (
            <motion.div {...aparece(delCodigo ? "izq" : "der", 0.35)} className={cn("mt-2 rounded-lg border px-4 py-2.5", r.caja)}>
              <p className={cn("text-sm font-semibold tracking-wide uppercase", r.texto)}>{delCodigo ? "Código" : `${r.nombre}, al coordinador`}</p>
              <p className="mt-0.5 text-tinta">{p.respuesta}</p>
              {p.nota && <p className="mt-2 border-t border-dashed border-linea-fuerte pt-2 text-sm text-tinta-2 italic">{p.nota}</p>}
            </motion.div>
          );
          return (
            <div key={i} className="contents">
              <span />
              <div className="relative flex justify-center">
                <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-linea-fuerte" aria-hidden />
                <span className="relative z-10 mt-5 grid size-7 place-items-center rounded-full bg-coord text-sm font-semibold text-white ring-4 ring-tarjeta">{i + 1}</span>
              </div>
              <motion.div {...aparece("der", 0.1)} className={cn("mt-4 rounded-lg border px-4 py-2.5", LADO.coordinador.caja)}>
                <p className="text-sm font-semibold tracking-wide text-coord uppercase">Coordinador</p>
                <p className="mt-0.5 font-mono text-sm text-tinta">{p.llamada}</p>
              </motion.div>

              {delCodigo ? respuesta : <span />}
              <div className="relative">
                <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-linea-fuerte" aria-hidden />
              </div>
              {delCodigo ? <span /> : respuesta}
            </div>
          );
        })}
      </div>

      <p className="mt-5 border-t border-linea pt-4 text-lg text-tinta-2">
        ¿Corresponde? Lo dice el código. ¿Qué dice? Lo escribe el lector o el redactor. Revisarlo y guardarlo: el código. Las tools <code className="font-mono text-base">registrar_…</code> son la entrega del contenido al código.
      </p>
    </Tarjeta>
  );
}
