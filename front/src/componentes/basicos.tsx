import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { useEffect, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { FONDO_SEVERIDAD, NOMBRE_SEVERIDAD, TEXTO_SEVERIDAD, type Severidad } from "@/datos";
import { cn } from "@/lib/utils";

/** Un número que se anima hasta su valor cada vez que cambia (el costo en vivo, los contadores). */
export function Numero({
  valor,
  formato = (n: number) => Math.round(n).toLocaleString("es-AR"),
  className,
}: {
  valor: number;
  formato?: (n: number) => string;
  className?: string;
}) {
  const actual = useMotionValue(valor);
  const texto = useTransform(actual, formato);
  useEffect(() => {
    const control = animate(actual, valor, { duration: 0.6, ease: "easeOut" });
    return () => control.stop();
  }, [actual, valor]);
  return <motion.span className={cn("tabular", className)}>{texto}</motion.span>;
}

/** Alertas e informes: vienen en Markdown (negritas, listas, tablas). */
export function Markdown({ texto, className }: { texto: string; className?: string }) {
  return (
    <div className={cn("md", className)}>
      {/* remarkBreaks: un salto de línea del redactor es un salto de línea (el título de la alerta y la línea de la foto) */}
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{texto}</ReactMarkdown>
    </div>
  );
}

/** La severidad como etiqueta: un cuadradito del color y el nombre. */
export function EtiquetaSeveridad({ severidad, className }: { severidad: Severidad; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm font-medium", TEXTO_SEVERIDAD[severidad], className)}>
      <span className={cn("size-2.5 rounded-[2px]", FONDO_SEVERIDAD[severidad])} />
      {NOMBRE_SEVERIDAD[severidad]}
    </span>
  );
}

export function Titulo({
  parte,
  titulo,
  bajada,
  children,
}: {
  parte: string;
  titulo: ReactNode;
  bajada?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4 border-b border-linea pb-5">
      <div className="max-w-4xl">
        <p className="text-sm font-medium text-acento">{parte}</p>
        <h2 className="mt-1 text-3xl leading-tight font-semibold tracking-tight text-balance md:text-4xl">{titulo}</h2>
        {bajada && <p className="mt-2 max-w-3xl text-base text-pretty text-tinta-2">{bajada}</p>}
      </div>
      {children}
    </div>
  );
}

/** La caja base de todas las tarjetas. */
export function Tarjeta({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("relative rounded-lg border border-linea bg-tarjeta p-5", className)}>{children}</div>;
}

/** El encabezado chico de una tarjeta. */
export function Rotulo({ children, className }: { children: ReactNode; className?: string }) {
  return <h3 className={cn("text-sm font-semibold text-tinta", className)}>{children}</h3>;
}

/** Una cita textual de una bitácora. */
export function Cita({ children, color = "lector", className }: { children: ReactNode; color?: "lector" | "critica" | "redactor"; className?: string }) {
  const borde = { lector: "border-lector", critica: "border-sev-critica", redactor: "border-redactor" }[color];
  return (
    <blockquote className={cn("border-l-2 pl-3 text-pretty text-tinta", borde, className)}>
      “{children}”
    </blockquote>
  );
}

export function Leyenda() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-tinta-2">
      {(["ninguna", "media", "alta", "critica"] as Severidad[]).map((s) => (
        <span key={s} className="inline-flex items-center gap-1.5">
          <span className={cn("size-3 rounded-[2px]", FONDO_SEVERIDAD[s])} />
          {NOMBRE_SEVERIDAD[s]}
        </span>
      ))}
    </div>
  );
}
