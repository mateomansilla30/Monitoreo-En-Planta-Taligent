import { ChevronLeft, ChevronRight, Factory } from "lucide-react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import { EstadoCorrida } from "@/componentes/estado-corrida";
import { ProveedorDatos } from "@/contexto";
import { cn } from "@/lib/utils";
import Avisos from "@/diapos/Avisos";
import ComoFunciona from "@/diapos/ComoFunciona";
import EnVivo from "@/diapos/EnVivo";
import Problema from "@/diapos/Problema";
import Resultados from "@/diapos/Resultados";
import Traza from "@/diapos/Traza";

// Las partes de la presentación, en el orden en que se cuentan.
const DIAPOS: { id: string; nombre: string; Diapo: ComponentType }[] = [
  { id: "problema", nombre: "El problema", Diapo: Problema },
  { id: "como", nombre: "Cómo funciona", Diapo: ComoFunciona },
  { id: "vivo", nombre: "En vivo", Diapo: EnVivo },
  { id: "traza", nombre: "Traza", Diapo: Traza },
  { id: "resultados", nombre: "Resultados", Diapo: Resultados },
  { id: "avisos", nombre: "Avisos", Diapo: Avisos },
];

const indiceDelHash = () => Math.max(0, DIAPOS.findIndex((d) => `#${d.id}` === window.location.hash));

export default function App() {
  const [indice, setIndice] = useState(indiceDelHash);
  const actual = useRef(indice);
  actual.current = indice;
  const pagina = useRef<HTMLElement>(null); // la parte visible, que puede ser más alta que la pantalla

  const irA = useCallback((i: number) => {
    const n = Math.max(0, Math.min(DIAPOS.length - 1, i));
    if (n === actual.current) return;
    setIndice(n);
    history.replaceState(null, "", `#${DIAPOS[n].id}`);
  }, []);
  const ir = useCallback((id: string) => irA(DIAPOS.findIndex((d) => d.id === id)), [irA]);

  // ← → y Re Pág / Av Pág (los punteros de presentación) cambian de parte; ↑ ↓ bajan y suben dentro de la parte; 1 a 6 saltan
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      // en un campo de texto las teclas escriben; en un deslizador no: el puntero de presentación tiene que seguir andando
      if ((e.target as HTMLElement).closest("input:not([type=range]), textarea, select, [contenteditable]")) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        pagina.current?.scrollBy({ top: (e.key === "ArrowDown" ? 1 : -1) * window.innerHeight * 0.5, behavior: "smooth" });
      } else if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        irA(actual.current + 1);
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        irA(actual.current - 1);
      } else if (/^[1-6]$/.test(e.key)) {
        irA(Number(e.key) - 1);
      }
    };
    const hash = () => irA(indiceDelHash());
    window.addEventListener("keydown", tecla);
    window.addEventListener("hashchange", hash);
    return () => {
      window.removeEventListener("keydown", tecla);
      window.removeEventListener("hashchange", hash);
    };
  }, [irA]);

  const { Diapo } = DIAPOS[indice];

  return (
    <ProveedorDatos ir={ir}>
      <MotionConfig reducedMotion="user">
        <div className="flex h-dvh flex-col overflow-hidden">
          <header className="relative z-30 flex h-14 shrink-0 items-stretch gap-6 border-b border-linea bg-tarjeta px-4 md:px-6">
            <button onClick={() => irA(0)} className="flex shrink-0 cursor-pointer items-center gap-2.5" aria-label="Ir al inicio">
              <span className="grid size-7 place-items-center rounded-md bg-acento text-white">
                <Factory className="size-4" aria-hidden />
              </span>
              <span className="hidden text-sm font-semibold lg:block">
                Monitoreo en planta <span className="font-normal text-tinta-3">· Planta Las Acacias</span>
              </span>
            </button>

            <nav aria-label="Partes de la presentación" className="mx-auto flex min-w-0 items-stretch overflow-x-auto">
              {DIAPOS.map((d, i) => (
                <button
                  key={d.id}
                  onClick={() => irA(i)}
                  aria-current={i === indice ? "step" : undefined}
                  className={cn(
                    "relative flex shrink-0 cursor-pointer items-center gap-2 px-3 text-sm transition-colors",
                    i === indice ? "font-medium text-tinta" : "text-tinta-2 hover:text-tinta",
                  )}
                >
                  <span className={cn("font-mono text-xs", i === indice ? "text-acento" : "text-tinta-3")}>{i + 1}</span>
                  <span className="hidden xl:inline">{d.nombre}</span>
                  {i === indice && <motion.span layoutId="subrayado" className="absolute inset-x-2 bottom-0 h-0.5 bg-acento" transition={{ duration: 0.25 }} />}
                </button>
              ))}
            </nav>

            {/* el estado de la corrida se ve solo en "En vivo" */}
            <div className="flex items-center">{DIAPOS[indice].id === "vivo" && <EstadoCorrida />}</div>
          </header>

          <main className="relative flex-1 overflow-hidden">
            <AnimatePresence mode="wait" initial={false}>
              <motion.section
                ref={pagina}
                key={DIAPOS[indice].id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                aria-label={DIAPOS[indice].nombre}
                className="scroll-fino absolute inset-0 overflow-x-hidden overflow-y-auto"
              >
                <Diapo />
              </motion.section>
            </AnimatePresence>

            <div className="pointer-events-none absolute right-4 bottom-4 z-20 flex items-center gap-2">
              <button onClick={() => irA(indice - 1)} disabled={indice === 0} aria-label="Parte anterior" className="pointer-events-auto grid size-9 cursor-pointer place-items-center rounded-md border border-linea bg-tarjeta text-tinta-2 transition hover:text-tinta disabled:cursor-default disabled:opacity-40">
                <ChevronLeft className="size-4" />
              </button>
              <span className="tabular rounded-md bg-tarjeta/90 px-1.5 font-mono text-xs text-tinta-3">{indice + 1} / {DIAPOS.length}</span>
              <button onClick={() => irA(indice + 1)} disabled={indice === DIAPOS.length - 1} aria-label="Parte siguiente" className="pointer-events-auto grid size-9 cursor-pointer place-items-center rounded-md border border-linea bg-tarjeta text-tinta-2 transition hover:text-tinta disabled:cursor-default disabled:opacity-40">
                <ChevronRight className="size-4" />
              </button>
            </div>
          </main>
        </div>
      </MotionConfig>
    </ProveedorDatos>
  );
}
