import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useEffect } from "react";
import { Auto } from "@/componentes/LineaDeMontaje";

/** Mientras arranca el agente: un auto de la línea que pasa por la cinta, una y otra vez. */
export function Cargando() {
  const quieto = useReducedMotion();
  const x = useMotionValue(180);
  // las ruedas giran según lo que avanza el auto (radio 12, dibujado a 0,7)
  const giro = useTransform(x, (v) => (v / (0.7 * 12)) * (180 / Math.PI));
  useEffect(() => {
    if (quieto) return;
    const a = animate(x, [-70, 430], { duration: 2.6, ease: "linear", repeat: Infinity });
    return () => a.stop();
  }, [x, quieto]);

  return (
    <div className="w-full max-w-md" role="status">
      <svg viewBox="0 0 360 120" className="w-full" aria-hidden>
        {/* la cinta, que corre */}
        <rect x={16} y={92} width={328} height={12} rx={6} fill="#d5dbe2" />
        <motion.line
          x1={24} x2={336} y1={98} y2={98} stroke="#9aa5b1" strokeWidth={2} strokeDasharray="8 10"
          animate={quieto ? undefined : { strokeDashoffset: [0, -36] }}
          transition={{ duration: 0.65, ease: "linear", repeat: Infinity }}
        />
        <circle cx={22} cy={98} r={6} fill="#9aa5b1" />
        <circle cx={338} cy={98} r={6} fill="#9aa5b1" />
        <motion.g style={{ x }}>
          <g transform="translate(0 92) scale(0.7)">
            <Auto modelo="SUV" color="#0f5e70" fase={3} giro={giro} />
          </g>
        </motion.g>
      </svg>
      <p className="mt-3 text-lg font-semibold">
        Arrancando el agente
        {[0, 1, 2].map((k) => (
          <motion.span key={k} animate={quieto ? undefined : { opacity: [0.2, 1, 0.2] }} transition={{ duration: 1.2, repeat: Infinity, delay: k * 0.2 }}>.</motion.span>
        ))}
      </p>
      <p className="mt-1 text-sm text-tinta-2">Levanta el servidor MCP y espera la primera foto.</p>
    </div>
  );
}
