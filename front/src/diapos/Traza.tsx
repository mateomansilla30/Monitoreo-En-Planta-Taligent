import { BellRing, BookOpenText, CheckCircle2, Flame } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Cita, EtiquetaSeveridad, Markdown, Rotulo, Tarjeta, Titulo } from "@/componentes/basicos";
import { useDatos } from "@/contexto";
import {
  FONDO_SEVERIDAD, NOMBRE_CATEGORIA, buscarCaso, comb, decimal, horaDe, numeroFoto, pedir,
  type Alerta, type Caso, type Cuaderno, type Serie, type Subida,
} from "@/datos";
import { cn } from "@/lib/utils";

const foto = (n: number) => `S${String(n).padStart(3, "0")}`;

export default function Traza() {
  const { guardada, serie } = useDatos();
  const cuaderno = guardada?.registro ?? null;
  const alertas = cuaderno?.alertas ?? [];
  // por defecto, la alerta que salió por la bitácora (Pickup/Brasil en S034)
  const porDefecto = Math.max(0, alertas.findIndex((a) => buscarCaso(cuaderno, a.caso_id)?.escalado_por === "agente"));
  const [elegida, setElegida] = useState<number | null>(null);
  const indice = elegida ?? porDefecto;
  const alerta = alertas[indice];
  const caso = alerta ? buscarCaso(cuaderno, alerta.caso_id) : undefined;

  return (
    <div className="mx-auto max-w-[1320px] px-6 py-8 pb-20 lg:px-10">
      <Titulo
        parte="5 · Traza"
        titulo="Traza de una alerta"
        bajada={`En qué foto salió, por qué y con qué cita.${guardada?.resumen ? ` Corrida completa del ${guardada.resumen.fecha}.` : ""}`}
      >
        {alertas.length > 0 && (
          <div role="tablist" aria-label="Elegir la alerta" className="flex overflow-hidden rounded-md border border-linea bg-tarjeta">
            {alertas.map((a, i) => {
              const c = buscarCaso(cuaderno, a.caso_id);
              return (
                <button
                  key={`${a.snapshot_id}${a.caso_id}`}
                  role="tab"
                  aria-selected={i === indice}
                  onClick={() => setElegida(i)}
                  className={cn("cursor-pointer px-3 py-1.5 text-left transition-colors", i > 0 && "border-l border-linea", i === indice ? "bg-acento-suave" : "hover:bg-suave")}
                >
                  <span className="block font-mono text-xs text-tinta-3">{a.snapshot_id}</span>
                  <span className={cn("block text-sm", i === indice ? "font-semibold text-acento" : "font-medium")}>{c ? comb(c) : a.caso_id}</span>
                </button>
              );
            })}
          </div>
        )}
      </Titulo>

      {!cuaderno ? (
        <p className="mt-10 text-tinta-2">Cargando la última corrida…</p>
      ) : !alerta || !caso ? (
        <p className="mt-10 text-tinta-2">La última corrida guardada no tiene alertas. Corré la serie completa con python src/agente.py.</p>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div key={indice} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <DetalleTraza alerta={alerta} caso={caso} cuaderno={cuaderno} serie={serie} />
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}

function DetalleTraza({ alerta, caso, cuaderno, serie }: { alerta: Alerta; caso: Caso; cuaderno: Cuaderno; serie: Serie | null }) {
  const nombre = comb(caso);
  const n = numeroFoto(alerta.snapshot_id);
  const porBitacora = caso.escalado_por === "agente";
  const subida = cuaderno.subidas.find((s) => s.modelo === caso.modelo && numeroFoto(s.subida_en) <= n && (!s.levantada_en || numeroFoto(s.levantada_en) >= n));
  const enLaAlerta = serie?.fotos.find((f) => f.id === alerta.snapshot_id);
  const numeros = enLaAlerta?.combinaciones[nombre];
  // la primera foto en que los números solos llegan a crítica
  const criticaPorNumeros = serie?.fotos.find((f) => numeroFoto(f.id) >= n && f.combinaciones[nombre]?.severidad === "critica");
  const horasAntes = criticaPorNumeros ? (numeroFoto(criticaPorNumeros.id) - n) * 4 : null;
  // los casos que escalaron en la misma foto por la misma subida (C009 y C010 en S034)
  const escalados = cuaderno.casos.filter((c) => c.modelo === caso.modelo && c.alerta_enviada_en === alerta.snapshot_id).map((c) => c.caso_id);

  return (
    <div className="mt-6 space-y-5">
      <Tarjeta>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-tinta-2">{nombre} · caso <span className="font-mono">{caso.caso_id}</span></p>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-balance md:text-3xl">
              {porBitacora && horasAntes && criticaPorNumeros ? (
                <>
                  Alerta en {alerta.snapshot_id}, <span className="text-sev-critica-t">{horasAntes} horas antes</span> de que los
                  números llegaran a crítica ({criticaPorNumeros.id})
                </>
              ) : porBitacora ? (
                `Alerta en ${alerta.snapshot_id} por la bitácora ${subida?.bitacora ?? ""}`
              ) : (
                `Alerta en ${alerta.snapshot_id}: los números llegaron a crítica`
              )}
            </p>
          </div>
          {porBitacora && subida && <Cita color="critica" className="max-w-md text-lg">{subida.fragmento}</Cita>}
        </div>
        <LineaDeTiempo caso={caso} alerta={alerta} subida={subida} serie={serie} />
      </Tarjeta>

      <div className="grid gap-5 lg:grid-cols-[1fr_1.1fr]">
        <Tarjeta>
          <Rotulo>Paso a paso</Rotulo>
          <ol className="mt-4 space-y-5">
            <Paso n={1} titulo={`Llega ${alerta.snapshot_id}`} sub={enLaAlerta ? `${horaDe(enLaAlerta.hora)} · turno ${enLaAlerta.turno}${enLaAlerta.cierre ? " · cierre de turno" : ""}` : undefined}>
              {numeros && (
                <p>
                  Las cuentas del código: faltan <b>{numeros.faltantes}</b> autos ({decimal(numeros.pct)} %)
                  {numeros.pierden_embarque > 0 && <>, <b>{numeros.pierden_embarque}</b> pierden el embarque ({decimal(numeros.dias_de_retraso)} días de retraso)</>}
                  {numeros.etapa && <>, se traban en <b>{numeros.etapa}</b></>}. Severidad <EtiquetaSeveridad severidad={numeros.severidad} />.
                </p>
              )}
              <p className="mt-1 text-tinta-2">
                {caso.abierto_en === alerta.snapshot_id ? `Se abre el caso ${caso.caso_id}.` : `El caso ${caso.caso_id} venía abierto desde ${caso.abierto_en}.`}
              </p>
            </Paso>

            {caso.causa?.bitacora && (
              <Paso n={2} titulo={`El lector lee la bitácora ${caso.causa.bitacora}`} sub={caso.causa.registrada_en ? `en ${caso.causa.registrada_en}` : undefined}>
                <p>
                  Propone <b>{NOMBRE_CATEGORIA[caso.causa.categoria] ?? caso.causa.categoria}</b>
                  {caso.causa.etapa && <> en <b>{caso.causa.etapa}</b></>}
                  {porBitacora && <> y que la causa sigue <b className="text-sev-critica-t">sin fecha de resolución</b></>}.
                </p>
              </Paso>
            )}

            <Paso n={3} titulo="El coordinador registra la causa" sub="registrar_causa">
              <p>
                La cita se verifica contra {caso.causa?.bitacora ?? "la bitácora"}: tiene que estar textual.
              </p>
            </Paso>

            {porBitacora && subida && (subida.subida_en === alerta.snapshot_id ? (
              <Paso n={4} titulo="El coordinador sube la severidad" sub={`subir_severidad · ${subida.bitacora}`}>
                <p>
                  {escalados.join(" y ")} {escalados.length > 1 ? "pasan" : "pasa"} a crítica.
                </p>
              </Paso>
            ) : (
              <Paso n={4} titulo="Se aplica la subida vigente" sub={`desde ${subida.subida_en} · ${subida.bitacora}`}>
                <p>
                  Vigente desde {subida.subida_en}: {escalados.join(" y ")} {escalados.length > 1 ? "pasan" : "pasa"} a crítica.
                </p>
              </Paso>
            ))}

            <Paso n={porBitacora && subida ? 5 : 4} titulo="Se registra la alerta" sub="pedir_texto → registrar_alerta">
              <p>La escribe el redactor y la registra el coordinador.</p>
            </Paso>

            {subida?.levantada_en && (
              <Paso n={6} titulo={`En ${subida.levantada_en} se levanta la subida`} sub={`levantar_subida · ${subida.bitacora_fin}`}>
                <Cita color="redactor">{subida.fragmento_fin}</Cita>
              </Paso>
            )}
          </ol>
        </Tarjeta>

        <div className="space-y-5">
          <div className="rounded-lg border border-linea border-l-[3px] border-l-sev-critica bg-tarjeta p-5">
            <Rotulo className="flex items-center gap-2 text-sev-critica-t">
              <BellRing className="size-4" aria-hidden /> Texto de la alerta registrada
            </Rotulo>
            <Markdown texto={alerta.texto} className="mt-3 text-sm" />
          </div>
          {caso.causa?.bitacora && (
            <Bitacora turno={caso.causa.bitacora} resaltar={[
              { frase: caso.causa.fragmento ?? "", clase: "bg-[#d9ebef] text-tinta", nombre: "la causa" },
              ...(porBitacora && subida && subida.bitacora === caso.causa.bitacora
                ? [{ frase: subida.fragmento, clase: "bg-[#f8dbe0] text-tinta", nombre: "sin fecha de resolución" }]
                : []),
            ]} />
          )}
        </div>
      </div>
    </div>
  );
}

function Paso({ n, titulo, sub, children }: { n: number; titulo: string; sub?: string; children?: ReactNode }) {
  return (
    <li className="flex gap-3.5">
      <span className="grid size-7 shrink-0 place-items-center rounded-full border border-linea-fuerte font-mono text-xs font-medium text-tinta-2">{n}</span>
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold">
          {titulo} {sub && <span className="ml-1 font-mono text-xs font-normal text-tinta-3">{sub}</span>}
        </p>
        <div className="mt-1 text-pretty">{children}</div>
      </div>
    </li>
  );
}

/** Fotos alrededor de la alerta: lo que dicen los números (código) y lo que hizo el agente. */
function LineaDeTiempo({ caso, alerta, subida, serie }: { caso: Caso; alerta: Alerta; subida?: Subida; serie: Serie | null }) {
  const nombre = comb(caso);
  const n = numeroFoto(alerta.snapshot_id);
  const fin = subida?.levantada_en ? numeroFoto(subida.levantada_en) + 1 : n + 5;
  const desde = Math.max(1, Math.min(n - 2, fin - 9));
  const fotos = Array.from({ length: Math.min(60, Math.max(fin, desde + 7)) - desde + 1 }, (_, i) => foto(desde + i));
  const sevDe = (s: string) => serie?.fotos.find((x) => x.id === s)?.combinaciones[nombre]?.severidad ?? "ninguna";
  return (
    <div className="mt-6 overflow-x-auto">
      <div className="grid min-w-[640px] gap-y-1.5" style={{ gridTemplateColumns: `120px repeat(${fotos.length}, minmax(0, 1fr))` }}>
        <span />
        {fotos.map((s) => {
          const f = serie?.fotos.find((x) => x.id === s);
          return (
            <span key={s} className={cn("text-center font-mono text-xs", s === alerta.snapshot_id ? "font-medium text-tinta" : "text-tinta-3")}>
              {s}
              <span className="block text-[11px]">{f ? horaDe(f.hora) : ""}</span>
            </span>
          );
        })}

        <span className="flex items-center text-sm text-tinta-2">Los números</span>
        {fotos.map((s) => (
          <span key={s} className="px-0.5">
            <span className={cn("block h-8 rounded-sm", FONDO_SEVERIDAD[sevDe(s)])} title={sevDe(s)} />
          </span>
        ))}

        <span className="flex items-center text-sm text-tinta-2">El agente</span>
        {fotos.map((s) => {
          const i = numeroFoto(s);
          const conSubida = !!subida && i >= numeroFoto(subida.subida_en) && (!subida.levantada_en || i < numeroFoto(subida.levantada_en));
          const sev = conSubida ? "critica" : sevDe(s);
          return (
            <span key={s} className="px-0.5">
              <span className={cn("grid h-8 place-items-center rounded-sm", FONDO_SEVERIDAD[sev])}>
                {s === alerta.snapshot_id && <BellRing className="size-4 text-white" aria-label="alerta" />}
                {conSubida && s !== alerta.snapshot_id && <Flame className="size-3.5 text-white/80" aria-hidden />}
                {subida?.levantada_en === s && <CheckCircle2 className="size-4 text-white" aria-label="subida levantada" />}
              </span>
            </span>
          );
        })}
      </div>
      <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-tinta-2">
        <span className="inline-flex items-center gap-1.5"><BellRing className="size-3.5" aria-hidden /> alerta</span>
        <span className="inline-flex items-center gap-1.5"><Flame className="size-3.5" aria-hidden /> severidad subida por la bitácora</span>
        <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="size-3.5" aria-hidden /> subida levantada</span>
        <span>una foto cada 4 horas</span>
      </p>
    </div>
  );
}

interface Resaltado {
  frase: string;
  clase: string;
  nombre: string;
}

/** El texto de la bitácora con las frases que citó el agente resaltadas. */
function Bitacora({ turno, resaltar }: { turno: string; resaltar: Resaltado[] }) {
  const [texto, setTexto] = useState<string | null>(null);
  useEffect(() => {
    let activo = true;
    pedir<{ texto: string }>(`/api/bitacora/${turno}`).then((d) => activo && setTexto(d.texto)).catch(() => activo && setTexto(""));
    return () => {
      activo = false;
    };
  }, [turno]);

  const partes = useMemo(() => {
    if (!texto) return [];
    const marcas = resaltar
      .map((r) => ({ ...r, desde: texto.indexOf(r.frase) }))
      .filter((r) => r.frase && r.desde >= 0)
      .sort((a, b) => a.desde - b.desde);
    const salida: { texto: string; marca?: Resaltado }[] = [];
    let i = 0;
    for (const m of marcas) {
      if (m.desde < i) continue; // se pisan: queda la primera
      salida.push({ texto: texto.slice(i, m.desde) });
      salida.push({ texto: m.frase, marca: m });
      i = m.desde + m.frase.length;
    }
    salida.push({ texto: texto.slice(i) });
    return salida;
  }, [texto, resaltar]);

  return (
    <Tarjeta>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Rotulo className="flex items-center gap-2">
          <BookOpenText className="size-4 text-lector" aria-hidden /> Bitácora {turno}
        </Rotulo>
        <div className="flex gap-2 text-xs">
          {resaltar.map((r) => (
            <span key={r.nombre} className={cn("rounded-sm px-1.5 py-0.5", r.clase)}>{r.nombre}</span>
          ))}
        </div>
      </div>
      <div className="scroll-fino mt-3 max-h-72 overflow-y-auto rounded-md border border-linea bg-suave p-4 font-mono text-[13px] leading-relaxed whitespace-pre-line text-tinta-2">
        {texto === null ? "Cargando…" : partes.map((p, i) =>
          p.marca ? <mark key={i} className={cn("rounded-sm px-0.5", p.marca.clase)}>{p.texto}</mark> : <span key={i}>{p.texto}</span>,
        )}
      </div>
    </Tarjeta>
  );
}
