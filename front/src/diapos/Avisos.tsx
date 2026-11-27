import { BellRing, FileText } from "lucide-react";
import { useState } from "react";
import { CamposAlerta, Markdown, Tarjeta, Titulo } from "@/componentes/basicos";
import { useDatos } from "@/contexto";
import { buscarCaso, comb, numeroFoto } from "@/datos";
import { cn } from "@/lib/utils";

type Elegido = { tipo: "alerta" | "informe"; indice: number };

/** Para las preguntas: todas las alertas y los informes de la última corrida, para leerlos enteros. */
export default function Avisos() {
  const { guardada } = useDatos();
  const cuaderno = guardada?.registro;
  const [elegido, setElegido] = useState<Elegido>({ tipo: "alerta", indice: 1 });
  const [soloConNovedades, setSoloConNovedades] = useState(false);

  if (!cuaderno) return <p className="p-10 text-tinta-2">Cargando la última corrida…</p>;
  const { alertas, informes } = cuaderno;
  const actual = elegido.tipo === "alerta" ? alertas[elegido.indice] : informes[elegido.indice];
  const informesVisibles = informes.map((inf, i) => ({ inf, i })).filter(({ inf }) => !soloConNovedades || inf.novedades.length > 0);
  const fila = (activo: boolean) =>
    cn("flex w-full cursor-pointer items-center justify-between gap-2 border-l-2 px-3 py-1.5 text-left text-sm transition-colors", activo ? "border-acento bg-acento-suave" : "border-transparent hover:bg-suave");

  return (
    <div className="mx-auto max-w-[1320px] px-6 py-8 pb-20 lg:px-10">
      <Titulo
        parte="6 · Avisos"
        titulo={`Las ${alertas.length} alertas y los ${informes.length} informes`}
        bajada={`${informes.filter((i) => !i.novedades.length).length} de los ${informes.length} informes no tienen novedades.`}
      />

      <div className="mt-6 grid gap-5 lg:grid-cols-[320px_1fr]">
        <Tarjeta className="scroll-fino max-h-[calc(100dvh-250px)] overflow-y-auto p-0">
          <section className="py-2">
            <h3 className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold tracking-wide text-tinta-3 uppercase">
              <BellRing className="size-3.5" aria-hidden /> Alertas
            </h3>
            <ul>
              {alertas.map((a, i) => {
                const c = buscarCaso(cuaderno, a.caso_id);
                const activo = elegido.tipo === "alerta" && elegido.indice === i;
                return (
                  <li key={`${a.snapshot_id}${a.caso_id}`}>
                    <button onClick={() => setElegido({ tipo: "alerta", indice: i })} aria-pressed={activo} className={fila(activo)}>
                      <span><span className="font-mono text-tinta-2">{a.snapshot_id}</span> · {c ? comb(c) : a.caso_id}</span>
                      <span className="text-xs text-tinta-3">{c?.escalado_por === "agente" ? "bitácora" : "números"}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
          <section className="border-t border-linea py-2">
            <div className="flex items-center justify-between px-3 py-1.5">
              <h3 className="flex items-center gap-2 text-xs font-semibold tracking-wide text-tinta-3 uppercase">
                <FileText className="size-3.5" aria-hidden /> Informes
              </h3>
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-tinta-2">
                <input type="checkbox" checked={soloConNovedades} onChange={(e) => setSoloConNovedades(e.target.checked)} className="accent-acento" />
                solo con novedades
              </label>
            </div>
            <ul>
              {informesVisibles.map(({ inf, i }) => {
                const activo = elegido.tipo === "informe" && elegido.indice === i;
                return (
                  <li key={inf.snapshot_id}>
                    <button onClick={() => setElegido({ tipo: "informe", indice: i })} aria-pressed={activo} className={fila(activo)}>
                      <span>
                        <span className="font-mono text-tinta-2">{inf.snapshot_id}</span> · {inf.turno}{" "}
                        <span className="text-xs text-tinta-3">día {Math.ceil(numeroFoto(inf.snapshot_id) / 6)}</span>
                      </span>
                      <span className={cn("text-xs", inf.novedades.length ? "font-medium text-acento" : "text-tinta-3")}>
                        {inf.novedades.length ? `${inf.novedades.length} novedad${inf.novedades.length > 1 ? "es" : ""}` : "sin novedades"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        </Tarjeta>

        <Tarjeta className="min-h-[420px] p-6">
          {elegido.tipo === "alerta" && alertas[elegido.indice] && <CamposAlerta alerta={alertas[elegido.indice]} className="mb-4" />}
          {actual ? <Markdown texto={actual.texto} /> : <p className="text-tinta-2">Elegí un aviso de la lista.</p>}
        </Tarjeta>
      </div>
    </div>
  );
}
