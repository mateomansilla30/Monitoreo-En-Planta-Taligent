import { AnimatePresence, motion, useAnimationFrame, useMotionValue, useReducedMotion, useTransform, type MotionValue } from "motion/react";
import { ClipboardCheck, Hammer, SprayCan, Wrench, type LucideIcon } from "lucide-react";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** Las cuatro estaciones de fabricación, en orden (docs/M1.md). También las usa la escena de la causa. */
export const ESTACIONES: { nombre: string; icono: LucideIcon }[] = [
  { nombre: "Carrocería", icono: Hammer },
  { nombre: "Pintura", icono: SprayCan },
  { nombre: "Montaje", icono: Wrench },
  { nombre: "Calidad", icono: ClipboardCheck },
];

export type Modelo = "Sedán" | "SUV" | "Pickup";

// cada vuelta pasa un auto distinto; las horas de montaje salen de Data/planta/tiempos_estandar.csv
const VUELTAS: { modelo: Modelo; destino: string; montaje: number; color: string; barco: boolean }[] = [
  { modelo: "Pickup", destino: "para Brasil", montaje: 9, color: "#2f5d46", barco: false },
  { modelo: "SUV", destino: "para Europa", montaje: 11, color: "#0f5e70", barco: true },
  { modelo: "Sedán", destino: "para el mercado local", montaje: 10, color: "#7a2e3a", barco: false },
];

// el dibujo mide 1400 de ancho; el auto se dibuja de 140 de largo y se achica
const PISO = 236;
const ESCALA = 0.8;
const GALPONES = [195, 455, 715, 975]; // el centro de cada galpón (de 130 de ancho)
const SALIDAS = [325, 585, 845, 1110]; // dónde queda el auto al salir de cada uno; el último es el patio
const PATIO = 1110;
const EMBARQUE = 1290;
const LEJOS = 340; // cuánto se corre el camión o el buque para llegar o irse
const ADENTRO = 1.3; // segundos adentro de cada galpón

/** El recorrido de una vuelta: en qué segundo el auto está en qué x, y cuándo entra a cada galpón. */
function armar(barco: boolean) {
  const puntos: [number, number][] = [[0, -80]];
  const ahora = () => puntos[puntos.length - 1][0];
  const ir = (x: number, segundos: number) => puntos.push([ahora() + segundos, x]);
  const quieto = (segundos: number) => ir(puntos[puntos.length - 1][1], segundos);
  ir(66, 1.0);
  quieto(0.4);
  const adentro = GALPONES.map((g, i) => {
    ir(g, 0.7);
    const desde = ahora();
    quieto(ADENTRO);
    ir(SALIDAS[i], i < 3 ? 0.7 : 1.0);
    quieto(i < 3 ? 0.65 : 1.0);
    return desde;
  });
  const destino = barco ? 1262 : 1240; // adentro del buque, o arriba del camión
  ir(destino, 1.2);
  quieto(0.3);
  const sale = ahora();
  ir(destino + LEJOS, 1.4);
  quieto(0.4);
  return { puntos, adentro, destino, sale, total: ahora() };
}
const RECORRIDO = { camion: armar(false), barco: armar(true) };
const TOTAL = RECORRIDO.camion.total; // las dos vueltas duran lo mismo
// con las animaciones desactivadas se ve este momento: el Pickup recién salido de montaje
const QUIETO = RECORRIDO.camion.adentro[2] + ADENTRO + 1.0;

const entre = (p: number) => Math.min(1, Math.max(0, p));
const suave = (p: number) => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);

function posicion(puntos: [number, number][], t: number) {
  for (let k = 1; k < puntos.length; k++) {
    const [t1, x1] = puntos[k];
    if (t <= t1) {
      const [t0, x0] = puntos[k - 1];
      return x0 + (x1 - x0) * suave((t - t0) / (t1 - t0));
    }
  }
  return puntos[puntos.length - 1][1];
}

/** Todo lo que se ve en el segundo `seg` desde que arrancó la escena. */
function momento(seg: number) {
  const n = Math.floor(seg / TOTAL);
  const vuelta = VUELTAS[n % VUELTAS.length];
  const r = vuelta.barco ? RECORRIDO.barco : RECORRIDO.camion;
  const t = seg - n * TOTAL;
  const x = posicion(r.puntos, t);
  // la rampa del camión o del buque: el auto sube y se inclina un poco
  const rampa = entre((x - 1136) / 74);
  const trabajando = r.adentro.findIndex((d) => t >= d && t < d + ADENTRO);
  const enGalpon = GALPONES.findIndex((g) => Math.abs(x - g) < 121);
  return {
    n,
    x,
    y: -(vuelta.barco ? 6 : 16) * suave(rampa),
    inclinacion: -(vuelta.barco ? 3 : 7) * Math.sin(Math.PI * rampa),
    // las ruedas giran solo mientras el auto anda solo, no cuando lo lleva el camión
    giro: (Math.min(x, r.destino) / ESCALA / 12) * (180 / Math.PI),
    // el transporte llega al empezar la vuelta y se va con el auto al final
    transporte: t >= r.sale ? x - r.destino : LEJOS * (1 - entre((t - 0.3) / 1.7)) ** 3,
    fase: r.adentro.filter((d) => t >= d).length, // 0 piezas, 1 chapa, 2 pintado, 3 armado, 4 revisado
    trabajando,
    progreso: trabajando < 0 ? 0 : (t - r.adentro[trabajando]) / ADENTRO,
    activo: x > 1170 ? 5 : enGalpon >= 0 ? enGalpon : Math.abs(x - PATIO) < 70 ? 4 : -1,
  };
}

const discreto = ({ n, fase, trabajando, activo }: ReturnType<typeof momento>) => ({ n, fase, trabajando, activo });

/** La línea de la planta: un auto entra a cada galpón y sale cambiado, espera en el patio y se va en camión o buque. */
export function LineaDeMontaje() {
  const quieto = useReducedMotion();
  const reloj = useMotionValue(quieto ? QUIETO : 0);
  const [d, setD] = useState(() => discreto(momento(reloj.get())));
  const clave = useRef("");
  useAnimationFrame((ms) => {
    if (quieto) return;
    reloj.set(ms / 1000);
    const m = discreto(momento(ms / 1000));
    const k = `${m.n} ${m.fase} ${m.trabajando} ${m.activo}`;
    if (k !== clave.current) {
      clave.current = k;
      setD(m);
    }
  });
  const x = useTransform(reloj, (s) => momento(s).x);
  const y = useTransform(reloj, (s) => momento(s).y);
  const inclinacion = useTransform(reloj, (s) => momento(s).inclinacion);
  const giro = useTransform(reloj, (s) => momento(s).giro);
  const transporte = useTransform(reloj, (s) => momento(s).transporte);
  const giroCamion = useTransform(transporte, (v) => (v / 8) * (180 / Math.PI));
  const progreso = useTransform(reloj, (s) => momento(s).progreso);

  const vuelta = VUELTAS[d.n % VUELTAS.length];
  const subtitulos = ["6 h", "8 h", `${vuelta.montaje} h`, "3 h", "terminado", vuelta.barco ? "buque" : "camión"];
  const rotulos = [...ESTACIONES.map((e, i) => ({ nombre: e.nombre, x: GALPONES[i] })), { nombre: "Patio", x: PATIO }, { nombre: "Embarque", x: EMBARQUE }];

  return (
    <div>
      <div className="h-7">
        <AnimatePresence mode="wait">
          <motion.p key={d.n} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }} className="flex items-center gap-2 text-lg text-tinta-2">
            <span className="size-3 rounded-full" style={{ background: vuelta.color }} aria-hidden />
            <b className="font-semibold text-tinta">{vuelta.modelo}</b> {vuelta.destino}
          </motion.p>
        </AnimatePresence>
      </div>
      <svg
        viewBox="0 44 1400 214"
        className="mt-2 w-full"
        role="img"
        aria-label="Un auto pasa por carrocería, pintura, montaje y calidad, espera en el patio y se va en camión o buque."
      >
        {/* el piso; cuando viene el buque, el agua tapa la calle de la derecha */}
        <rect x={0} y={PISO} width={1400} height={16} className="fill-suave" />
        <line x1={0} x2={1400} y1={PISO} y2={PISO} className="stroke-linea-fuerte" strokeWidth={2} />

        <Patio />
        <AnimatePresence initial={false}>
          {!vuelta.barco && <Camion key={`camion-${d.n}`} x={transporte} giro={giroCamion} />}
          {vuelta.barco && (
            <motion.path key={`rampa-${d.n}`} style={{ x: transporte }} d={`M 1158 ${PISO} L 1194 ${PISO - 6}`} stroke="#6b7280" strokeWidth={4} strokeLinecap="round" />
          )}
        </AnimatePresence>

        {/* el auto: va detrás de los galpones, así desaparece cuando entra */}
        <g transform={`translate(0 ${PISO})`}>
          <motion.g style={{ x, y }}>
            <motion.g style={{ rotate: inclinacion, transformBox: "fill-box", transformOrigin: "center bottom" }}>
              <g transform={`scale(${ESCALA})`}>
                <Auto modelo={vuelta.modelo} color={vuelta.color} fase={d.fase} giro={giro} />
              </g>
            </motion.g>
          </motion.g>
        </g>

        {ESTACIONES.map((e, i) => (
          <Galpon key={e.nombre} cx={GALPONES[i]} icono={e.icono} etapa={i} activo={d.activo === i} trabajando={d.trabajando === i} progreso={progreso} color={vuelta.color} />
        ))}

        <AnimatePresence>{vuelta.barco && <Buque key={`buque-${d.n}`} x={transporte} />}</AnimatePresence>

        {rotulos.map((r, i) => (
          <g key={r.nombre}>
            <text x={r.x} y={78} textAnchor="middle" fontSize={24} fontWeight={600} className={cn("transition-colors duration-300", d.activo === i ? "fill-acento" : "fill-tinta")}>
              {r.nombre}
            </text>
            <text x={r.x} y={102} textAnchor="middle" fontSize={20} className="fill-tinta-3">
              {subtitulos[i]}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

/** Un galpón con techo parabólico. Adentro pasa lo de su estación mientras el auto está ahí. */
function Galpon({ cx, icono: I, etapa, activo, trabajando, progreso, color }: {
  cx: number; icono: LucideIcon; etapa: number; activo: boolean; trabajando: boolean; progreso: MotionValue<number>; color: string;
}) {
  const izq = cx - 65;
  const ancho = useTransform(progreso, (p) => entre(p) * 72);
  // cómo se mueve el ícono mientras trabaja: martillo que golpea, aerosol que tiembla, llave que ajusta, planilla que late
  const movimiento = [
    { animate: { rotate: [0, -32, 0] }, transition: { duration: 0.5, times: [0, 0.65, 1], repeat: Infinity } },
    { animate: { x: [0, -1.5, 1.5, 0] }, transition: { duration: 0.3, repeat: Infinity } },
    { animate: { rotate: [0, 50, 0] }, transition: { duration: 0.65, repeat: Infinity } },
    { animate: { scale: [1, 1.14, 1] }, transition: { duration: 0.65, repeat: Infinity } },
  ][etapa];
  return (
    <g>
      <path d={`M ${cx - 71} 142 Q ${cx} 100 ${cx + 71} 142 Z`} className={cn("transition-colors duration-300", activo ? "fill-acento" : "fill-linea-fuerte")} />
      <rect x={izq} y={140} width={130} height={PISO - 140} className={cn("fill-tarjeta transition-colors duration-300", activo ? "stroke-acento" : "stroke-linea-fuerte")} strokeWidth={1.5} />
      {/* los portones, por donde entra y sale el auto */}
      <rect x={izq + 1} y={192} width={12} height={PISO - 192} className="fill-linea" />
      <rect x={izq + 117} y={192} width={12} height={PISO - 192} className="fill-linea" />

      <circle cx={cx} cy={172} r={22} className={cn("transition-colors duration-300", activo ? "fill-acento" : "fill-suave")} />
      <motion.g
        key={trabajando ? "trabaja" : "quieto"}
        animate={trabajando ? movimiento.animate : undefined}
        transition={movimiento.transition}
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
      >
        <I x={cx - 12} y={160} width={24} height={24} strokeWidth={2} className={cn("transition-colors duration-300", activo ? "text-white" : "text-tinta-3")} />
      </motion.g>
      <AnimatePresence>
        {trabajando && etapa === 0 && <Chispas key="chispas" cx={cx} />}
        {trabajando && etapa === 1 && <Niebla key="niebla" cx={cx} color={color} />}
      </AnimatePresence>

      {/* cuánto lleva adentro; en calidad son tres controles que se van aprobando */}
      {etapa < 3 ? (
        <>
          <rect x={cx - 36} y={206} width={72} height={5} rx={2.5} className="fill-linea" />
          {trabajando && <motion.rect x={cx - 36} y={206} height={5} rx={2.5} width={ancho} className="fill-acento" />}
        </>
      ) : (
        [0, 1, 2].map((k) => <Control key={k} cx={cx - 18 + k * 18} umbral={(k + 1) / 3.4} progreso={progreso} trabajando={trabajando} />)
      )}
    </g>
  );
}

function Control({ cx, umbral, progreso, trabajando }: { cx: number; umbral: number; progreso: MotionValue<number>; trabajando: boolean }) {
  const hecho = useTransform(progreso, (p) => (p >= umbral ? 1 : 0));
  return (
    <g>
      <circle cx={cx} cy={208} r={6} className="fill-linea" />
      {trabajando && (
        <motion.g style={{ opacity: hecho }}>
          <circle cx={cx} cy={208} r={6} fill="#15803d" />
          <path d={`M ${cx - 3} 208 L ${cx - 0.8} 210.4 L ${cx + 3.2} 205.8`} stroke="#fff" strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </motion.g>
      )}
    </g>
  );
}

/** Chispas de soldadura alrededor del martillo. */
function Chispas({ cx }: { cx: number }) {
  return (
    <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      {[-175, -155, -135, -115, -65, -45, -25, -5].map((a, k) => {
        const c = Math.cos((a * Math.PI) / 180);
        const s = Math.sin((a * Math.PI) / 180);
        const largo = k % 2 ? 46 : 52;
        return (
          <motion.circle
            key={a}
            r={2.6}
            fill={k % 2 ? "#e8873a" : "#f0bf45"}
            initial={{ cx: cx + 24 * c, cy: 172 + 24 * s, opacity: 0 }}
            animate={{ cx: [cx + 24 * c, cx + largo * c], cy: [172 + 24 * s, 172 + largo * s + 6], opacity: [1, 1, 0] }}
            transition={{ duration: 0.42, repeat: Infinity, repeatDelay: 0.08, delay: 0.3 + (k % 3) * 0.04, ease: "easeOut" }}
          />
        );
      })}
    </motion.g>
  );
}

/** La niebla de pintura, del color del auto, a los dos lados del aerosol. */
function Niebla({ cx, color }: { cx: number; color: string }) {
  return (
    <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      {[0, 1, 2, 3, 4, 5, 6, 7].map((k) => {
        const lado = k % 2 ? -1 : 1;
        const x0 = cx + lado * 22;
        return (
          <motion.circle
            key={k}
            fill={color}
            initial={{ cx: x0, cy: 168, r: 2, opacity: 0 }}
            animate={{ cx: [x0, x0 + lado * (24 + (k % 4) * 4)], cy: [168, 154 + (k % 4) * 8], r: [2, 7.5], opacity: [0.75, 0] }}
            transition={{ duration: 0.85, repeat: Infinity, delay: k * 0.1, ease: "easeOut" }}
          />
        );
      })}
    </motion.g>
  );
}

function Patio() {
  return (
    <g>
      <rect x={1057} y={PISO - 98} width={3} height={98} fill="#9aa5b1" />
      <rect x={1045} y={PISO - 120} width={26} height={26} rx={5} className="fill-acento" />
      <text x={1058} y={PISO - 100} textAnchor="middle" fontSize={18} fontWeight={700} fill="#fff">P</text>
    </g>
  );
}

/** Un camión de autos con un auto ya cargado arriba. El auto de la vuelta sube por la rampa de atrás.
 * Se dibuja con el piso en y = 236 y la rampa en x = 1160; la fábrica lo reusa corriéndolo y cargándolo abajo también. */
export function Camion({ x, giro, arriba = "#cfd5dc", abajo }: { x: MotionValue<number>; giro?: MotionValue<number>; arriba?: string; abajo?: { modelo: Modelo; color: string } }) {
  return (
    <motion.g style={{ x }}>
      <path d={`M 1160 ${PISO} L 1180 ${PISO - 16}`} stroke="#6b7280" strokeWidth={3} strokeLinecap="round" />
      <rect x={1180} y={PISO - 72} width={3} height={56} fill="#9aa5b1" />
      <rect x={1315} y={PISO - 72} width={3} height={56} fill="#9aa5b1" />
      <rect x={1178} y={PISO - 74} width={142} height={5} rx={1.5} fill="#6b7280" />
      <g transform={`translate(1249 ${PISO - 74}) scale(${ESCALA})`}>
        <Auto modelo="SUV" color={arriba} fase={3} />
      </g>
      {abajo && (
        <g transform={`translate(1240 ${PISO - 16}) scale(${ESCALA})`}>
          <Auto modelo={abajo.modelo} color={abajo.color} fase={3} />
        </g>
      )}
      <rect x={1178} y={PISO - 16} width={142} height={6} rx={1.5} fill="#4b5563" />
      <rect x={1316} y={PISO - 14} width={70} height={6} fill="#4b5563" />
      <path
        d={`M 1322 ${PISO - 10} L 1322 ${PISO - 64} Q 1322 ${PISO - 68} 1326 ${PISO - 68} L 1360 ${PISO - 68} Q 1366 ${PISO - 68} 1369 ${PISO - 62} L 1384 ${PISO - 36} Q 1386 ${PISO - 32} 1386 ${PISO - 26} L 1386 ${PISO - 10} Z`}
        fill="#f4f6f8"
        stroke="#9aa5b1"
        strokeWidth={1.5}
      />
      <path d={`M 1350 ${PISO - 62} L 1364 ${PISO - 62} L 1377 ${PISO - 40} L 1350 ${PISO - 40} Z`} fill="#d6e4ec" stroke="#9aa5b1" />
      {[1198, 1216, 1298, 1368].map((cx) => <Rueda key={cx} cx={cx} cy={PISO - 8} r={8} giro={giro} />)}
    </motion.g>
  );
}

/** Un buque de autos amarrado. El auto entra por la puerta de atrás y el casco lo tapa. */
function Buque({ x }: { x: MotionValue<number> }) {
  return (
    <>
      <motion.g style={{ x }} initial={false}>
        <rect x={1360} y={PISO - 140} width={36} height={24} fill="#f1f3f6" stroke="#c9d0d8" strokeWidth={1.5} />
        <rect x={1366} y={PISO - 134} width={24} height={6} fill="#d6e4ec" />
        <rect x={1184} y={PISO - 118} width={320} height={5} fill="#c9d0d8" />
        <rect x={1184} y={PISO - 114} width={320} height={82} fill="#f1f3f6" stroke="#c9d0d8" strokeWidth={1.5} />
        {[0, 1, 2, 3, 4, 5, 6, 7].map((k) => <rect key={k} x={1214 + k * 24} y={PISO - 104} width={10} height={6} rx={1} fill="#c9d0d8" />)}
        <path d={`M 1184 ${PISO - 34} L 1504 ${PISO - 34} L 1504 ${PISO + 12} L 1194 ${PISO + 12} Z`} fill="#3d4a5c" />
        <rect x={1186} y={PISO - 52} width={12} height={46} fill="#4b5563" opacity={0.55} />
      </motion.g>
      <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
        <rect x={1177} y={PISO - 1} width={223} height={17} fill="#dbe6ec" />
        <line x1={1176} x2={1176} y1={PISO} y2={PISO + 16} className="stroke-linea-fuerte" strokeWidth={2} />
        {[1214, 1268, 1330].map((x0) => <line key={x0} x1={x0} x2={x0 + 16} y1={PISO + 9} y2={PISO + 9} stroke="#c4d4de" strokeWidth={1.5} strokeLinecap="round" />)}
      </motion.g>
    </>
  );
}

// las siluetas, de costado y mirando a la derecha; el piso está en y = 0
const FORMAS: Record<Modelo, { cuerpo: string; vidrios: string[]; ruedas: [number, number]; puertas: [number, number][]; delantera: [number, number]; trasera: [number, number]; caja?: string }> = {
  Sedán: {
    cuerpo: "M -66 -9 L -66 -22 Q -66 -27 -60 -28 L -42 -30 L -26 -43 Q -22 -46 -17 -46 L 14 -46 Q 18 -46 21 -43 L 36 -31 L 60 -28 Q 67 -27 67 -20 L 67 -9 Z",
    vidrios: ["M -38 -31 L -25 -42 Q -22 -44 -18 -44 L -2 -44 L -2 -31 Z", "M 2 -31 L 2 -44 L 13 -44 Q 17 -44 19 -42 L 32 -31 Z"],
    ruedas: [-40, 42],
    puertas: [[0, -31], [-36, -30]],
    delantera: [61, -24],
    trasera: [-66, -21],
  },
  SUV: {
    cuerpo: "M -66 -9 L -66 -38 Q -66 -51 -55 -52 L 18 -52 Q 23 -52 26 -49 L 40 -36 L 61 -33 Q 67 -32 67 -25 L 67 -9 Z",
    vidrios: ["M -61 -37 L -60 -46 Q -59 -49 -55 -49 L -31 -49 L -31 -37 Z", "M -27 -37 L -27 -49 L -2 -49 L -2 -37 Z", "M 2 -37 L 2 -49 L 17 -49 Q 21 -49 23 -46 L 33 -37 Z"],
    ruedas: [-40, 42],
    puertas: [[0, -37], [-29, -37]],
    delantera: [61, -30],
    trasera: [-66, -35],
  },
  Pickup: {
    cuerpo: "M -66 -9 L -66 -33 L -14 -33 L -14 -50 Q -14 -53 -10 -53 L 16 -53 Q 21 -53 24 -49 L 38 -36 L 61 -33 Q 67 -32 67 -25 L 67 -9 Z",
    vidrios: ["M -10 -37 L -10 -49 Q -10 -50 -8 -50 L 14 -50 Q 18 -50 20 -47 L 31 -37 Z"],
    ruedas: [-42, 42],
    puertas: [[-12, -36], [34, -36]],
    delantera: [61, -30],
    trasera: [-66, -31],
    caja: "M -63 -30 L -17 -30",
  },
};

/** El auto según cuánto avanzó: 0 piezas, 1 chapa gris, 2 pintado, 3 armado, 4 con el control de calidad aprobado. */
export function Auto({ modelo, color, fase, giro }: { modelo: Modelo; color: string; fase: number; giro?: MotionValue<number> }) {
  const f = FORMAS[modelo];
  const arco = (cx: number) => `M ${cx - 14.2} -9 A 14.5 14.5 0 1 1 ${cx + 14.2} -9 Z`;
  if (fase === 0) {
    // las piezas: el piso sobre el carro de la línea y la forma que va a tener, punteada
    return (
      <g>
        <path d={f.cuerpo} fill="none" stroke="#7b8592" strokeWidth={2} strokeDasharray="6 4" />
        <rect x={-58} y={-14} width={116} height={5} rx={2} fill="#8f99a5" />
        <Carro />
      </g>
    );
  }
  const pintado = fase >= 2;
  const armado = fase >= 3;
  return (
    <g>
      <path d={f.cuerpo} fill={pintado ? color : "#bcc4cd"} stroke={pintado ? "rgba(0,0,0,0.28)" : "#8f99a5"} strokeWidth={1.4} />
      {f.caja && <path d={f.caja} stroke="rgba(0,0,0,0.25)" strokeWidth={1.4} />}
      {f.vidrios.map((v) => (
        <path key={v} d={v} fill={armado ? "#d6e4ec" : pintado ? "rgba(17,24,39,0.45)" : "#8f99a5"} stroke={armado ? "rgba(0,0,0,0.18)" : "none"} />
      ))}
      {armado && (
        <>
          {f.puertas.map(([px, py]) => <line key={px} x1={px} x2={px} y1={py} y2={-11} stroke="rgba(0,0,0,0.22)" strokeWidth={1.2} />)}
          <rect x={f.puertas[0][0] + 5} y={f.puertas[0][1] + 4} width={7} height={2} rx={1} fill="rgba(0,0,0,0.3)" />
          <rect x={-66} y={-14} width={133} height={5} fill="rgba(0,0,0,0.16)" />
          <rect x={f.delantera[0]} y={f.delantera[1]} width={6} height={4} rx={1} fill="#f3d27a" />
          <rect x={f.trasera[0]} y={f.trasera[1]} width={3} height={5} rx={1} fill="#c2413b" />
        </>
      )}
      {f.ruedas.map((cx) => <path key={cx} d={arco(cx)} fill={armado ? "#2b3340" : "rgba(17,24,39,0.3)"} />)}
      {armado ? f.ruedas.map((cx) => <Rueda key={cx} cx={cx} cy={-12} r={12} giro={giro} />) : <Carro />}
      {fase >= 4 && (
        <g>
          <circle cx={0} cy={-66} r={8.5} fill="#15803d" />
          <path d="M -3.8 -66 L -1 -63.2 L 4 -68.8" stroke="#fff" strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}
    </g>
  );
}

/** El carro de la línea que lleva al auto mientras todavía no tiene ruedas. */
function Carro() {
  return (
    <g>
      <rect x={-54} y={-9} width={108} height={4} rx={1.5} fill="#6b7280" />
      <circle cx={-44} cy={-2.5} r={2.5} fill="#4b5563" />
      <circle cx={44} cy={-2.5} r={2.5} fill="#4b5563" />
    </g>
  );
}

function Rueda({ cx, cy, r, giro }: { cx: number; cy: number; r: number; giro?: MotionValue<number> }) {
  return (
    <motion.g style={{ rotate: giro ?? 0, transformBox: "fill-box", transformOrigin: "center" }}>
      <circle cx={cx} cy={cy} r={r} fill="#1f2937" />
      <circle cx={cx} cy={cy} r={r * 0.55} fill="#c9d0d8" />
      {[0, 72, 144, 216, 288].map((a) => (
        <line key={a} x1={cx} y1={cy} x2={cx + r * 0.5 * Math.cos((a * Math.PI) / 180)} y2={cy + r * 0.5 * Math.sin((a * Math.PI) / 180)} stroke="#6b7280" strokeWidth={1.4} />
      ))}
    </motion.g>
  );
}
