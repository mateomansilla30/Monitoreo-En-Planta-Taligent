import {
  BookOpenText, Calculator, Camera, Check, Lock, NotebookPen, PenLine, ScrollText, Server, Workflow,
  type LucideIcon,
} from "lucide-react";
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
      <Titulo parte="3 · Cómo funciona" titulo="Tres agentes y un servidor MCP" bajada="Los tres son Claude Haiku 5.5. Solo el coordinador escribe en el registro." />

      <div className="mt-6 grid gap-5 lg:grid-cols-[2.3fr_1fr]">
        <Tarjeta className="p-0">
          <div ref={caja} className="relative grid grid-cols-4 place-items-center gap-x-8 gap-y-10 bg-[radial-gradient(#dfe3e8_1px,transparent_1px)] [background-size:16px_16px] px-6 py-10">
            <span />
            <Nodo ref={lector} icono={BookOpenText} nombre="Lector" texto="encuentra la causa" tono="lector" />
            <Nodo ref={bitacoras} icono={ScrollText} nombre="Bitácoras" texto="una por turno" />
            <span />

            <Nodo ref={foto} icono={Camera} nombre="Foto nueva" texto="cada 4 horas" />
            <Nodo ref={coordinador} icono={Workflow} nombre="Coordinador" texto="decide y registra" tono="coord" />
            <Nodo ref={servidor} icono={Server} nombre="Servidor MCP" texto="7 tools" />
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

        <div className="grid gap-5">
          <Lista titulo="El código" color="text-tinta-2" items={["Calcula los atrasos", "Sigue cada caso", "Decide qué es novedad", "Verifica las citas"]} />
          <Lista titulo="El modelo" color="text-coord" items={["Encuentra la causa", "Sube la severidad", "Redacta los avisos"]} />
        </div>
      </div>

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
          <Lock className="size-4 text-tinta-3" aria-hidden /> Si un agente pide otra tool, el código la rechaza.
        </p>
      </Tarjeta>
    </div>
  );
}

function Lista({ titulo, color, items }: { titulo: string; color: string; items: string[] }) {
  return (
    <Tarjeta>
      <p className={cn("text-lg font-semibold", color)}>{titulo}</p>
      <ul className="mt-3 space-y-2">
        {items.map((t) => (
          <li key={t} className="flex items-center gap-2 text-lg">
            <Check className={cn("size-5 shrink-0", color)} aria-hidden />
            {t}
          </li>
        ))}
      </ul>
    </Tarjeta>
  );
}
