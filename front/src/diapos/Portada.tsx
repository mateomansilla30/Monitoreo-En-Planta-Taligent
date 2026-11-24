import { BellOff, BellRing, FileText } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import NumberTicker from "@/components/basic-number-ticker";
import { EtiquetaSeveridad, Tarjeta, Titulo } from "@/componentes/basicos";
import { useDatos } from "@/contexto";
import { FONDO_SEVERIDAD, MERCADOS, MODELOS, NOMBRE_SEVERIDAD, buscarCaso, comb, diaDe, horaDe, numeroFoto, type Cuaderno, type Foto, type Serie, type Severidad } from "@/datos";
import { cn } from "@/lib/utils";

const AVISOS = [
  { icono: BellRing, nombre: "Alerta inmediata", texto: "cuando un caso pasa a crítico", color: "text-sev-critica-t", caja: "border-t-sev-critica" },
  { icono: FileText, nombre: "Informe de turno", texto: "lo que cambió en el turno", color: "text-coord", caja: "border-t-coord" },
  { icono: BellOff, nombre: "Sin aviso", texto: "si el caso no cambió", color: "text-tinta-3", caja: "border-t-linea-fuerte" },
];

export default function Portada() {
  const { serie, guardada } = useDatos();
  const cuaderno = guardada?.registro ?? null;
  const numeros = cuaderno
    ? [
        { valor: cuaderno.casos.length, nombre: "casos" },
        { valor: cuaderno.alertas.length, nombre: "alertas" },
        { valor: cuaderno.informes.length, nombre: "informes" },
      ]
    : [];

  return (
    <div className="mx-auto max-w-[1320px] px-6 py-8 pb-20 lg:px-10">
      <Titulo
        parte="2 · Qué resuelve"
        titulo="Tres tipos de aviso"
        bajada="En cada foto calcula los atrasos, los sigue como casos y busca la causa en la bitácora."
      >
        {numeros.length > 0 && (
          <dl className="flex gap-8">
            {numeros.map((n) => (
              <div key={n.nombre} className="text-right">
                <dd className="font-mono text-4xl font-medium">
                  <NumberTicker from={0} target={n.valor} transition={{ duration: 1.2, ease: "easeOut" }} className="tabular" />
                </dd>
                <dt className="text-sm text-tinta-2">{n.nombre} en 10 días</dt>
              </div>
            ))}
          </dl>
        )}
      </Titulo>

      <ul className="mt-6 grid gap-5 md:grid-cols-3">
        {AVISOS.map(({ icono: Icono, nombre, texto, color, caja }) => (
          <li key={nombre} className={cn("flex items-center gap-4 rounded-lg border border-linea border-t-4 bg-tarjeta p-5", caja)}>
            <Icono className={cn("size-8 shrink-0", color)} aria-hidden />
            <div>
              <p className="text-xl font-semibold">{nombre}</p>
              <p className="text-tinta-2">{texto}</p>
            </div>
          </li>
        ))}
      </ul>

      <MapaDeCalor serie={serie} cuaderno={cuaderno} />
    </div>
  );
}

/** Las 9 combinaciones en las 60 fotos, pintadas con la severidad que calcula el código. El punto blanco marca las alertas. */
function MapaDeCalor({ serie, cuaderno }: { serie: Serie | null; cuaderno: Cuaderno | null }) {
  const [foco, setFoco] = useState<{ foto: Foto; combinacion: string } | null>(null);
  // la reproducción: cuántas fotos ya "llegaron". Con movimiento reducido, se muestra entero.
  const quieto = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [hasta, setHasta] = useState(quieto ? 60 : 0);
  const jugando = hasta < 60;
  useEffect(() => {
    if (!jugando || !serie) return;
    const id = window.setTimeout(() => setHasta((h) => h + 1), 100);
    return () => clearTimeout(id);
  }, [hasta, jugando, serie]);
  const alertas = new Set(
    (cuaderno?.alertas ?? []).map((a) => {
      const caso = buscarCaso(cuaderno, a.caso_id);
      return caso ? `${a.snapshot_id}|${comb(caso)}` : "";
    }),
  );
  const n = foco?.foto.combinaciones[foco.combinacion];

  return (
    <Tarjeta className="mt-5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Los 10 días, foto por foto</h3>
          <p className="text-sm text-tinta-3">Cada columna es una foto, cada 4 horas</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {(["ninguna", "media", "alta", "critica"] as Severidad[]).map((sev) => (
            <span key={sev} className="flex items-center gap-1.5 rounded-full border border-linea bg-tarjeta px-2.5 py-1 text-xs text-tinta-2">
              <span className={cn("size-2.5 rounded-full", FONDO_SEVERIDAD[sev])} />
              {NOMBRE_SEVERIDAD[sev]}
            </span>
          ))}
          <span className="flex items-center gap-1.5 rounded-full border border-linea bg-tarjeta px-2.5 py-1 text-xs text-tinta-2">
            <span className="grid size-3 place-items-center rounded-full bg-sev-critica"><span className="size-1.5 rounded-full bg-white" /></span>
            alerta enviada
          </span>
          <button
            type="button"
            onClick={() => { setFoco(null); setHasta(0); }}
            disabled={jugando}
            className="ml-2 cursor-pointer rounded-full bg-acento px-3.5 py-1 text-xs font-medium text-white transition hover:bg-[#0b4b5a] disabled:cursor-default disabled:opacity-40"
          >
            Reproducir
          </button>
        </div>
      </div>

      {serie ? (
        <div className="mt-7 grid grid-cols-[104px_1fr] gap-x-4" onMouseLeave={() => setFoco(null)}>
          {MODELOS.map((modelo, g) => (
            <div key={modelo} className={cn("contents")}>
              <div className={cn("grid grid-rows-3 gap-[3px]", g > 0 && "mt-5")}>
                {MERCADOS.map((mercado, k) => (
                  <span key={mercado} className="flex h-6 items-center justify-end gap-2 text-sm">
                    {k === 0 && <span className="font-semibold text-tinta">{modelo}</span>}
                    <span className="text-tinta-3">{mercado}</span>
                  </span>
                ))}
              </div>
              <div className={cn("grid grid-cols-10 gap-x-3", g > 0 && "mt-5")}>
                {Array.from({ length: 10 }, (_, d) => (
                  <div key={d} className="grid grid-cols-6 gap-[3px]">
                    {MERCADOS.map((mercado) =>
                      serie.fotos.slice(d * 6, d * 6 + 6).map((f, k) => {
                        const x = d * 6 + k;
                        const c = `${modelo}/${mercado}`;
                        const sev = f.combinaciones[c].severidad;
                        const alerta = alertas.has(`${f.id}|${c}`);
                        const enFoco = foco?.foto.id === f.id && foco.combinacion === c;
                        const llego = x < hasta;
                        const color = llego && sev !== "ninguna";
                        return (
                          <motion.button
                            key={`${f.id}${c}${color ? "-color" : ""}`}
                            type="button"
                            initial={color ? { scale: 0.3, opacity: 0 } : false}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ type: "spring", stiffness: 500, damping: 22 }}
                            onMouseEnter={() => setFoco({ foto: f, combinacion: c })}
                            onFocus={() => setFoco({ foto: f, combinacion: c })}
                            aria-label={`${f.id} ${c} ${NOMBRE_SEVERIDAD[sev]}${alerta ? ", alerta" : ""}`}
                            className={cn(
                              "grid h-6 cursor-default place-items-center rounded-md transition-transform duration-150 hover:scale-110",
                              color && FONDO_SEVERIDAD[sev],
                              enFoco && "ring-2 ring-tinta ring-offset-2 ring-offset-tarjeta",
                              jugando && x === hasta - 1 && "ring-1 ring-tinta/30",
                            )}
                          >
                            {!color && <span className={cn("size-[5px] rounded-full", llego ? "bg-[#cdd3db]" : "bg-[#e6e9ee]")} />}
                            {alerta && llego && (
                              <span className="relative grid place-items-center">
                                <motion.span
                                  className="absolute size-2 rounded-full bg-white"
                                  initial={{ scale: 1, opacity: 0.9 }}
                                  animate={{ scale: 4, opacity: 0 }}
                                  transition={{ duration: 0.9, ease: "easeOut" }}
                                />
                                <span className="size-2 rounded-full bg-white" />
                              </span>
                            )}
                          </motion.button>
                        );
                      }),
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
          <span />
          <div className="mt-3 grid grid-cols-10 gap-x-3 text-center text-xs text-tinta-3">
            {Array.from({ length: 10 }, (_, d) => (
              <span key={d} className={cn("transition-colors", jugando && Math.floor((hasta - 1) / 6) === d && "font-semibold text-tinta")}>Día {d + 1}</span>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-6 h-[260px] animate-pulse rounded bg-suave" aria-label="Cargando las cuentas" />
      )}

      <div className="mt-5 flex min-h-10 items-center gap-3 rounded-md bg-suave px-4 py-2 text-sm" aria-live="polite">
        {jugando && serie && hasta > 0 ? (
          <>
            <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-latido rounded-full bg-acento" /><span className="relative inline-flex size-2 rounded-full bg-acento" /></span>
            <span className="font-mono font-medium">{serie.fotos[hasta - 1].id}</span>
            <span className="text-tinta-3">{diaDe(serie.fotos[hasta - 1].hora)} · {horaDe(serie.fotos[hasta - 1].hora)}</span>
            <span className="text-tinta-2">
              alertas hasta acá: <b className="text-sev-critica-t">{(cuaderno?.alertas ?? []).filter((a) => numeroFoto(a.snapshot_id) <= hasta).length}</b>
            </span>
          </>
        ) : foco && n ? (
          <>
            <span className="font-mono font-medium">{foco.foto.id}</span>
            <span className="text-tinta-3">{diaDe(foco.foto.hora)} · {horaDe(foco.foto.hora)}</span>
            <span className="font-medium">{foco.combinacion.replace("/", " para ")}</span>
            <EtiquetaSeveridad severidad={n.severidad} />
            {n.faltantes > 0 && <span className="text-tinta-2">faltan {n.faltantes} de {n.plan}</span>}
            {alertas.has(`${foco.foto.id}|${foco.combinacion}`) && <span className="font-semibold text-sev-critica-t">alerta enviada</span>}
          </>
        ) : (
          <span className="text-tinta-3">Pasá el mouse por una foto para ver el detalle</span>
        )}
      </div>
    </Tarjeta>
  );
}
