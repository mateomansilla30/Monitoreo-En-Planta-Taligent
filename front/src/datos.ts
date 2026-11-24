// Lo que manda el servidor de la demo (src/demo.py) y cómo se nombra en pantalla.

export type Severidad = "ninguna" | "media" | "alta" | "critica";
export type Agente = "coordinador" | "lector" | "redactor";
export type EstadoCaso = "abierto" | "en_seguimiento" | "escalado" | "resuelto";

export const SEVERIDADES: Severidad[] = ["ninguna", "media", "alta", "critica"];
export const MODELOS = ["Sedán", "SUV", "Pickup"] as const;
export const MERCADOS = ["Local", "Brasil", "Europa"] as const;
export const COMBINACIONES = MODELOS.flatMap((m) => MERCADOS.map((k) => `${m}/${k}`));

export const NOMBRE_SEVERIDAD: Record<Severidad, string> = {
  ninguna: "sin desvío", media: "media", alta: "alta", critica: "crítica",
};
// clases de Tailwind por severidad (los colores están en index.css)
export const FONDO_SEVERIDAD: Record<Severidad, string> = {
  ninguna: "bg-sev-ninguna", media: "bg-sev-media", alta: "bg-sev-alta", critica: "bg-sev-critica",
};
export const TEXTO_SEVERIDAD: Record<Severidad, string> = {
  ninguna: "text-tinta-3", media: "text-sev-media-t", alta: "text-sev-alta-t", critica: "text-sev-critica-t",
};

export const NOMBRE_ESTADO: Record<EstadoCaso, string> = {
  abierto: "abierto", en_seguimiento: "en seguimiento", escalado: "escalado", resuelto: "resuelto",
};

export const NOMBRE_CATEGORIA: Record<string, string> = {
  parada_de_linea: "Parada de línea",
  faltante_de_piezas: "Faltante de piezas",
  retrabajo: "Retrabajo",
  retencion_de_calidad: "Retención de calidad",
  ausentismo: "Ausentismo",
  no_declarada: "No declarada",
};

export const AGENTES: Record<Agente, { nombre: string; texto: string; fondo: string; borde: string }> = {
  coordinador: { nombre: "Coordinador", texto: "text-coord", fondo: "bg-coord", borde: "border-coord" },
  lector: { nombre: "Lector", texto: "text-lector", fondo: "bg-lector", borde: "border-lector" },
  redactor: { nombre: "Redactor", texto: "text-redactor", fondo: "bg-redactor", borde: "border-redactor" },
};

// --- Lo que viene del servidor ---

export interface NumerosFoto {
  severidad: Severidad;
  faltantes: number;
  pct: number;
  pierden_embarque: number;
  dias_de_retraso: number;
  etapa: string | null;
  plan: number; // autos que tendrían que haber salido de calidad desde S001
  real: number; // autos que salieron
}
export interface Foto {
  id: string;
  hora: string;
  turno: string;
  cierre: boolean;
  combinaciones: Record<string, NumerosFoto>;
}
export interface Serie {
  fotos: Foto[];
  llegadas: string[];
}

export interface Causa {
  categoria: string;
  etapa: string | null;
  bitacora?: string | null;
  fragmento?: string | null;
  registrada_en?: string;
}
export interface Caso {
  caso_id: string;
  modelo: string;
  mercado: string;
  estado: EstadoCaso;
  abierto_en: string;
  alerta_enviada_en: string | null;
  etapa_cuello?: string | null;
  causa: Causa | null;
  severidad_actual: Severidad;
  severidad_maxima: Severidad;
  escalado_por?: "umbral" | "agente";
  resuelto_en?: string;
}
export interface Alerta {
  snapshot_id: string;
  caso_id: string;
  texto: string;
}
export interface Informe {
  snapshot_id: string;
  turno: string;
  texto: string;
  novedades: string[];
  casos_activos: string[];
}
export interface Subida {
  modelo: string;
  categoria: string;
  etapa: string;
  subida_en: string;
  bitacora: string;
  fragmento: string;
  levantada_en: string | null;
  bitacora_fin?: string;
  fragmento_fin?: string;
}
export interface Cuaderno {
  snapshots_procesados: string[];
  casos: Caso[];
  alertas: Alerta[];
  informes: Informe[];
  subidas: Subida[];
}

export interface CostoAgente {
  veces: number;
  input_tokens: number;
  output_tokens: number;
  usd: number;
}
export interface Costos {
  agentes: Record<Agente, CostoAgente>;
  input_tokens: number;
  output_tokens: number;
  usd: number;
}
export interface Resumen extends Costos {
  hasta: string;
  minutos: number;
  fecha: string;
}
export type Nota = [bien: number, total: number];
export interface Evaluacion {
  hasta: string;
  fotos: Nota;
  alertas: Nota;
  informes: Nota;
  causas: Nota;
  subidas: Nota;
  errores: string[];
}
export interface Guardada {
  registro: Cuaderno | null;
  resumen: Resumen | null;
  evaluacion: Evaluacion | null;
}

export type Evento =
  | { tipo: "inicio"; t: number; hasta: string; total: number }
  | { tipo: "llegada"; t: number; snapshot_id: string; orden: number; total: number }
  | { tipo: "tool"; t: number; agente: Agente; nombre: string; datos: Record<string, unknown>; texto: string; error: boolean }
  | { tipo: "pide"; t: number; a: "lector" | "redactor"; caso_id?: string; bitacoras?: string[]; que?: "alerta" | "informe" }
  | ({ tipo: "costo"; t: number } & Costos)
  | ({ tipo: "fin"; t: number } & Resumen);

export interface Vivo {
  corriendo: boolean;
  codigo: number | null;
  hasta: string | null;
  eventos: Evento[];
  total: number;
  registro: Cuaderno | null;
}

export async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(datos.error ?? `${r.status} ${r.statusText}`);
  return datos as T;
}

// --- Formatos ---

export const usd = (n: number, decimales = 2) =>
  `USD ${n.toLocaleString("es-AR", { minimumFractionDigits: decimales, maximumFractionDigits: decimales })}`;
export const miles = (n: number) => n.toLocaleString("es-AR");
/** Un número con coma decimal, como se escribe en castellano: 16,7 */
export const decimal = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 1 });
export const horaDe = (iso: string) => iso.slice(11, 16);
export const diaDe = (iso: string) =>
  new Date(iso).toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
export const comb = (c: { modelo: string; mercado: string }) => `${c.modelo}/${c.mercado}`;
export const numeroFoto = (s: string) => Number(s.slice(1));

/** Cómo quedó un caso en el cuaderno, buscado por id. */
export const buscarCaso = (cuaderno: Cuaderno | null | undefined, id: string) =>
  cuaderno?.casos.find((c) => c.caso_id === id);

/** La subida de severidad vigente para el modelo, si hay. */
export const subidaVigente = (cuaderno: Cuaderno | null | undefined, modelo: string) =>
  cuaderno?.subidas.find((s) => s.modelo === modelo && s.levantada_en === null);

// Corridas anteriores, documentadas en el README (no se recalculan).
export const HISTORIAL = {
  unAgente: { fecha: "19/11", minutos: 5.4, usd: 0.13, input_tokens: 1_071_374, output_tokens: 55_088 },
  aCiegas: { fotos: [18, 18] as Nota, alertas: [1, 1] as Nota, informes: [9, 9] as Nota, causas: [6, 6] as Nota },
};
