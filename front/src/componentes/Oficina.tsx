import { AnimatePresence, motion, useAnimationFrame, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useRef, useState } from "react";

// el reloj de la escena: un día de la planta dura DIA segundos; los 10 días, y una pausa antes de volver a empezar
const DIA = 6;
const CICLO = 10 * DIA + 3;
const DIAS = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
// con las animaciones desactivadas queda en S034: sábado 22:00
const QUIETO = (136 / 24) * DIA;

/** Qué se ve en el segundo `seg`: la hora, el día, cuántas fotos llegaron y si es de noche. Arranca el lunes a las 06:00. */
function momento(seg: number) {
  const t = seg % CICLO;
  const horas = (Math.min(t, 10 * DIA) / DIA) * 24; // horas desde el lunes a las 06:00
  const hora = (6 + horas) % 24;
  return {
    hora,
    dia: DIAS[Math.floor((6 + horas) / 24) % 7],
    fotos: Math.min(60, Math.floor(horas / 4)), // la primera foto es el lunes a las 10:00
    noche: hora >= 20 || hora < 6,
  };
}

const reloj = (h: number) => `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.floor((h % 1) * 60)).padStart(2, "0")}`;

/** La oficina de control de producción: una persona frente al monitor, el reloj que da vueltas y las fotos que se apilan. */
export function Oficina() {
  const quieto = useReducedMotion();
  const tiempo = useMotionValue(quieto ? QUIETO : 0);
  const [d, setD] = useState(() => discreto(momento(tiempo.get())));
  const clave = useRef("");
  useAnimationFrame((ms) => {
    if (quieto) return;
    tiempo.set(ms / 1000);
    const m = discreto(momento(ms / 1000));
    const k = `${m.fotos} ${m.noche} ${m.texto}`;
    if (k !== clave.current) {
      clave.current = k;
      setD(m);
    }
  });
  // la punta de cada aguja, calculada: así giran siempre alrededor del centro del reloj
  const aguja = (largo: number, vuelta: (h: number) => number) => ({
    x: useTransform(tiempo, (s) => 588 + largo * Math.sin(vuelta(momento(s).hora) * 2 * Math.PI)),
    y: useTransform(tiempo, (s) => 78 - largo * Math.cos(vuelta(momento(s).hora) * 2 * Math.PI)),
  });
  const horaria = aguja(22, (h) => (h % 12) / 12);
  const minutero = aguja(30, (h) => h % 1);

  return (
    <div className="overflow-hidden rounded-2xl border border-linea">
      <svg viewBox="0 0 640 380" className="block w-full" role="img" aria-label="Una persona en la oficina de control de producción revisa cada foto que llega, de día y de noche, y las hojas se apilan.">
        {/* la pared y el piso */}
        <rect width={640} height={300} fill="#eef2f5" />
        <rect y={300} width={640} height={80} fill="#e3e7ec" />
        <line x1={0} x2={640} y1={300} y2={300} stroke="#c9d0d8" strokeWidth={2} />

        {/* la ventana: se ve la fábrica, de día o de noche */}
        <rect x={36} y={40} width={200} height={140} rx={4} fill="#fbfcfd" stroke="#c9d0d8" strokeWidth={4} />
        <motion.rect x={42} y={46} width={188} height={128} animate={{ fill: d.noche ? "#2f3e52" : "#dbe8f0" }} transition={{ duration: 0.6 }} />
        <AnimatePresence>
          {d.noche && (
            <motion.g key="noche" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }}>
              <circle cx={196} cy={74} r={11} fill="#e9edf1" />
              <circle cx={201} cy={70} r={9} fill="#2f3e52" />
              {[[70, 66], [110, 58], [150, 80], [88, 92]].map(([x, y]) => <circle key={x} cx={x} cy={y} r={1.6} fill="#e9edf1" />)}
            </motion.g>
          )}
        </AnimatePresence>
        <motion.path d="M 66 174 L 66 140 L 84 128 L 84 140 L 102 128 L 102 140 L 120 128 L 120 140 L 138 128 L 138 140 L 200 140 L 200 174 Z" animate={{ fill: d.noche ? "#44546a" : "#c3cbd4" }} transition={{ duration: 0.6 }} />
        <motion.rect x={84} y={104} width={9} height={30} animate={{ fill: d.noche ? "#44546a" : "#b4bdc8" }} transition={{ duration: 0.6 }} />
        {[150, 166, 182].map((x) => (
          <motion.rect key={x} x={x} y={150} width={9} height={7} animate={{ fill: d.noche ? "#f3dc9a" : "#e9eef2" }} transition={{ duration: 0.6 }} />
        ))}
        <line x1={136} x2={136} y1={46} y2={174} stroke="#fbfcfd" strokeWidth={3} />
        <line x1={42} x2={230} y1={110} y2={110} stroke="#fbfcfd" strokeWidth={3} />

        {/* el reloj de pared y la hora */}
        <circle cx={588} cy={78} r={40} fill="#fbfcfd" stroke="#9aa5b1" strokeWidth={3} />
        {Array.from({ length: 12 }, (_, k) => {
          const a = (k * 30 * Math.PI) / 180;
          return <line key={k} x1={588 + 32 * Math.sin(a)} y1={78 - 32 * Math.cos(a)} x2={588 + 36 * Math.sin(a)} y2={78 - 36 * Math.cos(a)} stroke="#9aa5b1" strokeWidth={k % 3 ? 1.5 : 3} />;
        })}
        <motion.line x1={588} y1={78} x2={horaria.x} y2={horaria.y} stroke="#374151" strokeWidth={4} strokeLinecap="round" />
        <motion.line x1={588} y1={78} x2={minutero.x} y2={minutero.y} stroke="#374151" strokeWidth={2.5} strokeLinecap="round" />
        <circle cx={588} cy={78} r={3.5} fill="#374151" />
        <text x={588} y={142} textAnchor="middle" fontSize={17} fontFamily="ui-monospace, monospace" fill="#4b5563">{d.texto}</text>

        {/* la lámpara: se prende de noche */}
        <AnimatePresence>
          {d.noche && <motion.path key="luz" d="M 226 196 L 196 268 L 300 268 L 246 196 Z" fill="#f3dc9a" initial={{ opacity: 0 }} animate={{ opacity: 0.35 }} exit={{ opacity: 0 }} />}
        </AnimatePresence>
        <path d="M 214 268 L 214 262 L 236 262 L 236 268 Z M 224 262 L 224 214 L 238 198" fill="#6b7280" stroke="#6b7280" strokeWidth={3} strokeLinejoin="round" />
        <path d="M 224 196 L 250 196 L 244 186 L 230 186 Z" fill="#6b7280" />

        {/* la silla y la persona, sentada de costado mirando el monitor; van antes que el escritorio, que le tapa la cintura */}
        <rect x={504} y={232} width={8} height={80} rx={3} fill="#6b7280" />
        <rect x={458} y={304} width={56} height={8} rx={3} fill="#6b7280" />
        <rect x={483} y={312} width={6} height={38} fill="#4b5563" />
        <rect x={462} y={350} width={48} height={5} rx={2} fill="#4b5563" />
        {[466, 486, 506].map((x) => <circle key={x} cx={x} cy={360} r={4} fill="#374151" />)}
        {/* las piernas: la de atrás más oscura */}
        <path d="M 476 300 L 440 302 L 438 354" stroke="#24324a" strokeWidth={12} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <ellipse cx={432} cy={358} rx={10} ry={4.5} fill="#1f2937" />
        <path d="M 484 300 L 448 302 L 446 354" stroke="#2b3a52" strokeWidth={12} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <ellipse cx={440} cy={358} rx={10} ry={4.5} fill="#374151" />
        <rect x={466} y={226} width={36} height={80} rx={11} fill="#34557f" />
        <motion.path
          d="M 472 240 L 452 257 L 434 263"
          stroke="#34557f"
          strokeWidth={9}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          animate={{ d: ["M 472 240 L 452 257 L 434 263", "M 472 240 L 452 256 L 436 261", "M 472 240 L 452 257 L 434 263"] }}
          transition={{ duration: 0.45, repeat: Infinity }}
        />
        <circle cx={484} cy={208} r={14} fill="#c9a88a" />
        <path d="M 470 206 Q 471 192 486 192 Q 499 193 498 208 L 494 202 Q 485 198 474 204 Z" fill="#4b5563" />

        {/* el escritorio */}
        <rect x={190} y={268} width={420} height={12} rx={2} fill="#c8b79e" />
        <rect x={206} y={280} width={10} height={100} fill="#ad9b80" />
        <rect x={584} y={280} width={10} height={100} fill="#ad9b80" />

        {/* el monitor con la última foto que llegó */}
        <rect x={262} y={168} width={150} height={92} rx={5} fill="#34404f" />
        <rect x={268} y={174} width={138} height={76} rx={2} fill="#e9eef2" />
        <text x={276} y={189} fontSize={11} fontFamily="ui-monospace, monospace" fill="#4b5563">{d.fotos ? `S${String(d.fotos).padStart(3, "0")}` : "—"}</text>
        <motion.g key={d.fotos} initial={{ opacity: 0.2 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
          {[5, 7, 9, 3, 12].map((alto, c) =>
            Array.from({ length: alto }, (_, k) => (
              <rect key={`${c}-${k}`} x={278 + c * 24 + (k % 3) * 5} y={242 - Math.floor(k / 3) * 5} width={3.5} height={3.5} rx={0.5} fill={(c + k + d.fotos) % 7 === 0 ? "#0f5e70" : "#aeb8c3"} />
            )),
          )}
        </motion.g>
        <rect x={331} y={260} width={12} height={8} fill="#34404f" />
        <rect x={418} y={262} width={44} height={6} rx={1.5} fill="#9aa5b1" />

        {/* las fotos revisadas, apiladas en el escritorio */}
        {Array.from({ length: d.fotos }, (_, k) => (
          <motion.rect
            key={k}
            x={530 + ((k * 7) % 5) - 2}
            y={264 - k * 1.8}
            width={56}
            height={3}
            rx={0.5}
            fill={k % 2 ? "#f7f8fa" : "#ffffff"}
            stroke="#c9d0d8"
            strokeWidth={0.8}
            initial={k === d.fotos - 1 ? { y: -40, opacity: 0 } : false}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
          />
        ))}
        <text x={588} y={162} textAnchor="middle" fontSize={13} fill="#6b7280">{d.fotos ? `${d.fotos} de 60 fotos` : ""}</text>
      </svg>
    </div>
  );
}

function discreto(m: ReturnType<typeof momento>) {
  return { fotos: m.fotos, noche: m.noche, texto: `${m.dia} ${reloj(m.hora).slice(0, 2)}:00` };
}
