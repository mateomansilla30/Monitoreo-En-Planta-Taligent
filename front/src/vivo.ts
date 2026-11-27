// Convierte los eventos de la corrida en vivo (lo que anota agente.py) en lo que se muestra en pantalla.
import { NOMBRE_CATEGORIA, type Agente, type Costos, type Evento, type Resumen, type Serie, type Severidad } from "./datos";

export type ClaseItem = "llegada" | "agente" | "apertura" | "alerta" | "subida" | "levanta" | "frenado" | "informe" | "fin" | "repetida";

/** Un caso que se abre: por qué, con los números del código. */
export interface Apertura {
  caso_id: string;
  combinacion: string;
  severidad: Severidad;
  faltantes: number;
  pct: number;
  sevFaltantes: Severidad;
  pierden: number;
  dias: number;
  sevEmbarque: Severidad;
  etapa: string | null;
  plan?: number; // autos que tendrían que haber salido desde S001
  real?: number;
}

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
  texto?: string; // la alerta o el informe completo
  foto?: string;
  apertura?: Apertura;
  accion?: string; // qué fue: la tool que se usó, "pide_lector", "pide_redactor", "llegada", "hook" o "fin" (lo usa el diagrama de los agentes)
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
    const accion = e.tipo === "tool" ? e.nombre : e.tipo === "pide" ? `pide_${e.a}` : e.tipo;
    const base = { id, t: e.t, foto, accion };
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
      case "hook": // un hook de al terminar: al coordinador le faltaba algo de la foto
        r.frenados += 1;
        r.feed.push({ ...base, clase: "frenado", agente: "coordinador", titulo: `El hook ${e.hook} no lo deja terminar`, detalle: e.motivo });
        return;
      case "tool":
        break;
    }

    // una tool que pidió un agente
    const d = e.datos;
    if (e.error) {
      r.frenados += 1;
      r.feed.push({
        ...base, clase: "frenado", agente: e.agente,
        titulo: e.hook ? `El hook ${e.hook} frenó ${e.nombre}` : `El servidor rechazó ${e.nombre}`,
        detalle: e.texto,
      });
      return;
    }
    switch (e.nombre) {
      case "procesar_snapshot": {
        let p: {
          ya_procesada?: boolean;
          problemas?: {
            modelo: string; mercado: string; caso_id?: string; severidad_final: Severidad;
            autos_faltantes: number; autos_faltantes_pct: number; severidad_por_faltantes: Severidad;
            autos_que_pierden_embarque: number; dias_de_retraso: number; severidad_por_embarque: Severidad;
            etapa_donde_se_traban: string | null;
          }[];
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
        // las aperturas van en filas propias; acá quedan los otros cambios (escalado, resuelto)
        const abiertos = (p.cambios ?? []).filter((c) => c.cambio === "abierto");
        const otros = (p.cambios ?? []).filter((c) => c.cambio !== "abierto").map((c) => `${c.caso_id} ${c.cambio.replace("_", " ")}`);
        r.feed.push({
          ...base, clase: "agente", agente: "coordinador",
          titulo: "Procesa la foto",
          detalle: otros.length ? `Registro: ${otros.join(" · ")}` : abiertos.length ? undefined : (p.problemas ?? []).length ? "Sin cambios en el registro" : "Sin desvíos",
          chips: (p.problemas ?? []).map((x) => ({ texto: `${x.modelo}/${x.mercado}`, severidad: x.severidad_final })),
        });
        abiertos.forEach((c, k) => {
          const x = p.problemas?.find((q) => q.caso_id === c.caso_id);
          if (!x) return;
          const combinacion = `${x.modelo}/${x.mercado}`;
          const numeros = serie?.fotos.find((f) => f.id === foto)?.combinaciones[combinacion];
          r.feed.push({
            ...base, id: id + (k + 1) / 100, // vienen del mismo evento: cada una con su id
            clase: "apertura",
            titulo: `Se abre el caso ${c.caso_id} · ${combinacion}`,
            apertura: {
              caso_id: c.caso_id, combinacion, severidad: x.severidad_final,
              faltantes: x.autos_faltantes, pct: x.autos_faltantes_pct, sevFaltantes: x.severidad_por_faltantes,
              pierden: x.autos_que_pierden_embarque, dias: x.dias_de_retraso, sevEmbarque: x.severidad_por_embarque,
              etapa: x.etapa_donde_se_traban, plan: numeros?.plan, real: numeros?.real,
            },
          });
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
      case "registrar_informe": {
        r.informes += 1;
        const turno = serie?.fotos.find((f) => f.id === (foto ?? texto(d.snapshot_id)))?.turno;
        r.feed.push({
          ...base, clase: "informe", agente: "coordinador",
          titulo: turno ? `Informe de cierre del turno ${turno}` : "Informe de cierre de turno",
          texto: texto(d.texto), // el informe completo, para leerlo en el feed
        });
        return;
      }
      default:
        r.feed.push({ ...base, clase: "agente", agente: e.agente, titulo: e.nombre, detalle: lista(d.bitacoras).join(", ") || undefined });
    }
  });
  return r;
}
