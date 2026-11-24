// Convierte los eventos de la corrida en vivo (lo que anota agente.py) en lo que se muestra en pantalla.
import { NOMBRE_CATEGORIA, type Agente, type Costos, type Evento, type Resumen, type Serie, type Severidad } from "./datos";

export type ClaseItem = "llegada" | "agente" | "alerta" | "subida" | "levanta" | "frenado" | "informe" | "fin" | "repetida";

export interface ItemFeed {
  id: number;
  t: number;
  clase: ClaseItem;
  agente?: Agente;
  titulo: string;
  detalle?: string;
  cita?: string;
  estado?: string; // el estado que propone el lector: sin_fecha, con_fecha, resuelta, no_dice
  chips?: { texto: string; severidad?: Severidad }[];
  texto?: string; // la alerta completa
  foto?: string;
}

export interface AlertaVivo {
  t: number;
  snapshot_id: string;
  caso_id: string;
  texto: string;
  porBitacora: boolean;
  cita?: string;
}

export interface ResumenVivo {
  inicio?: { t: number; hasta: string; total: number };
  llegada?: { t: number; snapshot_id: string; orden: number; total: number };
  costos?: Costos;
  fin?: Resumen & { t: number };
  feed: ItemFeed[];
  alertas: AlertaVivo[];
  informes: number;
  frenados: number;
  repetidas: number;
}

interface Propuesta {
  categoria?: string;
  etapa?: string | null;
  bitacora?: string | null;
  fragmento?: string | null;
  estado?: string;
  fragmento_estado?: string | null;
}

/** La respuesta del lector es un JSON, a veces con texto alrededor. */
export function leerPropuesta(texto: string): Propuesta | null {
  try {
    return JSON.parse(texto.slice(texto.indexOf("{"), texto.lastIndexOf("}") + 1));
  } catch {
    return null;
  }
}

const texto = (v: unknown) => (typeof v === "string" ? v : "");
const lista = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);

export function resumirVivo(eventos: Evento[], serie: Serie | null): ResumenVivo {
  const r: ResumenVivo = { feed: [], alertas: [], informes: 0, frenados: 0, repetidas: 0 };
  let ultimaSubida: string | undefined; // la cita de la última subida, para explicar la alerta que viene después
  let foto: string | undefined;

  eventos.forEach((e, id) => {
    const base = { id, t: e.t, foto };
    switch (e.tipo) {
      case "inicio":
        r.inicio = { t: e.t, hasta: e.hasta, total: e.total };
        return;
      case "costo":
        r.costos = e;
        return;
      case "fin":
        r.fin = e;
        r.costos = e;
        r.feed.push({ ...base, clase: "fin", titulo: `Terminó la corrida hasta ${e.hasta}`, detalle: `${e.minutos} min` });
        return;
      case "llegada": {
        foto = e.snapshot_id;
        r.llegada = { t: e.t, snapshot_id: e.snapshot_id, orden: e.orden, total: e.total };
        const f = serie?.fotos.find((x) => x.id === e.snapshot_id);
        r.feed.push({
          ...base, foto, clase: "llegada",
          titulo: `Llegó la foto ${e.snapshot_id}`,
          detalle: f ? `${f.hora.slice(11, 16)} · turno ${f.turno}${f.cierre ? " · cierre de turno" : ""}` : undefined,
        });
        return;
      }
      case "pide":
        r.feed.push({
          ...base, clase: "agente", agente: "coordinador",
          titulo: e.a === "lector"
            ? `Le pide al lector la causa de ${e.caso_id}`
            : e.que === "alerta" ? `Le pide al redactor la alerta de ${e.caso_id}` : "Le pide al redactor el informe del turno",
          detalle: e.a === "lector" ? `Bitácoras: ${(e.bitacoras ?? []).join(", ")}` : undefined,
        });
        return;
      case "tool":
        break;
    }

    // una tool que pidió un agente
    const d = e.datos;
    if (e.error) {
      r.frenados += 1;
      r.feed.push({ ...base, clase: "frenado", agente: e.agente, titulo: `El código rechazó ${e.nombre}`, detalle: e.texto });
      return;
    }
    switch (e.nombre) {
      case "procesar_snapshot": {
        let p: {
          ya_procesada?: boolean;
          problemas?: { modelo: string; mercado: string; severidad_final: Severidad }[];
          cambios?: { caso_id: string; cambio: string; origen?: string }[];
        } = {};
        try {
          p = JSON.parse(e.texto);
        } catch {
          /* si no es JSON, se muestra igual sin detalle */
        }
        if (p.ya_procesada) {
          r.repetidas += 1;
          r.feed.push({ ...base, clase: "repetida", agente: "coordinador", titulo: "Foto repetida: ya estaba procesada", detalle: "El registro no cambia y no se repite ningún aviso." });
          return;
        }
        const cambios = (p.cambios ?? []).map((c) => `${c.caso_id} ${c.cambio.replace("_", " ")}`);
        r.feed.push({
          ...base, clase: "agente", agente: "coordinador",
          titulo: "Procesa la foto",
          detalle: cambios.length ? `Registro: ${cambios.join(" · ")}` : (p.problemas ?? []).length ? "Sin cambios en el registro" : "Sin desvíos",
          chips: (p.problemas ?? []).map((x) => ({ texto: `${x.modelo}/${x.mercado}`, severidad: x.severidad_final })),
        });
        return;
      }
      case "leer_bitacora":
        r.feed.push({ ...base, clase: "agente", agente: "lector", titulo: `Lee la bitácora ${texto(d.turno_id)}` });
        return;
      case "pedir_causa": {
        const p = leerPropuesta(e.texto);
        r.feed.push({
          ...base, clase: "agente", agente: "lector",
          titulo: p ? `Propone: ${NOMBRE_CATEGORIA[p.categoria ?? ""] ?? p.categoria}${p.etapa ? ` en ${p.etapa}` : ""}` : "Propone una causa",
          detalle: p?.bitacora ? `Bitácora ${p.bitacora}` : p ? "Ninguna bitácora dice por qué" : undefined,
          cita: p?.fragmento ?? undefined,
          estado: p?.estado,
          texto: p?.fragmento_estado ?? undefined,
        });
        return;
      }
      case "registrar_causa":
        r.feed.push({
          ...base, clase: "agente", agente: "coordinador",
          titulo: `Registra la causa de ${texto(d.caso_id)}`,
          detalle: `${NOMBRE_CATEGORIA[texto(d.categoria)] ?? texto(d.categoria)}${d.bitacora ? ` · cita verificada en ${texto(d.bitacora)}` : ""}`,
        });
        return;
      case "subir_severidad":
        ultimaSubida = texto(d.fragmento);
        r.feed.push({
          ...base, clase: "subida", agente: "coordinador",
          titulo: `Sube la severidad a crítica (${texto(d.caso_id)})`,
          detalle: `La bitácora ${texto(d.bitacora)} dice que sigue sin fecha de resolución`,
          cita: texto(d.fragmento),
        });
        return;
      case "levantar_subida":
        ultimaSubida = undefined;
        r.feed.push({
          ...base, clase: "levanta", agente: "coordinador",
          titulo: "Levanta la subida de severidad",
          detalle: `La bitácora ${texto(d.bitacora)} dice que se resolvió`,
          cita: texto(d.fragmento),
        });
        return;
      case "pedir_texto":
        r.feed.push({
          ...base, clase: "agente", agente: "redactor",
          titulo: d.tipo === "alerta" ? `Escribe la alerta de ${texto(d.caso_id)}` : "Escribe el informe del turno",
        });
        return;
      case "registrar_alerta": {
        const porBitacora = /por la bitácora|sin fecha/i.test(texto(d.texto));
        const alerta: AlertaVivo = {
          t: e.t, snapshot_id: texto(d.snapshot_id), caso_id: texto(d.caso_id), texto: texto(d.texto),
          porBitacora, cita: porBitacora ? ultimaSubida : undefined,
        };
        r.alertas.push(alerta);
        r.feed.push({ ...base, clase: "alerta", agente: "coordinador", titulo: `ALERTA · ${alerta.caso_id}`, texto: alerta.texto });
        return;
      }
      case "registrar_informe":
        r.informes += 1;
        r.feed.push({ ...base, clase: "informe", agente: "coordinador", titulo: `Registra el informe de cierre de ${foto ?? texto(d.snapshot_id)}` });
        return;
      default:
        r.feed.push({ ...base, clase: "agente", agente: e.agente, titulo: e.nombre, detalle: lista(d.bitacoras).join(", ") || undefined });
    }
  });
  return r;
}
