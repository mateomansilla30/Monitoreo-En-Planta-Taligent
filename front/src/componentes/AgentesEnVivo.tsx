import { BookOpenText, Camera, NotebookPen, PenLine, ScrollText, Server, Workflow, type LucideIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Rotulo, Tarjeta } from "@/componentes/basicos";
import { useDatos } from "@/contexto";
import { AGENTES } from "@/datos";
import { cn } from "@/lib/utils";
import type { ItemFeed } from "@/vivo";

type Nodo = "foto" | "coordinador" | "lector" | "redactor" | "servidor" | "bitacora" | "registro";
type Tono = "coordinador" | "lector" | "redactor" | "alerta" | "informe" | "frenado";

// las líneas que siempre están; las de cada paso se encienden encima
const ENLACES: [Nodo, Nodo][] = [
  ["foto", "coordinador"], ["coordinador", "lector"], ["coordinador", "redactor"], ["coordinador", "servidor"],
  ["lector", "servidor"], ["servidor", "bitacora"], ["servidor", "registro"],
];

const COLOR: Record<Tono, string> = {
  coordinador: "#1d4ed8", lector: "#0e7490", redactor: "#15803d", alerta: "#d0364c", informe: "#0f5e70", frenado: "#c99a1e",
};

const REGISTRA: [Nodo, Nodo][] = [["coordinador", "servidor"], ["servidor", "registro"]];

/** Qué se enciende con cada paso del feed: las flechas, en orden, y si algún nodo cambia de color. */
function paso(item: ItemFeed | undefined): { enlaces: [Nodo, Nodo][]; tono?: Tono; marca?: Partial<Record<Nodo, Tono>> } {
  if (!item) return { enlaces: [] };
  const agente = item.agente;
  if (item.clase === "frenado") {
    // un hook o el servidor rechazó algo: la flecha al servidor se pone amarilla
    const quien = (agente ?? "coordinador") as Nodo;
    return item.accion === "hook"
      ? { enlaces: [], tono: "frenado", marca: { coordinador: "frenado" } }
      : { enlaces: [[quien, "servidor"]], tono: "frenado", marca: { servidor: "frenado" } };
  }
  switch (item.accion) {
    case "llegada": return { enlaces: [["foto", "coordinador"]], tono: "coordinador" };
    case "procesar_snapshot": return { enlaces: REGISTRA, tono: "coordinador" };
    case "pide_lector": return { enlaces: [["coordinador", "lector"]], tono: "coordinador" };
    case "leer_bitacora": return { enlaces: [["lector", "servidor"], ["servidor", "bitacora"]], tono: "lector" };
    case "pedir_causa": return { enlaces: [["lector", "coordinador"]], tono: "lector" };
    case "pide_redactor": return { enlaces: [["coordinador", "redactor"]], tono: "coordinador" };
    case "pedir_texto": return { enlaces: [["redactor", "coordinador"]], tono: "redactor" };
    case "registrar_alerta": return { enlaces: REGISTRA, tono: "coordinador", marca: { registro: "alerta" } };
    case "registrar_informe": return { enlaces: REGISTRA, tono: "coordinador", marca: { registro: "informe" } };
    case "registrar_causa":
    case "subir_severidad":
    case "levantar_subida":
      return { enlaces: REGISTRA, tono: "coordinador", marca: item.clase === "subida" ? { registro: "alerta" } : undefined };
    default: return { enlaces: [] };
  }
}

const NODOS: Record<Nodo, { icono: LucideIcon; nombre: string; rol: string; agente?: Tono }> = {
  foto: { icono: Camera, nombre: "Foto", rol: "cada 4 horas" },
  coordinador: { icono: Workflow, nombre: "Coordinador", rol: "decide y registra", agente: "coordinador" },
  lector: { icono: BookOpenText, nombre: "Lector", rol: "busca la causa", agente: "lector" },
  redactor: { icono: PenLine, nombre: "Redactor", rol: "escribe los avisos", agente: "redactor" },
  servidor: { icono: Server, nombre: "Servidor MCP", rol: "7 tools" },
  bitacora: { icono: ScrollText, nombre: "Bitácoras", rol: "una por turno" },
  registro: { icono: NotebookPen, nombre: "Registro", rol: "casos y avisos" },
};

// el fondo de cada nodo: los agentes con su color, el resto neutro; encendido, más fuerte
const FONDO: Record<Tono, string> = {
  coordinador: "border-coord/40 bg-[#eef3fe] text-coord",
  lector: "border-lector/40 bg-[#e9f5f7] text-lector",
  redactor: "border-redactor/40 bg-[#ecf6ee] text-redactor",
  alerta: "border-sev-critica bg-[#fdf1f3] text-sev-critica-t",
  informe: "border-acento bg-acento-suave text-acento",
  frenado: "border-sev-media bg-[#fdf7e6] text-sev-media-t",
};

/** Los tres agentes, el servidor y el registro, con lo que está pasando ahora en la corrida. */
export function AgentesEnVivo({ selector }: { selector?: ReactNode }) {
  const { vivo, resumen } = useDatos();
  const item = [...resumen.feed].reverse().find((f) => f.clase !== "fin");
  const terminado = !vivo.corriendo && resumen.feed.length > 0;
  const ahora = vivo.corriendo ? item : undefined;
  const { enlaces, tono, marca } = paso(ahora);
  const encendidos = new Set(enlaces.flat());

  const caja = useRef<HTMLDivElement>(null);
  const refs: Record<Nodo, RefObject<HTMLDivElement | null>> = {
    foto: useRef(null), coordinador: useRef(null), lector: useRef(null), redactor: useRef(null),
    servidor: useRef(null), bitacora: useRef(null), registro: useRef(null),
  };
  const centros = useCentros(caja, refs);

  const nodo = (n: Nodo) => {
    const d = NODOS[n];
    const encendido = encendidos.has(n);
    const tonoNodo = marca?.[n] ?? (encendido && d.agente ? d.agente : undefined);
    return (
      <motion.div
        ref={refs[n]}
        animate={{ scale: encendido ? 1.05 : 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 22 }}
        className={cn(
          "relative z-10 flex w-full items-center gap-2.5 rounded-lg border px-3 py-2.5 transition-colors duration-300",
          tonoNodo ? FONDO[tonoNodo] : d.agente ? cn(FONDO[d.agente], "opacity-70") : encendido ? "border-tinta-3 bg-tarjeta text-tinta-2" : "border-linea bg-tarjeta text-tinta-3",
          encendido && "shadow-md",
        )}
      >
        <d.icono className="size-5 shrink-0" aria-hidden />
        <span className="min-w-0">
          <span className="block font-semibold whitespace-nowrap text-tinta">{n === "foto" && resumen.llegada ? `Foto ${resumen.llegada.snapshot_id}` : d.nombre}</span>
          <span className="block text-xs whitespace-nowrap">{d.rol}</span>
        </span>
      </motion.div>
    );
  };

  return (
    <Tarjeta className="p-0">
      <div className="flex items-center justify-between gap-2 px-5 pt-4">
        <Rotulo>Los agentes</Rotulo>
        {selector}
      </div>

      <div ref={caja} className="relative mx-5 mt-4 grid grid-cols-3 items-center gap-x-6 gap-y-8 rounded-lg bg-[radial-gradient(#dfe3e8_1px,transparent_1px)] [background-size:16px_16px] px-4 py-6">
        {centros && (
          <svg className="pointer-events-none absolute inset-0 size-full" aria-hidden>
            {ENLACES.map(([a, b]) => (
              <line key={a + b} x1={centros[a].x} y1={centros[a].y} x2={centros[b].x} y2={centros[b].y} stroke="#c9d0d8" strokeWidth={1.5} />
            ))}
            {enlaces.map(([a, b], k) => {
              const d = `M ${centros[a].x} ${centros[a].y} L ${centros[b].x} ${centros[b].y}`;
              const color = COLOR[tono ?? "coordinador"];
              return (
                <g key={`${ahora?.id}-${a}-${b}`}>
                  <motion.path d={d} stroke={color} strokeWidth={2.5} fill="none" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.4, delay: k * 0.35 }} />
                  {/* un punto que viaja en el sentido del pedido */}
                  <circle r={5} fill={color}>
                    <animateMotion dur="1.1s" begin={`${k * 0.35}s`} repeatCount="indefinite" path={d} />
                  </circle>
                </g>
              );
            })}
          </svg>
        )}

        <span />
        {nodo("lector")}
        {nodo("bitacora")}
        {nodo("foto")}
        {nodo("coordinador")}
        {nodo("servidor")}
        <span />
        {nodo("redactor")}
        {nodo("registro")}
      </div>

      {/* qué está pasando ahora, en una línea */}
      <div className="mt-4 min-h-[76px] border-t border-linea px-5 py-3" aria-live="polite">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={ahora?.id ?? (terminado ? "fin" : "quieto")} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            {ahora ? (
              <>
                <p className="flex items-center gap-2 text-lg">
                  <span className={cn("size-2.5 shrink-0 rounded-full", ahora.agente ? AGENTES[ahora.agente].fondo : ahora.clase === "llegada" ? "bg-tinta-3" : "bg-codigo")} aria-hidden />
                  <b className={cn("font-semibold", tono === "frenado" ? "text-sev-media-t" : "")}>{ahora.agente ? AGENTES[ahora.agente].nombre : ahora.clase === "llegada" ? "Foto nueva" : "El código"}</b>
                  <span className="truncate">{ahora.titulo}</span>
                </p>
                {ahora.detalle && <p className="mt-0.5 truncate pl-[18px] text-sm text-tinta-2">{ahora.detalle}</p>}
              </>
            ) : (
              <p className="text-lg text-tinta-3">
                {terminado ? "Terminó la corrida. En Planta están los casos y las alertas." : vivo.corriendo ? "El agente está arrancando: espera la primera foto." : "Elegí hasta qué foto correr y apretá Correr."}
              </p>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </Tarjeta>
  );
}

/** El centro de cada nodo dentro de la caja; se recalcula si cambia el tamaño. */
function useCentros(caja: RefObject<HTMLDivElement | null>, refs: Record<Nodo, RefObject<HTMLDivElement | null>>) {
  const [centros, setCentros] = useState<Record<Nodo, { x: number; y: number }> | null>(null);
  useLayoutEffect(() => {
    const medir = () => {
      const c = caja.current?.getBoundingClientRect();
      if (!c) return;
      const r = {} as Record<Nodo, { x: number; y: number }>;
      for (const [n, ref] of Object.entries(refs) as [Nodo, RefObject<HTMLDivElement | null>][]) {
        const el = ref.current;
        if (!el) return;
        // offsetLeft/Top no cambian con la escala del nodo encendido
        r[n] = { x: el.offsetLeft + el.offsetWidth / 2, y: el.offsetTop + el.offsetHeight / 2 };
      }
      setCentros(r);
    };
    const ro = new ResizeObserver(medir);
    if (caja.current) ro.observe(caja.current);
    medir();
    return () => ro.disconnect();
    // los refs son estables: se mide al montar y cuando cambia el tamaño
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return centros;
}
