// Segmented Control de 21st.dev (ddoemonn/segmented-control), adaptado: los colores son los tokens del front
// (acento en vez de stone, sin modo oscuro) y se puede deshabilitar entero mientras corre el agente.
import { useCallback, useEffect, useRef, useState } from "react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { cn } from "@/lib/utils";

const CELL = { type: "spring", stiffness: 520, damping: 34, mass: 0.45 } as const;

const SEG = "px-3.5 py-[7px] text-center text-[13px] font-medium leading-[18px] tracking-[-0.01em] whitespace-nowrap";

export type SegmentedOption = { value: string; label: string; disabled?: boolean };

export type SegmentedControlProps = {
  options: SegmentedOption[];
  label: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  className?: string;
};

export function SegmentedControl({ options, label, value, defaultValue, onValueChange, disabled, className }: SegmentedControlProps) {
  const count = Math.max(1, options.length);
  const template = `repeat(${count}, minmax(0, 1fr))`;

  const [internal, setInternal] = useState(() => defaultValue ?? options[0]?.value ?? "");
  const [hovered, setHovered] = useState(-1);

  const controlled = value !== undefined;
  const current = controlled ? value : internal;
  const found = options.findIndex((o) => o.value === current);
  const index = found < 0 ? 0 : found;

  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const emit = useRef(onValueChange);
  useEffect(() => {
    emit.current = onValueChange;
  });

  const reduced = useReducedMotion();
  const pos = useMotionValue(index);
  const thumbX = useTransform(pos, (v) => `${v * 100}%`);
  const maskX = useTransform(pos, (v) => `${v * -100}%`);

  useEffect(() => {
    if (reduced) {
      pos.set(index);
      return;
    }
    const controls = animate(pos, index, CELL);
    return () => controls.stop();
  }, [index, reduced, pos]);

  const select = useCallback(
    (next: string) => {
      if (disabled) return;
      if (!controlled) setInternal(next);
      if (next !== current) emit.current?.(next);
    },
    [controlled, current, disabled],
  );

  const seek = useCallback(
    (from: number, dir: number) => {
      let i = from;
      for (let k = 0; k < count; k++) {
        i = (i + dir + count) % count;
        if (!options[i]?.disabled) return i;
      }
      return from;
    },
    [count, options],
  );

  const go = useCallback(
    (i: number) => {
      const option = options[i];
      if (!option || option.disabled) return;
      buttons.current[i]?.focus();
      select(option.value);
    },
    [options, select],
  );

  const onKeyDown = (e: React.KeyboardEvent, i: number) => {
    // ← → mueven el control si se llegó con Tab; ↑ ↓ siguen pasando de escena
    if (e.key === "ArrowRight") {
      e.preventDefault();
      e.stopPropagation();
      go(seek(i, 1));
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      e.stopPropagation();
      go(seek(i, -1));
    } else if (e.key === "Home") {
      e.preventDefault();
      go(seek(count - 1, 1));
    } else if (e.key === "End") {
      e.preventDefault();
      go(seek(0, -1));
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled || undefined}
      className={cn(
        "relative inline-block rounded-[9px] border border-linea bg-suave p-[3px] shadow-[inset_0_1px_2px_rgba(17,24,39,0.06)] select-none",
        disabled && "opacity-60",
        className,
      )}
    >
      <div className="relative grid" style={{ gridTemplateColumns: template, touchAction: "manipulation" }}>
        {options.map((option, i) => (
          <span
            key={option.value}
            aria-hidden
            className={cn(SEG, "pointer-events-none", option.disabled ? "text-linea-fuerte" : hovered === i && i !== index ? "text-tinta" : "text-tinta-2")}
          >
            {option.label}
          </span>
        ))}

        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 overflow-hidden rounded-[6px] bg-acento shadow-[0_1px_2px_rgba(15,94,112,0.35)]"
          style={{ width: `${100 / count}%`, x: thumbX }}
          initial={false}
        >
          <motion.div className="absolute inset-0" style={{ x: maskX }} initial={false}>
            <div className="absolute inset-y-0 left-0 grid" style={{ width: `${count * 100}%`, gridTemplateColumns: template }}>
              {options.map((option) => (
                <span key={option.value} className={cn(SEG, "text-white")}>
                  {option.label}
                </span>
              ))}
            </div>
          </motion.div>
        </motion.div>
        <div className="absolute inset-0 grid" style={{ gridTemplateColumns: template }} onPointerLeave={() => setHovered(-1)}>
          {options.map((option, i) => (
            <button
              key={option.value}
              ref={(node) => {
                buttons.current[i] = node;
              }}
              type="button"
              role="radio"
              aria-checked={i === index}
              aria-disabled={option.disabled || disabled || undefined}
              tabIndex={i === index ? 0 : -1}
              onClick={(e) => {
                if (!option.disabled) select(option.value);
                // después de un clic con el mouse el foco no se queda acá: las flechas y el puntero siguen pasando de diapositiva
                if (e.detail > 0) e.currentTarget.blur();
              }}
              onKeyDown={(e) => onKeyDown(e, i)}
              onPointerEnter={() => !option.disabled && !disabled && setHovered(i)}
              className={cn("rounded-[6px] outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--color-acento)]", disabled ? "cursor-not-allowed" : "cursor-pointer")}
            >
              <span className="sr-only">{option.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default SegmentedControl;
