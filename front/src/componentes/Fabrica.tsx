import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useEffect, type ReactNode } from "react";
import { Auto, Camion } from "@/componentes/LineaDeMontaje";

const PISO = 470; // la base del edificio y el borde de la calle

/** La Planta Las Acacias funcionando: humo en las chimeneas y un camión que sale cargado de autos. */
export function Fabrica() {
  const quieto = useReducedMotion();
  // el camión arranca escondido detrás del edificio y sale por la derecha
  const camion = useMotionValue(quieto ? 330 : 0);
  const giro = useTransform(camion, (v) => (v / 8) * (180 / Math.PI));
  useEffect(() => {
    if (quieto) return;
    const a = animate(camion, [0, 640], { duration: 7, ease: "easeIn", repeat: Infinity, repeatDelay: 3, delay: 1.5 });
    return () => a.stop();
  }, [camion, quieto]);

  return (
    <div className="overflow-hidden rounded-2xl border border-linea">
      <svg viewBox="0 0 1200 522" className="block w-full" role="img" aria-label="La Planta Las Acacias funcionando: sale humo de las chimeneas y un camión sale cargado de autos.">
        <rect width={1200} height={PISO} fill="#e8f0f4" />
        <Nube x={130} y={90} />
        <Nube x={930} y={70} escala={1.2} />
        <Nube x={560} y={40} escala={0.8} />

        {/* las chimeneas, detrás del techo, y su humo */}
        <Chimenea x={290} ancho={26} arriba={100} />
        <Chimenea x={772} ancho={22} arriba={140} />
        <Humo x={303} y={96} />
        <Humo x={783} y={136} desfase={0.3} />

        {/* el piso: la calle frente a la planta y el pasto */}
        <rect y={PISO} width={1200} height={28} fill="#d5dbe2" />
        <line x1={0} x2={1200} y1={PISO + 14} y2={PISO + 14} stroke="#f4f5f7" strokeWidth={3} strokeDasharray="22 18" />
        <rect y={PISO + 28} width={1200} height={24} fill="#dde6da" />

        <Acacia x={92} />
        <Acacia x={178} escala={0.78} />
        <Acacia x={1088} escala={0.9} />
        <Acacia x={1162} escala={1.05} />

        {/* el camión va antes que el edificio: mientras está detrás no se ve */}
        <g transform={`translate(-400 ${PISO - 236})`}>
          <Camion x={camion} giro={giro} arriba="#0f5e70" abajo={{ modelo: "Pickup", color: "#2f5d46" }} />
        </g>

        {/* la nave principal, con techo en diente de sierra */}
        {Array.from({ length: 10 }, (_, i) => {
          const x0 = 230 + i * 65;
          return (
            <g key={i}>
              <path d={`M ${x0} 255 L ${x0} 212 L ${x0 + 65} 255 Z`} fill="#d5dbe2" stroke="#b9c1cb" strokeWidth={1.5} strokeLinejoin="round" />
              <rect x={x0 + 1} y={216} width={6} height={39} fill="#a9c7d6" />
            </g>
          );
        })}
        <rect x={230} y={255} width={650} height={PISO - 255} fill="#fbfcfd" stroke="#c9d0d8" strokeWidth={1.5} />
        {Array.from({ length: 24 }, (_, i) => (
          <line key={i} x1={256 + i * 26} x2={256 + i * 26} y1={257} y2={PISO - 2} stroke="#eef1f4" strokeWidth={1.5} />
        ))}

        <rect x={320} y={274} width={470} height={56} rx={8} className="fill-acento" />
        <text x={555} y={313} textAnchor="middle" fontSize={30} fontWeight={700} letterSpacing={3} fill="#fff">
          PLANTA LAS ACACIAS
        </text>

        {/* ventanas con luz; dos titilan, adentro se trabaja */}
        {Array.from({ length: 9 }, (_, i) => (
          <g key={i}>
            <motion.rect
              x={262 + i * 68.5}
              y={354}
              width={50}
              height={38}
              rx={2}
              fill="#f3dc9a"
              stroke="#c9d0d8"
              strokeWidth={1.5}
              animate={i === 2 || i === 6 ? { opacity: [1, 0.55, 1] } : undefined}
              transition={{ duration: i === 2 ? 2.6 : 3.4, repeat: Infinity, ease: "easeInOut" }}
            />
            <line x1={287 + i * 68.5} x2={287 + i * 68.5} y1={355} y2={391} stroke="#fbfcfd" strokeWidth={2} />
          </g>
        ))}

        <rect x={300} y={428} width={24} height={PISO - 428} fill="#c9d0d8" />
        {/* el portón de la nave: adentro pasa la línea y dos personas trabajan */}
        <Porton id="porton-nave" x={485} y={398} ancho={140} ciclo={12} abre={1.5} cierra={10.5}>
          <motion.g animate={{ x: [440, 680] }} transition={{ duration: 9, repeat: Infinity, ease: "linear" }}>
            <g transform={`translate(0 ${PISO - 6}) scale(0.5)`}>
              <Auto modelo="SUV" color="#0f5e70" fase={2} />
            </g>
          </motion.g>
          <Persona x={512} ropa="#34557f" brazo={[-15, -65, -15]} duracion={0.9} herramienta="llave" />
          <Persona x={600} ropa="#4b6584" brazo={[-72, -64, -72]} duracion={0.3} herramienta="soplete" espejo />
          <Chispas x={580} y={PISO - 26} />
        </Porton>

        {/* el despacho, de donde salen los camiones */}
        <rect x={880} y={330} width={130} height={PISO - 330} fill="#f7f8fa" stroke="#c9d0d8" strokeWidth={1.5} />
        <rect x={876} y={324} width={138} height={8} fill="#c9d0d8" />
        {/* el del despacho se abre antes de que salga el camión (los dos van cada 10 segundos) */}
        <Porton id="porton-despacho" x={905} y={384} ancho={80} ciclo={10} abre={0.4} cierra={9}>
          <rect x={913} y={PISO - 22} width={20} height={16} fill="#cdb894" stroke="#b39f7a" />
          <rect x={915} y={PISO - 36} width={16} height={14} fill="#d6c3a0" stroke="#b39f7a" />
          <Persona x={963} ropa="#e8873a" brazo={[-155, -110, -155]} duracion={0.9} herramienta="baston" />
        </Porton>
      </svg>
    </div>
  );
}

/** Un portón de persiana: en cada `ciclo` segundos sube en `abre`, baja en `cierra`, y mientras está arriba se ve lo de adentro. */
function Porton({ id, x, y, ancho, ciclo, abre, cierra, children }: {
  id: string; x: number; y: number; ancho: number; ciclo: number; abre: number; cierra: number; children: ReactNode;
}) {
  const alto = PISO - y;
  const arriba = -(alto - 7); // queda la persiana enrollada arriba
  return (
    <g>
      <defs>
        <clipPath id={id}>
          <rect x={x} y={y} width={ancho} height={alto} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id})`}>
        <rect x={x} y={y} width={ancho} height={alto} fill="#d3dae2" />
        <rect x={x + ancho / 2 - 16} y={y + 12} width={32} height={3} rx={1.5} fill="#f3dc9a" />
        <rect x={x} y={PISO - 6} width={ancho} height={6} fill="#c9d0d8" />
        {children}
        <motion.g
          animate={{ y: [0, 0, arriba, arriba, 0, 0] }}
          transition={{ duration: ciclo, times: [0, abre / ciclo, (abre + 0.9) / ciclo, cierra / ciclo, (cierra + 0.9) / ciclo, 1], repeat: Infinity, ease: "easeInOut" }}
        >
          <rect x={x} y={y} width={ancho} height={alto} fill="#e1e5ea" />
          {Array.from({ length: Math.floor(alto / 7) }, (_, i) => (
            <line key={i} x1={x + 2} x2={x + ancho - 2} y1={y + 7 + i * 7} y2={y + 7 + i * 7} stroke="#cfd5dc" strokeWidth={1} />
          ))}
        </motion.g>
      </g>
      <rect x={x} y={y} width={ancho} height={alto} fill="none" stroke="#c9d0d8" strokeWidth={1.5} />
    </g>
  );
}

/** Una persona con casco, parada en el piso del galpón. Mueve un brazo; `espejo` la da vuelta para que mire a la izquierda. */
function Persona({ x, ropa, brazo, duracion, herramienta, espejo }: {
  x: number; ropa: string; brazo: number[]; duracion: number; herramienta: "llave" | "soplete" | "baston"; espejo?: boolean;
}) {
  return (
    <g transform={`translate(${x} ${PISO - 6}) scale(${espejo ? -1 : 1} 1)`}>
      <rect x={-4.5} y={-13} width={3.6} height={13} rx={1.2} fill="#2b3a52" />
      <rect x={0.9} y={-13} width={3.6} height={13} rx={1.2} fill="#2b3a52" />
      <rect x={-6.5} y={-27} width={13} height={15} rx={3.5} fill={ropa} />
      <rect x={-8.5} y={-25.5} width={3.4} height={12} rx={1.7} fill={ropa} />
      <motion.g
        animate={{ rotate: brazo }}
        transition={{ duration: duracion, repeat: Infinity, ease: "easeInOut" }}
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
      >
        {/* invisible y centrado en el hombro: así el brazo gira desde ahí */}
        <rect x={-9.7} y={-40} width={32} height={32} fill="none" />
        <rect x={4.6} y={-25.5} width={3.4} height={12} rx={1.7} fill={ropa} />
        {herramienta === "llave" && <path d="M 6.3 -14 L 6.3 -8.5 M 4.3 -9 L 8.3 -9" stroke="#6b7280" strokeWidth={1.8} strokeLinecap="round" />}
        {herramienta === "soplete" && <rect x={5.3} y={-14} width={2} height={6} rx={1} fill="#4b5563" />}
        {herramienta === "baston" && <rect x={5.5} y={-14} width={1.8} height={6.5} rx={0.9} fill="#f0bf45" />}
      </motion.g>
      <circle cx={0} cy={-32} r={4.6} fill="#c9a88a" />
      <path d="M -5.4 -32.5 A 5.4 5.4 0 0 1 5.4 -32.5 Z" fill="#f0bf45" />
      <rect x={-6.6} y={-33.3} width={13.2} height={1.6} rx={0.8} fill="#f0bf45" />
    </g>
  );
}

/** Las chispas del soplete. */
function Chispas({ x, y }: { x: number; y: number }) {
  return (
    <g>
      {[-150, -120, -60, -30, 20, 160].map((a, k) => {
        const c = Math.cos((a * Math.PI) / 180);
        const s = Math.sin((a * Math.PI) / 180);
        return (
          <motion.circle
            key={a}
            r={1.5}
            fill={k % 2 ? "#e8873a" : "#f0bf45"}
            initial={{ cx: x, cy: y, opacity: 0 }}
            animate={{ cx: [x, x + 11 * c], cy: [y, y + 11 * s + 3], opacity: [1, 0] }}
            transition={{ duration: 0.35, repeat: Infinity, repeatDelay: 0.05, delay: (k % 3) * 0.06, ease: "easeOut" }}
          />
        );
      })}
    </g>
  );
}

function Chimenea({ x, ancho, arriba }: { x: number; ancho: number; arriba: number }) {
  return (
    <g>
      <rect x={x} y={arriba} width={ancho} height={256 - arriba} fill="#b9c1cb" />
      <rect x={x - 3} y={arriba - 6} width={ancho + 6} height={10} rx={1.5} fill="#8f99a5" />
      <rect x={x} y={arriba + 30} width={ancho} height={8} fill="#a3acb7" />
    </g>
  );
}

/** Bocanadas que salen de la chimenea, suben, se agrandan y se van con el viento. */
function Humo({ x, y, desfase = 0 }: { x: number; y: number; desfase?: number }) {
  return (
    <g>
      {Array.from({ length: 12 }, (_, k) => (
        <motion.circle
          key={k}
          fill={k % 3 === 0 ? "#c6ced6" : k % 3 === 1 ? "#d3d9e0" : "#dde2e7"}
          initial={{ cx: x, cy: y, r: 10, opacity: 0 }}
          animate={{ cx: [x, x + 30, x + 130], cy: [y, y - 60, y - 150], r: [10, 24, 42], opacity: [0.95, 0.85, 0] }}
          transition={{ duration: 4.8, times: [0, 0.35, 1], repeat: Infinity, delay: desfase + k * 0.4, ease: "linear" }}
        />
      ))}
    </g>
  );
}

/** Una acacia: tronco con dos ramas y la copa ancha y chata. */
function Acacia({ x, escala = 1 }: { x: number; escala?: number }) {
  return (
    <g transform={`translate(${x} ${PISO}) scale(${escala})`}>
      <motion.g
        animate={{ rotate: [-0.8, 0.8] }}
        transition={{ duration: 4, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" }}
        style={{ transformBox: "fill-box", transformOrigin: "center bottom" }}
      >
        <path d="M 0 0 L 0 -62 M 0 -46 L -18 -80 M 0 -56 L 16 -86" stroke="#7d6b58" strokeWidth={5} strokeLinecap="round" fill="none" />
        <ellipse cx={-26} cy={-86} rx={36} ry={13} fill="#6f8c69" />
        <ellipse cx={22} cy={-92} rx={40} ry={14} fill="#62805d" />
        <ellipse cx={-2} cy={-102} rx={34} ry={13} fill="#6f8c69" />
      </motion.g>
    </g>
  );
}

function Nube({ x, y, escala = 1 }: { x: number; y: number; escala?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${escala})`}>
      <motion.g animate={{ x: [0, 36] }} transition={{ duration: 14, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" }}>
        <ellipse cx={0} cy={0} rx={34} ry={18} fill="#fff" />
        <ellipse cx={34} cy={-10} rx={34} ry={24} fill="#fff" />
        <ellipse cx={70} cy={2} rx={30} ry={16} fill="#fff" />
        <rect x={-10} y={0} width={90} height={16} rx={8} fill="#fff" />
      </motion.g>
    </g>
  );
}
