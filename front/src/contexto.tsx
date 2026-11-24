import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { pedir, type Cuaderno, type Evento, type Guardada, type Serie, type Vivo } from "./datos";
import { resumirVivo, type ResumenVivo } from "./vivo";

export interface EstadoVivo {
  conectado: boolean;
  corriendo: boolean;
  codigo: number | null;
  hasta: string | null;
  eventos: Evento[];
  registro: Cuaderno | null;
  error: string | null;
}

interface Datos {
  serie: Serie | null;
  guardada: Guardada | null;
  vivo: EstadoVivo;
  resumen: ResumenVivo; // lo que pasó en la corrida en vivo, listo para mostrar
  correr: (hasta: number) => Promise<void>;
  parar: () => Promise<void>;
  ir: (diapo: string) => void;
}

const Contexto = createContext<Datos | null>(null);

export function useDatos() {
  const datos = useContext(Contexto);
  if (!datos) throw new Error("useDatos va dentro de <ProveedorDatos>");
  return datos;
}

/** Pide algo al servidor una vez; si todavía no está levantado, reintenta cada 3 segundos. */
function useUnaVez<T>(url: string) {
  const [datos, setDatos] = useState<T | null>(null);
  useEffect(() => {
    let activo = true;
    let reloj = 0;
    const intentar = () =>
      pedir<T>(url)
        .then((d) => activo && setDatos(d))
        .catch(() => {
          if (activo) reloj = window.setTimeout(intentar, 3000);
        });
    intentar();
    return () => {
      activo = false;
      clearTimeout(reloj);
    };
  }, [url]);
  return datos;
}

const INICIAL: EstadoVivo = {
  conectado: false, corriendo: false, codigo: null, hasta: null, eventos: [], registro: null, error: null,
};

/** La corrida en vivo: pregunta seguido mientras corre y junta los eventos nuevos. */
function useVivo() {
  const [estado, setEstado] = useState<EstadoVivo>(INICIAL);
  const desde = useRef(0);
  const corriendo = useRef(false);
  const generacion = useRef(0); // cambia al arrancar otra corrida: descarta respuestas viejas

  useEffect(() => {
    let activo = true;
    let reloj = 0;
    const tick = async () => {
      const gen = generacion.current;
      try {
        const v = await pedir<Vivo>(`/api/vivo?desde=${desde.current}`);
        if (!activo || gen !== generacion.current) return;
        const reinicio = v.total < desde.current; // el archivo de eventos es de otra corrida
        desde.current = reinicio ? 0 : v.total;
        corriendo.current = v.corriendo;
        setEstado((prev) => ({
          ...prev,
          conectado: true,
          corriendo: v.corriendo,
          codigo: v.codigo,
          hasta: v.hasta,
          registro: v.registro,
          eventos: reinicio ? [] : v.eventos.length ? [...prev.eventos, ...v.eventos] : prev.eventos,
        }));
      } catch {
        if (activo) setEstado((prev) => ({ ...prev, conectado: false }));
      } finally {
        if (activo) reloj = window.setTimeout(tick, corriendo.current ? 700 : 2500);
      }
    };
    tick();
    return () => {
      activo = false;
      clearTimeout(reloj);
    };
  }, []);

  const correr = useCallback(async (hasta: number) => {
    try {
      const r = await pedir<{ hasta: string }>("/api/correr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hasta }),
      });
      generacion.current += 1;
      desde.current = 0;
      corriendo.current = true;
      setEstado((prev) => ({ ...prev, corriendo: true, codigo: null, hasta: r.hasta, eventos: [], registro: null, error: null }));
    } catch (e) {
      setEstado((prev) => ({ ...prev, error: e instanceof Error ? e.message : String(e) }));
    }
  }, []);

  const parar = useCallback(async () => {
    await pedir("/api/parar", { method: "POST" }).catch(() => undefined);
  }, []);

  return { estado, correr, parar };
}

export function ProveedorDatos({ children, ir }: { children: ReactNode; ir: (diapo: string) => void }) {
  const serie = useUnaVez<Serie>("/api/serie");
  const guardada = useUnaVez<Guardada>("/api/guardada");
  const { estado, correr, parar } = useVivo();
  const resumen = useMemo(() => resumirVivo(estado.eventos, serie), [estado.eventos, serie]);
  return (
    <Contexto.Provider value={{ serie, guardada, vivo: estado, resumen, correr, parar, ir }}>{children}</Contexto.Provider>
  );
}
