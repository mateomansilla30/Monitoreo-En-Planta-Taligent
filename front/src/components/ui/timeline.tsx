// Timeline de 21st.dev (kuratlielia/timeline), adaptado al feed de la corrida en vivo:
// - los grupos los arma quien lo usa (una llegada de foto por grupo), en vez de agrupar por día;
// - dentro de un grupo las filas van en el orden en que pasaron (la historia de la foto se lee de arriba abajo),
//   y el grupo más nuevo queda arriba;
// - el tiempo de cada fila es un texto que se pasa armado (minutos desde que arrancó la corrida);
// - el color del marcador lo elige quien lo usa (el de cada agente, o rojo para una alerta);
// - el CSS module y los motion tokens del original están pasados a Tailwind y a constantes acá.
// Se mantienen: el encabezado de grupo fijo al hacer scroll, la línea que se dibuja entre filas, las filas que se
// expanden, la entrada suave de lo nuevo, el contador que rueda y la navegación con flechas.
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { Transition } from "motion/react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TimelineEvent {
  id: string;
  /** Quién lo hizo, antes del título y en su color. */
  actor?: string;
  actorClassName?: string;
  title: ReactNode;
  /** Una línea de contexto debajo del título. */
  meta?: ReactNode;
  /** Se abre al tocar la fila. Las filas sin detalle no son interactivas. */
  detail?: ReactNode;
  icon?: ReactNode;
  /** Clases del marcador (fondo, borde y color del ícono). */
  markerClassName?: string;
  /** Clases de la fila entera, para destacar una alerta. */
  rowClassName?: string;
  /** El tiempo, ya formateado. */
  time?: string;
}

export interface TimelineGroup {
  id: string;
  label: ReactNode;
  sublabel?: ReactNode;
  /** Las filas en el orden en que pasaron. */
  events: TimelineEvent[];
  /** El sustantivo del contador: "paso" → "1 paso", "3 pasos". */
  unit?: [string, string];
}

export interface TimelineProps {
  /** El grupo más nuevo primero. */
  groups: TimelineGroup[];
  label: string;
  /** Alto del área con scroll. */
  maxHeight?: number | string;
  /** Volver arriba cuando llega un grupo nuevo. */
  scrollToNew?: boolean;
  /** Filas abiertas al empezar. */
  defaultExpanded?: string[];
  className?: string;
}

// motion tokens del original
const ENTER = [0.22, 1, 0.36, 1] as [number, number, number, number];
const STANDARD = [0.4, 0, 0.2, 1] as [number, number, number, number];
const SMOOTH: Transition = { type: "spring", visualDuration: 0.4, bounce: 0 };
const MORPH: Transition = { type: "spring", visualDuration: 0.35, bounce: 0.2 };
const SNAPPY: Transition = { type: "spring", visualDuration: 0.25, bounce: 0.15 };
const FAST = 0.15;
const NORMAL = 0.25;
const BLUR_SOFT = 4;
const BLUR_SUBTLE = 2;
/** Segundos entre filas que aparecen juntas, para que la línea se lea como dibujándose hacia abajo. */
const STEP = 0.09;
const noopSubscribe = () => () => {};

/** Reduced motion solo después de hidratar. */
function useReducedMotionSafe() {
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const reduced = useReducedMotion();
  return hydrated && !!reduced;
}

type Clock = { schedule: () => number; reduced: boolean; fresh: Set<string> };
const RevealClock = createContext<Clock | null>(null);

/** Un texto que cambia en el lugar: el nuevo sube desde un blur suave y el viejo se va un poco más rápido. */
function RiseText({ text, reduced, direction = 1 }: { text: string; reduced: boolean; direction?: number }) {
  return (
    <span className="relative inline-block" aria-hidden="true">
      <AnimatePresence mode="popLayout" initial={false} custom={direction}>
        <motion.span
          key={text}
          className="inline-block"
          custom={direction}
          variants={{
            from: (dir: number) => (reduced ? { opacity: 0 } : { opacity: 0, y: `${0.3 * dir}em`, filter: `blur(${BLUR_SOFT}px)` }),
            to: { opacity: 1, y: "0em", filter: "blur(0px)" },
            gone: (dir: number) =>
              reduced
                ? { opacity: 0, transition: { duration: 0 } }
                : { opacity: 0, y: `${-0.3 * dir}em`, filter: `blur(${BLUR_SUBTLE}px)`, transition: { duration: 0.14, ease: STANDARD } },
          }}
          initial="from"
          animate="to"
          exit="gone"
          transition={{ duration: reduced ? 0.15 : 0.22, ease: ENTER }}
        >
          {text}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/** El contador del grupo rueda dígito por dígito. */
function RollingCount({ value, reduced }: { value: number; reduced: boolean }) {
  const [state, setState] = useState({ value, direction: 1 });
  if (state.value !== value) setState({ value, direction: value > state.value ? 1 : -1 });
  const chars = [...String(value)];
  return (
    <span className="tabular inline-flex" aria-hidden="true">
      {chars.map((char, index) => (
        <span key={chars.length - index} className="inline-block">
          <RiseText text={char} reduced={reduced} direction={state.direction} />
        </span>
      ))}
    </span>
  );
}

/** Un grupo. Uno nuevo se abre desde cero y empuja a los de abajo. */
function GroupSection({ id, fresh, reduced, children }: { id: string; fresh: boolean; reduced: boolean; children: ReactNode }) {
  const [entering, setEntering] = useState(fresh);
  return (
    <motion.section
      className={cn("relative", entering && "overflow-hidden")}
      aria-labelledby={id}
      initial={fresh ? { height: 0, opacity: 0 } : false}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0, transition: { duration: reduced ? 0.1 : 0.2, ease: STANDARD } }}
      transition={reduced ? { duration: 0.15 } : { height: SMOOTH, opacity: { duration: NORMAL, ease: ENTER } }}
      onAnimationComplete={() => setEntering(false)}
    >
      {children}
    </motion.section>
  );
}

function TimelineRow({ row, last, expanded, onToggle }: { row: TimelineEvent; last: boolean; expanded: boolean; onToggle: () => void }) {
  const clock = useContext(RevealClock)!;
  const { reduced } = clock;
  const detailId = useId();
  // la fila aparece una vez, la primera que entra en pantalla: salta el marcador y se dibuja la línea hacia la siguiente
  const [revealDelay, setRevealDelay] = useState<number | null>(null);
  const fresh = clock.fresh.has(row.id);
  const [entering, setEntering] = useState(fresh);
  const shown = revealDelay !== null;
  const delay = (revealDelay ?? 0) + (fresh ? 0.12 : 0);
  const pop: Transition = reduced
    ? { duration: 0, opacity: { duration: 0.15 } }
    : { ...MORPH, visualDuration: 0.36, bounce: 0.32, delay, opacity: { duration: FAST, ease: ENTER, delay } };
  const draw: Transition = reduced ? { duration: 0 } : { ...SMOOTH, visualDuration: 0.34, delay: delay + 0.1 };
  const Trigger = row.detail ? "button" : "div";

  return (
    <motion.li
      className={cn("relative grid grid-cols-[28px_minmax(0,1fr)] gap-x-3", entering && "overflow-hidden")}
      initial={fresh ? { height: 0 } : false}
      animate={{ height: "auto" }}
      exit={{
        height: 0,
        opacity: 0,
        transition: reduced ? { duration: 0.1 } : { height: { ...SMOOTH, visualDuration: 0.3 }, opacity: { duration: 0.12 } },
      }}
      transition={reduced ? { duration: 0 } : SMOOTH}
      onAnimationComplete={() => setEntering(false)}
      onViewportEnter={() => setRevealDelay((current) => current ?? clock.schedule())}
      viewport={{ once: true, amount: 0.2 }}
    >
      <motion.span
        className={cn(
          "relative z-[1] mt-1.5 grid size-7 place-items-center rounded-full border border-linea bg-tarjeta text-tinta-2 [&_svg]:size-3.5",
          row.markerClassName,
        )}
        aria-hidden="true"
        initial={{ scale: 0.4, opacity: 0 }}
        animate={shown ? { scale: 1, opacity: 1 } : undefined}
        transition={pop}
      >
        {row.icon}
      </motion.span>
      {!last && (
        <motion.span
          className="absolute top-[34px] bottom-[-6px] left-[13.5px] w-px origin-top bg-linea"
          aria-hidden="true"
          initial={{ scaleY: 0 }}
          animate={shown ? { scaleY: 1 } : undefined}
          transition={draw}
        />
      )}
      <motion.div
        className={cn("min-w-0 pb-2.5", row.rowClassName)}
        initial={fresh ? (reduced ? { opacity: 0 } : { opacity: 0, y: -10, filter: `blur(${BLUR_SOFT}px)` }) : false}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={
          reduced
            ? { duration: 0.15 }
            : { y: SMOOTH, opacity: { duration: NORMAL, ease: ENTER, delay: 0.05 }, filter: { duration: NORMAL, ease: ENTER, delay: 0.05 } }
        }
      >
        <Trigger
          className={cn(
            "flex w-full items-start gap-3 rounded-md px-2 py-1.5 text-left",
            row.detail && "cursor-pointer transition-colors hover:bg-suave focus-visible:bg-suave",
          )}
          {...(row.detail
            ? { type: "button" as const, "data-timeline-trigger": "", "aria-expanded": expanded, "aria-controls": expanded ? detailId : undefined, onClick: onToggle }
            : {})}
        >
          <span className="min-w-0 flex-1">
            <span className="block text-sm text-pretty text-tinta">
              {row.actor && <span className={cn("mr-1.5 text-xs font-semibold tracking-wide uppercase", row.actorClassName)}>{row.actor}</span>}
              {row.title}
            </span>
            {row.meta && <span className="mt-0.5 block text-xs text-pretty text-tinta-2">{row.meta}</span>}
          </span>
          {row.time && <span className="tabular shrink-0 pt-0.5 font-mono text-[11px] text-tinta-3">{row.time}</span>}
          {row.detail && (
            <motion.span
              className="shrink-0 pt-0.5 text-tinta-3"
              aria-hidden="true"
              initial={false}
              animate={{ rotate: expanded ? 180 : 0 }}
              transition={reduced ? { duration: 0 } : SNAPPY}
            >
              <ChevronDown size={16} strokeWidth={1.75} />
            </motion.span>
          )}
        </Trigger>
        <AnimatePresence initial={false}>
          {expanded && row.detail && (
            <motion.div
              key="detail"
              id={detailId}
              className="overflow-hidden"
              initial={{ height: 0 }}
              animate={{ height: "auto" }}
              exit={{ height: 0, transition: reduced ? { duration: 0 } : { ...SMOOTH, visualDuration: 0.28 } }}
              transition={reduced ? { duration: 0 } : SMOOTH}
            >
              <motion.div
                className="px-2 pt-1 pb-1.5"
                initial={reduced ? { opacity: 0 } : { opacity: 0, y: -4, filter: `blur(${BLUR_SOFT}px)` }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, transition: { duration: 0.1, ease: STANDARD } }}
                transition={reduced ? { duration: 0.15 } : { duration: NORMAL, ease: ENTER, delay: 0.06 }}
              >
                {row.detail}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.li>
  );
}

export function Timeline({ groups, label, maxHeight, scrollToNew = true, defaultExpanded = [], className }: TimelineProps) {
  const reduced = useReducedMotionSafe();
  const id = useId();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(() => new Set(defaultExpanded));

  // las filas que llegan después del primer render son nuevas: entran deslizándose y las demás se acomodan
  const allIds = groups.flatMap((g) => g.events.map((e) => e.id));
  const ids = allIds.join("|");
  const [known, setKnown] = useState(() => ({ ids, set: new Set(allIds), fresh: new Set<string>() }));
  if (known.ids !== ids) {
    const added = allIds.filter((x) => !known.set.has(x));
    setKnown({ ids, set: new Set(allIds), fresh: new Set([...known.fresh, ...added]) });
  }
  const [initialGroups] = useState(() => new Set(groups.map((g) => g.id)));

  // el borde de abajo se difumina mientras hay más filas abajo
  const trackRef = useRef<HTMLDivElement>(null);
  const scrolls = maxHeight !== undefined;
  useEffect(() => {
    const scroller = scrollerRef.current;
    const track = trackRef.current;
    if (!scrolls || !scroller || !track || typeof ResizeObserver === "undefined") return;
    const update = () => {
      if (scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop > 2) scroller.dataset.more = "";
      else delete scroller.dataset.more;
    };
    update();
    scroller.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(scroller);
    observer.observe(track);
    return () => {
      scroller.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [scrolls]);

  const newestGroup = groups[0]?.id;
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scrollToNew || !scroller || scroller.scrollTop < 1) return;
    scroller.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
  }, [newestGroup, scrollToNew, reduced]);

  const nextReveal = useRef(0);
  const schedule = useCallback(() => {
    if (reduced) return 0;
    const current = performance.now() / 1000;
    const start = Math.min(Math.max(current, nextReveal.current), current + 0.45);
    nextReveal.current = start + STEP;
    return start - current;
  }, [reduced]);
  const clock = useMemo<Clock>(() => ({ schedule, reduced, fresh: known.fresh }), [schedule, reduced, known.fresh]);

  function toggle(rowId: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  }
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const triggers = [...(scrollerRef.current?.querySelectorAll<HTMLElement>("[data-timeline-trigger]") ?? [])];
    const index = triggers.indexOf(document.activeElement as HTMLElement);
    if (index < 0) return;
    event.preventDefault();
    event.stopPropagation();
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? triggers.length - 1
          : Math.min(Math.max(index + (event.key === "ArrowDown" ? 1 : -1), 0), triggers.length - 1);
    triggers[next]?.focus();
  }

  return (
    <RevealClock.Provider value={clock}>
      <div className={cn("relative", className)} role="region" aria-label={label}>
        <div
          ref={scrollerRef}
          className={cn(
            "scroll-fino",
            scrolls && "max-h-(--timeline-height) overflow-y-auto data-more:[mask-image:linear-gradient(to_bottom,black_88%,transparent)]",
          )}
          style={scrolls ? ({ "--timeline-height": typeof maxHeight === "number" ? `${maxHeight}px` : maxHeight } as CSSProperties) : undefined}
          onKeyDown={onKeyDown}
        >
          <div ref={trackRef}>
            <AnimatePresence>
              {groups.map((group) => {
                const unit = group.unit ?? ["paso", "pasos"];
                return (
                  <GroupSection key={group.id} id={`${id}-${group.id}`} fresh={!initialGroups.has(group.id)} reduced={reduced}>
                    <div
                      className="sticky top-0 z-[2] flex items-baseline justify-between gap-3 border-b border-linea bg-tarjeta/95 px-1 py-2 backdrop-blur-sm"
                      role="heading"
                      aria-level={3}
                      id={`${id}-${group.id}`}
                    >
                      <span className="min-w-0 truncate">
                        <span className="font-mono text-sm font-medium text-tinta">{group.label}</span>
                        {group.sublabel && <span className="ml-2 text-xs text-tinta-3">{group.sublabel}</span>}
                      </span>
                      <span className="shrink-0 text-xs text-tinta-3">
                        <RollingCount value={group.events.length} reduced={reduced} /> {group.events.length === 1 ? unit[0] : unit[1]}
                      </span>
                    </div>
                    <ol className="px-1 pt-2 pb-3">
                      <AnimatePresence>
                        {group.events.map((row, index) => (
                          <TimelineRow
                            key={row.id}
                            row={row}
                            last={index === group.events.length - 1}
                            expanded={expanded.has(row.id)}
                            onToggle={() => toggle(row.id)}
                          />
                        ))}
                      </AnimatePresence>
                    </ol>
                  </GroupSection>
                );
              })}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </RevealClock.Provider>
  );
}

export default Timeline;
