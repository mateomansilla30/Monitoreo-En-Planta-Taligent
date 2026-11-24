import { Flame } from "lucide-react";
import {
  MERCADOS, MODELOS, NOMBRE_CATEGORIA, NOMBRE_ESTADO, NOMBRE_SEVERIDAD, TEXTO_SEVERIDAD,
  subidaVigente, type Caso, type Cuaderno, type Serie, type Severidad,
} from "@/datos";
import { cn } from "@/lib/utils";

// la celda: un fondo apenas teñido y una franja arriba con el color de la severidad
const CELDA: Record<Severidad, string> = {
  ninguna: "bg-tarjeta",
  media: "bg-[#fdf7e6]",
  alta: "bg-[#fdf0e5]",
  critica: "bg-[#fbe9ec]",
};
const FRANJA: Record<Severidad, string> = {
  ninguna: "bg-linea",
  media: "bg-sev-media",
  alta: "bg-sev-alta",
  critica: "bg-sev-critica",
};

/** El caso que importa ahora para una combinación: el activo, si hay. */
function casoActivo(cuaderno: Cuaderno | null, modelo: string, mercado: string): Caso | undefined {
  const casos = cuaderno?.casos.filter((c) => c.modelo === modelo && c.mercado === mercado) ?? [];
  return casos.findLast((c) => c.estado !== "resuelto");
}

/** La planta en una foto: 3 modelos × 3 mercados, con el caso de cada combinación y sus números. */
export function Tablero({ cuaderno, foto, serie }: { cuaderno: Cuaderno | null; foto?: string; serie: Serie | null }) {
  const numeros = serie?.fotos.find((f) => f.id === foto)?.combinaciones;
  return (
    <div className="grid grid-cols-[auto_repeat(3,minmax(0,1fr))] gap-1.5">
      <span />
      {MERCADOS.map((m) => (
        <span key={m} className="pb-0.5 text-center text-xs font-medium text-tinta-3">{m}</span>
      ))}
      {MODELOS.map((modelo) => (
        <div key={modelo} className="contents">
          <span className="flex items-center pr-2 text-sm font-medium text-tinta-2">{modelo}</span>
          {MERCADOS.map((mercado) => {
            const caso = casoActivo(cuaderno, modelo, mercado);
            const n = numeros?.[`${modelo}/${mercado}`];
            const severidad: Severidad = caso?.severidad_actual ?? n?.severidad ?? "ninguna";
            const subida = subidaVigente(cuaderno, modelo);
            const conSubida = !!caso && !!subida && caso.causa?.categoria === subida.categoria;
            return (
              <div key={mercado} className={cn("relative min-h-[96px] overflow-hidden rounded-md border border-linea p-2.5 pt-3 transition-colors duration-500", CELDA[severidad])}>
                <span className={cn("absolute inset-x-0 top-0 h-1", FRANJA[severidad])} />
                {caso?.estado === "escalado" && (
                  <span aria-hidden className="absolute top-2.5 right-2.5 flex size-2">
                    <span className="absolute inline-flex size-full animate-latido rounded-full bg-sev-critica" />
                    <span className="relative inline-flex size-2 rounded-full bg-sev-critica" />
                  </span>
                )}
                <p className={cn("text-xs font-medium", TEXTO_SEVERIDAD[severidad])}>{NOMBRE_SEVERIDAD[severidad]}</p>
                {caso ? (
                  <>
                    <p className="mt-1 font-mono text-base leading-none font-medium">{caso.caso_id}</p>
                    <p className="mt-0.5 text-xs text-tinta-2">{NOMBRE_ESTADO[caso.estado]}</p>
                    {caso.causa && (
                      <p className="mt-0.5 truncate text-[11px] text-tinta-3" title={NOMBRE_CATEGORIA[caso.causa.categoria]}>
                        {NOMBRE_CATEGORIA[caso.causa.categoria] ?? caso.causa.categoria}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="mt-1 text-xs text-tinta-3">sin caso</p>
                )}
                <div className="mt-1 flex items-center justify-between gap-1 text-[11px] text-tinta-3">
                  {n && n.faltantes > 0 ? <span className="tabular">faltan {n.faltantes}</span> : <span />}
                  {conSubida && (
                    <span title="Severidad subida por la bitácora" className="inline-flex items-center gap-0.5 font-medium text-sev-critica-t">
                      <Flame className="size-3" aria-hidden /> subida
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
