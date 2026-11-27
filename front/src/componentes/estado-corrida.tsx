import { CheckCircle2, CircleDot, WifiOff } from "lucide-react";
import { Numero } from "@/componentes/basicos";
import { useDatos } from "@/contexto";
import { usd } from "@/datos";

/** Arriba a la derecha, solo en "En vivo": si hay una corrida en marcha, por dónde va y cuánto lleva gastado. */
export function EstadoCorrida() {
  const { vivo, resumen, ir } = useDatos();
  const base = "flex shrink-0 items-center gap-2 rounded-md border px-3 py-1.5 text-sm";

  if (!vivo.conectado) {
    return (
      <span className={`${base} border-sev-alta/40 bg-[#fdf0e5] text-sev-alta-t`} role="status">
        <WifiOff className="size-4" aria-hidden /> Sin servidor: python src/demo.py
      </span>
    );
  }

  if (vivo.corriendo) {
    const l = resumen.llegada;
    return (
      <button onClick={() => ir("vivo")} className={`${base} cursor-pointer border-linea bg-tarjeta hover:border-linea-fuerte`} role="status">
        <span className="relative flex size-2" aria-hidden>
          <span className="absolute inline-flex size-full animate-latido rounded-full bg-sev-critica" />
          <span className="relative inline-flex size-2 rounded-full bg-sev-critica" />
        </span>
        <span className="font-medium">En vivo</span>
        <span className="tabular hidden font-mono text-tinta-2 sm:inline">{l ? `${l.snapshot_id} · ${l.orden}/${l.total}` : "arrancando…"}</span>
        <Numero valor={resumen.costos?.usd ?? 0} formato={(n) => usd(n, 3)} className="font-mono text-tinta-2" />
      </button>
    );
  }

  if (resumen.fin) {
    return (
      <button onClick={() => ir("vivo")} className={`${base} cursor-pointer border-linea bg-tarjeta text-tinta-2 hover:border-linea-fuerte`}>
        <CheckCircle2 className="size-4 text-redactor" aria-hidden />
        <span className="hidden sm:inline">Corrida hasta {resumen.fin.hasta}</span>
        <span className="font-mono text-tinta">{usd(resumen.fin.usd, 3)}</span>
      </button>
    );
  }

  return (
    <button onClick={() => ir("vivo")} className={`${base} cursor-pointer border-linea bg-tarjeta text-tinta-2 hover:border-linea-fuerte`}>
      <CircleDot className="size-4" aria-hidden /> <span className="hidden sm:inline">Listo para correr</span>
    </button>
  );
}
