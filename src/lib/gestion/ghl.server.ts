import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import {
  sucursales,
  turnoAsistencias,
  turnosManuales,
  arrivals,
  odontologos,
  obrasSociales,
} from "@/db/schema";
import { requireAuth } from "@/lib/gestion/session.server";
import { logAudit } from "@/lib/gestion/audit";
import { isValidDni, normalizeDni } from "@/lib/dni";

// -------------------------------------------------------------------------
// Config GHL por sucursal (slug). Una sucursal puede leer de VARIAS subcuentas
// GHL (sources): p. ej. CABA lee de la subcuenta general + la de IOMA CABA, y
// sus turnos se fusionan en la misma pantalla de Recepción. Cada source tiene su
// location/PIT y sus propios custom fields (pueden diferir entre subcuentas).
// Credenciales por env (no en DB).
// -------------------------------------------------------------------------
type GhlSource = {
  locationId: string;
  pit: string;
  // Custom field DNI. null = la subcuenta no lo tiene (no se lee ni escribe).
  dniField: string | null;
  osField: string | null;
  // Custom field "Observaciones" del contacto (para la columna de la tabla de turnos).
  obsField: string | null;
  // Custom field "Ficha" del contacto (Tiene ficha / No tiene ficha).
  fichaField: string | null;
  // Custom field "Estado de la cita" del contacto (Asistido / No Asistido). Lo lee el
  // workflow de recupero de inasistidos, que no puede evaluar el appointmentStatus nativo.
  estadoCitaField: string | null;
  // Etiqueta de origen para el badge de la tabla (p. ej. "IOMA"). null = sin badge
  // (sede de una sola subcuenta).
  badge: string | null;
  // Filtros de calendarios (por id). Se aplican sobre la location, DESPUÉS del cache.
  onlyCalendarIds?: string[];
  excludeCalendarIds?: string[];
};

// Calendario de Diagonal 77 que hoy vive dentro de la subcuenta de La Plata (Calle 10).
// TEMPORAL: hasta que los turnos/contactos se migren a la subcuenta MY-LP Diag 77
// (GHL_DIAG77_*) y la autoagenda apunte allí, diag77 se lee de La Plata filtrando este
// calendario, y calle10 lo excluye.
const EDIFICIO_B_DIAG77 = "4g2Z2btBt4XHjXCUzHP8";

type SourceDef = {
  locEnv: string;
  pitEnv: string;
  dniField: string | null;
  osField: string | null;
  obsField: string | null;
  fichaField: string | null;
  estadoCitaField?: string;
  badge?: string;
  onlyCalendarIds?: string[];
  excludeCalendarIds?: string[];
};

// Cada sucursal resuelve a una o más subcuentas GHL (sources).
const GHL_BY_SLUG: Record<string, SourceDef[]> = {
  caba: [
    {
      locEnv: "GHL_CABA_LOCATION_ID",
      pitEnv: "GHL_CABA_PIT",
      dniField: "rjdIgjhi3iPZFpRVDP7h",
      osField: "J1dLEUewkTaqVthYDOak",
      obsField: "RNgqB0yQSDM1LxeS7IRc",
      fichaField: "SP1rAdxTjKwrVa9Tougf",
      estadoCitaField: "qGZJCp60BtzNyipXIjvD",
    },
    {
      // IOMA CABA: subcuenta separada, misma recepción física. DNI (creado 21/09/2026,
      // igual que CABA → cruza con el check-in del tótem) + Obra Social + "Asistio al
      // turno" (estado de cita). No tiene Observaciones ni Ficha.
      locEnv: "GHL_IOMA_LOCATION_ID",
      pitEnv: "GHL_IOMA_PIT",
      dniField: "H1eh832d3XHWwQtzwmrH",
      osField: "DOmSLDrchwLP8zA0OMKr",
      obsField: null,
      fichaField: null,
      estadoCitaField: "OjqTwu3PvlbJq4AB8TOm",
      badge: "IOMA",
    },
  ],
  calle10: [
    {
      locEnv: "GHL_LAPLATA_LOCATION_ID",
      pitEnv: "GHL_LAPLATA_PIT",
      dniField: "KoiPTwrSvVz8ud5LKzBN",
      osField: "VoybEaSZn3agkMBk1MRU",
      obsField: "iPovCNTHMScBeLHsFAEc",
      fichaField: "jiuTQYHKyxQCheXjdq2t",
      excludeCalendarIds: [EDIFICIO_B_DIAG77],
    },
  ],
  diag77: [
    {
      locEnv: "GHL_LAPLATA_LOCATION_ID",
      pitEnv: "GHL_LAPLATA_PIT",
      dniField: "KoiPTwrSvVz8ud5LKzBN",
      osField: "VoybEaSZn3agkMBk1MRU",
      obsField: "iPovCNTHMScBeLHsFAEc",
      fichaField: "jiuTQYHKyxQCheXjdq2t",
      onlyCalendarIds: [EDIFICIO_B_DIAG77],
    },
  ],
};

// Todas las subcuentas GHL activas de una sucursal (las que tienen env cargado).
export function ghlSourcesForSlug(slug: string | null): GhlSource[] {
  if (!slug) return [];
  const defs = GHL_BY_SLUG[slug];
  if (!defs) return [];
  const out: GhlSource[] = [];
  for (const d of defs) {
    const locationId = process.env[d.locEnv];
    const pit = process.env[d.pitEnv];
    if (!locationId || !pit) continue;
    out.push({
      locationId,
      pit,
      dniField: d.dniField,
      osField: d.osField,
      obsField: d.obsField,
      fichaField: d.fichaField,
      estadoCitaField: d.estadoCitaField ?? null,
      badge: d.badge ?? null,
      onlyCalendarIds: d.onlyCalendarIds,
      excludeCalendarIds: d.excludeCalendarIds,
    });
  }
  return out;
}

// La subcuenta concreta a la que pertenece un turno (para las mutaciones, que tocan
// una location específica). Valida que la location pertenezca a la sucursal.
function sourceForLocation(slug: string | null, locationId: string): GhlSource | null {
  return ghlSourcesForSlug(slug).find((s) => s.locationId === locationId) ?? null;
}

// Ejecuta `fn` sobre `items` con un límite de concurrencia (evita disparar N
// requests a GHL en paralelo: La Plata tiene ~31 calendarios → riesgo de 429).
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const idx = next++;
      results[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

const GHL_BASE = "https://services.leadconnectorhq.com";

async function ghlFetch(pit: string, path: string, version = "2021-04-15"): Promise<any> {
  // GHL rate-limitea (429) en ráfagas; reintentar con backoff evita que un contacto/turno
  // quede sin resolver ("—") por un throttle transitorio. También reintenta 5xx.
  const maxIntentos = 3;
  for (let intento = 0; ; intento++) {
    const res = await fetch(`${GHL_BASE}${path}`, {
      headers: { Authorization: `Bearer ${pit}`, Version: version, "User-Agent": "curl/8.4.0" },
    });
    if (res.ok) return res.json();
    const retriable = res.status === 429 || res.status >= 500;
    if (!retriable || intento >= maxIntentos - 1)
      throw new Error(`GHL ${res.status} en ${path}`);
    const retryAfter = Number(res.headers.get("retry-after"));
    const esperaMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 400 * (intento + 1);
    await new Promise((r) => setTimeout(r, esperaMs));
  }
}

// Actualiza el estado de una cita en GHL (showed = asistió, noshow = ausente).
async function updateAppointmentStatus(cfg: GhlSource, eventId: string, status: string) {
  const res = await fetch(`${GHL_BASE}/calendars/events/appointments/${eventId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${cfg.pit}`,
      Version: "2021-04-15",
      "User-Agent": "curl/8.4.0",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ appointmentStatus: status }),
  });
  if (!res.ok) throw new Error(`No se pudo actualizar el turno en GHL (${res.status})`);
}

// Actualiza un custom field de un contacto en GHL.
async function updateContactField(cfg: GhlSource, contactId: string, fieldId: string, value: string) {
  const res = await fetch(`${GHL_BASE}/contacts/${contactId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${cfg.pit}`,
      Version: "2021-07-28",
      "User-Agent": "curl/8.4.0",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ customFields: [{ id: fieldId, value }] }),
  });
  if (!res.ok) throw new Error(`No se pudo actualizar el contacto en GHL (${res.status})`);
}

// Actualiza el contacto en GHL con un body arbitrario (datos base + custom fields).
async function updateContactFull(cfg: GhlSource, contactId: string, body: Record<string, unknown>) {
  const res = await fetch(`${GHL_BASE}/contacts/${contactId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${cfg.pit}`,
      Version: "2021-07-28",
      "User-Agent": "curl/8.4.0",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`No se pudo actualizar el contacto en GHL (${res.status})`);
}

// Actualiza una cita en GHL (reprogramación + estado). El body puede incluir calendarId,
// startTime, endTime, appointmentStatus.
async function updateAppointmentFull(cfg: GhlSource, eventId: string, body: Record<string, unknown>) {
  const res = await fetch(`${GHL_BASE}/calendars/events/appointments/${eventId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${cfg.pit}`,
      Version: "2021-04-15",
      "User-Agent": "curl/8.4.0",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`No se pudo actualizar el turno en GHL (${res.status})`);
}

// Agrega una nota al contacto en GHL (se usa para dejar registro del motivo de cancelación).
async function addContactNote(cfg: GhlSource, contactId: string, body: string) {
  const res = await fetch(`${GHL_BASE}/contacts/${contactId}/notes`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.pit}`,
      Version: "2021-07-28",
      "User-Agent": "curl/8.4.0",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ body }),
  });
  if (!res.ok) throw new Error(`No se pudo agregar la nota en GHL (${res.status})`);
}

export const onlyDigits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

// "HH:MM" (hora de Argentina) + fecha "YYYY-MM-DD" → Date. "" o null → null (limpia el valor).
function horaARaDate(fecha: string, hhmm: string | null | undefined): Date | null {
  const v = (hhmm ?? "").trim();
  if (!v) return null;
  return new Date(`${fecha}T${v}:00-03:00`);
}

// Espejo GHL → sistema: si la cita ya viene marcada en GHL, reflejarlo.
// showed (asistió) → finalizado; noshow (no asistió) → ausente; el resto no mapea.
export function estadoDesdeGhl(appointmentStatus: string | null | undefined): string | null {
  const s = (appointmentStatus ?? "").toLowerCase();
  if (s === "showed") return "finalizado";
  if (s === "noshow") return "ausente";
  return null;
}

// Cómo llegó el turno (createdBy.source de GHL) en lenguaje claro.
function origenLabel(source: string | null | undefined): string {
  const s = (source ?? "").toLowerCase();
  if (s.includes("book") || s.includes("widget") || s.includes("public")) return "Autoagenda";
  if (s === "contactdetails_page") return "Manual (ficha)";
  if (s.includes("calendar")) return "Manual (calendario)";
  if (s.includes("workflow") || s.includes("automation")) return "Automatización";
  if (s.includes("api") || s.includes("integration")) return "API";
  return source || "—";
}

// Calendarios de la location, cacheados en memoria ~5 min (id → nombre).
const calCache = new Map<string, { at: number; cals: { id: string; name: string }[] }>();
async function listCalendars(cfg: GhlSource): Promise<{ id: string; name: string }[]> {
  // El cache es por location y guarda la lista SIN filtrar (calle10 y diag77 comparten
  // location pero filtran distinto). El filtro por sucursal se aplica después.
  let all: { id: string; name: string }[];
  const hit = calCache.get(cfg.locationId);
  if (hit && Date.now() - hit.at < 5 * 60_000) {
    all = hit.cals;
  } else {
    const data = await ghlFetch(cfg.pit, `/calendars/?locationId=${cfg.locationId}`);
    all = (data.calendars ?? [])
      .filter((c: any) => c.isActive !== false)
      .map((c: any) => ({ id: c.id as string, name: (c.name as string) ?? "" }));
    calCache.set(cfg.locationId, { at: Date.now(), cals: all });
  }
  let cals = all;
  if (cfg.onlyCalendarIds) cals = cals.filter((c) => cfg.onlyCalendarIds!.includes(c.id));
  if (cfg.excludeCalendarIds) cals = cals.filter((c) => !cfg.excludeCalendarIds!.includes(c.id));
  return cals;
}

// Eventos de todos los calendarios de la location entre dos instantes (epoch ms).
// Base de `listDayEvents` (un día) y de las métricas por rango (un mes).
export async function listRangeEvents(cfg: GhlSource, startMs: number, endMs: number) {
  const cals = await listCalendars(cfg);
  const calName = new Map(cals.map((c) => [c.id, c.name]));
  // Un request de eventos por calendario (GHL no tiene "todos los eventos de la location").
  // Concurrencia moderada: GHL rate-limitea (429) con ráfagas altas → más paralelismo
  // termina siendo MÁS lento. 6 es el punto medido más estable.
  const perCal = await mapLimit(cals, 6, async (c) => {
    const data = await ghlFetch(
      cfg.pit,
      `/calendars/events?locationId=${cfg.locationId}&calendarId=${c.id}&startTime=${startMs}&endTime=${endMs}`,
    );
    return (data.events ?? []) as any[];
  });
  return perCal
    .flat()
    .filter((e) => e && e.deleted !== true && e.contactId)
    .map((e) => ({
      eventId: e.id as string,
      startTime: e.startTime as string,
      endTime: (e.endTime as string) ?? null,
      calendarId: e.calendarId as string,
      title: (e.title as string) ?? "",
      descripcion: (e.notes as string) ?? "",
      estadoGhl: (e.appointmentStatus as string) ?? "",
      contactId: e.contactId as string,
      profesional: calName.get(e.calendarId) ?? "",
      creadoPorUserId: (e.createdBy?.userId as string) ?? null,
      origen: origenLabel(e.createdBy?.source),
    }));
}

async function listDayEvents(cfg: GhlSource, fecha: string) {
  const start = new Date(`${fecha}T00:00:00-03:00`).getTime();
  const end = new Date(`${fecha}T23:59:59-03:00`).getTime();
  return listRangeEvents(cfg, start, end);
}

// Nombre + teléfono + DNI de los contactos (dedup + concurrencia acotada).
// Sin límite, un día con muchos turnos dispara N GETs simultáneos a GHL → rate-limit
// (429) y latencia. mapLimit(10) mantiene la carga rápida sin saturar la API.
export async function resolveContactos(cfg: GhlSource, ids: string[]) {
  const unique = [...new Set(ids)];
  const entries = await mapLimit(unique, 10, async (id) => {
      try {
        const data = await ghlFetch(cfg.pit, `/contacts/${id}`);
        const c = data.contact ?? {};
        const nombre = c.contactName || [c.firstName, c.lastName].filter(Boolean).join(" ") || "—";
        const dniField = (c.customFields ?? []).find((f: any) => f.id === cfg.dniField);
        const osField = (c.customFields ?? []).find((f: any) => f.id === cfg.osField);
        const obsField = (c.customFields ?? []).find((f: any) => f.id === cfg.obsField);
        const fichaField = (c.customFields ?? []).find((f: any) => f.id === cfg.fichaField);
        return [
          id,
          {
            nombre,
            firstName: c.firstName ?? null,
            lastName: c.lastName ?? null,
            email: c.email ?? null,
            telefono: c.phone ?? null,
            dni: dniField?.value ?? null,
            obraSocial: osField?.value ?? null,
            observaciones: obsField?.value ?? null,
            ficha: fichaField?.value ?? null,
          },
        ] as const;
      } catch {
        return [
          id,
          {
            nombre: "—",
            firstName: null,
            lastName: null,
            email: null,
            telefono: null,
            dni: null,
            obraSocial: null,
            observaciones: null,
            ficha: null,
          },
        ] as const;
      }
  });
  return new Map(entries);
}

// Nombre de los usuarios que agendaron (dedup + cache).
const userCache = new Map<string, string>();
async function resolveUsuarios(cfg: GhlSource, ids: (string | null)[]) {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  await Promise.all(
    unique
      .filter((id) => !userCache.has(id))
      .map(async (id) => {
        try {
          const data = await ghlFetch(cfg.pit, `/users/${id}`, "2021-07-28");
          const u = data.user ?? data ?? {};
          userCache.set(id, u.name || [u.firstName, u.lastName].filter(Boolean).join(" ") || "—");
        } catch {
          userCache.set(id, "—");
        }
      }),
  );
  return userCache;
}

// -------------------------------------------------------------------------
// Server functions
// -------------------------------------------------------------------------

// Formatea SIEMPRE en hora de Argentina: en prod el servidor corre en UTC y sin timeZone
// se mostrarían las horas +3 (turno GHL 11:00 → 14:00). Ver gotcha zona horaria.
const hhmmAR = (d: Date) =>
  d.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Argentina/Buenos_Aires",
  });

// Turnos cargados a mano (sin GHL) de una sucursal/fecha, con el mismo shape que los de GHL
// para poder fusionarlos en la tabla de Recepción.
async function cargarTurnosManuales(sucursalId: string, fecha: string) {
  const odontCargo = alias(odontologos, "odont_cargo");
  const rows = await db
    .select({
      id: turnosManuales.id,
      fecha: turnosManuales.fecha,
      hora: turnosManuales.hora,
      paciente: turnosManuales.pacienteNombre,
      dni: turnosManuales.dni,
      telefono: turnosManuales.telefono,
      motivo: turnosManuales.motivo,
      estado: turnosManuales.estado,
      tieneFicha: turnosManuales.tieneFicha,
      llegadaAt: turnosManuales.llegadaAt,
      salaAt: turnosManuales.salaAt,
      finalizadoAt: turnosManuales.finalizadoAt,
      retiroAt: turnosManuales.retiroAt,
      cancelMotivo: turnosManuales.cancelMotivo,
      obraSocialId: turnosManuales.obraSocialId,
      obraSocial: obrasSociales.nombre,
      odontologoId: turnosManuales.odontologoId,
      profesional: odontologos.nombre,
      odontologoACargoId: turnosManuales.odontologoACargoId,
      odontologoACargo: odontCargo.nombre,
      pisoId: turnosManuales.pisoId,
      prioridad: turnosManuales.prioridad,
      notasInternas: turnosManuales.notasInternas,
    })
    .from(turnosManuales)
    .leftJoin(obrasSociales, eq(turnosManuales.obraSocialId, obrasSociales.id))
    .leftJoin(odontologos, eq(turnosManuales.odontologoId, odontologos.id))
    .leftJoin(odontCargo, eq(turnosManuales.odontologoACargoId, odontCargo.id))
    .where(and(eq(turnosManuales.sucursalId, sucursalId), eq(turnosManuales.fecha, fecha)));
  return rows.map((m) => {
    // ST (sin hora): se ordena por su hora de llegada para intercalarse con los que tienen turno.
    const horaOrden = m.hora ?? (m.llegadaAt ? hhmmAR(new Date(m.llegadaAt)) : "00:00");
    return {
    tipo: "manual" as const,
    rowId: `manual:${m.id}`,
    id: m.id as string | null,
    eventId: null as string | null,
    contactId: null as string | null,
    calendarId: null as string | null,
    hora: m.hora,
    startTime: `${m.fecha}T${horaOrden}:00`,
    endTime: null as string | null,
    paciente: m.paciente,
    pacienteContacto: "—" as string | null,
    firstName: null as string | null,
    lastName: null as string | null,
    email: null as string | null,
    descripcion: null as string | null,
    dni: m.dni,
    telefono: m.telefono,
    obraSocialId: m.obraSocialId as string | null,
    obraSocial: m.obraSocial,
    observaciones: m.motivo,
    ficha: m.tieneFicha as string | null,
    odontologoId: m.odontologoId as string | null,
    profesional: m.profesional ?? "—",
    motivo: m.motivo,
    estadoGhl: null as string | null,
    agendadoPor: "—",
    origen: "Manual",
    ingresoTotem: false,
    llegadaEstado: null as string | null,
    llegadaHora: m.llegadaAt ? hhmmAR(new Date(m.llegadaAt)) : null,
    salaHora: m.salaAt ? hhmmAR(new Date(m.salaAt)) : null,
    finalizadoHora: m.finalizadoAt ? hhmmAR(new Date(m.finalizadoAt)) : null,
    retiroHora: m.retiroAt ? hhmmAR(new Date(m.retiroAt)) : null,
    cancelMotivo: m.cancelMotivo as string | null,
    odontologoACargoId: m.odontologoACargoId as string | null,
    odontologoACargo: m.odontologoACargo as string | null,
    pisoId: m.pisoId as string | null,
    prioridad: (m.prioridad ?? null) as number | null,
    notasInternas: (m.notasInternas ?? null) as string | null,
    contactoUrl: null as string | null,
    estado: m.estado,
    };
  });
}

// Cache SWR de la parte cara de GHL (eventos + contactos + usuarios resueltos) por
// sucursal+fecha. TTL corto: la 1ª carga pega a GHL (~5s), las siguientes salen del
// cache (<0.5s) — también para otros recepcionistas. El estado local (marcas, llegadas
// de Neon) NO se cachea: se mergea fresco en cada carga, así el feedback al marcar un
// estado es inmediato. `force` (botón Actualizar) saltea el cache.
type CrudoGhl = {
  locationId: string;
  badge: string | null;
  e: Awaited<ReturnType<typeof listDayEvents>>[number];
  c: Awaited<ReturnType<typeof resolveContactos>> extends Map<string, infer V> ? V | undefined : never;
  agendadoPor: string;
};
const ghlDayCache = new Map<string, { at: number; crudos: CrudoGhl[] }>();
const GHL_DAY_TTL = 60_000;

async function crudosGhlDelDia(
  sources: GhlSource[],
  fecha: string,
  cacheKey: string,
  force: boolean,
): Promise<CrudoGhl[]> {
  const hit = ghlDayCache.get(cacheKey);
  if (!force && hit && Date.now() - hit.at < GHL_DAY_TTL) return hit.crudos;
  // Las subcuentas (CABA + IOMA) se consultan EN SERIE a propósito: en paralelo se
  // duplica la concurrencia contra GHL y salta el rate-limit (429).
  const crudos: CrudoGhl[] = [];
  for (const source of sources) {
    const eventos = await listDayEvents(source, fecha);
    const [contactos, usuarios] = await Promise.all([
      resolveContactos(
        source,
        eventos.map((e) => e.contactId),
      ),
      resolveUsuarios(
        source,
        eventos.map((e) => e.creadoPorUserId),
      ),
    ]);
    for (const e of eventos) {
      crudos.push({
        locationId: source.locationId,
        badge: source.badge,
        e,
        c: contactos.get(e.contactId),
        agendadoPor: e.creadoPorUserId ? (usuarios.get(e.creadoPorUserId) ?? "—") : "—",
      });
    }
  }
  ghlDayCache.set(cacheKey, { at: Date.now(), crudos });
  return crudos;
}

export const getTurnosDelDia = createServerFn({ method: "GET" })
  .inputValidator((i: unknown) =>
    z
      .object({
        sucursalId: z.string().uuid(),
        fecha: z.string(),
        // Botón "Actualizar": saltea el cache SWR y vuelve a pegar a GHL.
        force: z.boolean().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    const ctx = await requireAuth();
    if (!ctx.sucursalIds.includes(data.sucursalId)) {
      return { soportado: false as const, turnos: [] };
    }
    // Turnos manuales: siempre, tenga o no GHL la sucursal.
    const manuales = await cargarTurnosManuales(data.sucursalId, data.fecha);

    const [suc] = await db
      .select({ slug: sucursales.slug })
      .from(sucursales)
      .where(eq(sucursales.id, data.sucursalId))
      .limit(1);
    const sources = ghlSourcesForSlug(suc?.slug ?? null);
    if (sources.length === 0) {
      return {
        soportado: false as const,
        turnos: [...manuales].sort((a, b) => a.startTime.localeCompare(b.startTime)),
      };
    }

    // Parte cara de GHL (eventos + contactos de CABA e IOMA), cacheada 60s por
    // sucursal+fecha. El estado local se mergea fresco abajo.
    const crudos = await crudosGhlDelDia(
      sources,
      data.fecha,
      `${data.sucursalId}:${data.fecha}`,
      data.force ?? false,
    );

    // Estados de flujo ya marcados localmente.
    const ids = crudos.map((r) => r.e.eventId);
    const marcadas = ids.length
      ? await db
          .select({
            eventId: turnoAsistencias.ghlEventId,
            estado: turnoAsistencias.estado,
            salaAt: turnoAsistencias.salaAt,
            llegadaAt: turnoAsistencias.llegadaAt,
            finalizadoAt: turnoAsistencias.finalizadoAt,
            retiroAt: turnoAsistencias.retiroAt,
            cancelMotivo: turnoAsistencias.cancelMotivo,
            odontologoACargoId: turnoAsistencias.odontologoACargoId,
            pisoId: turnoAsistencias.pisoId,
            prioridad: turnoAsistencias.prioridad,
            notasInternas: turnoAsistencias.notasInternas,
          })
          .from(turnoAsistencias)
          .where(inArray(turnoAsistencias.ghlEventId, ids))
      : [];
    const estadoMap = new Map(marcadas.map((m) => [m.eventId, m.estado]));
    const salaMap = new Map(marcadas.map((m) => [m.eventId, m.salaAt]));
    const finMap = new Map(marcadas.map((m) => [m.eventId, m.finalizadoAt]));
    const retiroMap = new Map(marcadas.map((m) => [m.eventId, m.retiroAt]));
    const cancelMotivoMap = new Map(marcadas.map((m) => [m.eventId, m.cancelMotivo]));
    const llegadaOverrideMap = new Map(marcadas.map((m) => [m.eventId, m.llegadaAt]));
    const aCargoMap = new Map(marcadas.map((m) => [m.eventId, m.odontologoACargoId]));
    const pisoMap = new Map(marcadas.map((m) => [m.eventId, m.pisoId]));
    const prioridadMap = new Map(marcadas.map((m) => [m.eventId, m.prioridad]));
    const notasMap = new Map(marcadas.map((m) => [m.eventId, m.notasInternas]));

    // Nombres de odontólogos de la sucursal (para resolver el "a cargo" por id).
    const odontRows = await db
      .select({ id: odontologos.id, nombre: odontologos.nombre })
      .from(odontologos)
      .where(eq(odontologos.sucursalId, data.sucursalId));
    const odontNombre = new Map(odontRows.map((o) => [o.id, o.nombre]));

    // Llegadas del tótem de esa fecha/sucursal, indexadas por DNI (estado + hora de check-in).
    const dayStart = new Date(`${data.fecha}T00:00:00-03:00`);
    const dayEnd = new Date(`${data.fecha}T23:59:59-03:00`);
    const llegadas = await db
      .select({ dni: arrivals.dni, estado: arrivals.estado, createdAt: arrivals.createdAt })
      .from(arrivals)
      .where(
        and(
          eq(arrivals.sucursalId, data.sucursalId),
          gte(arrivals.createdAt, dayStart),
          lte(arrivals.createdAt, dayEnd),
        ),
      );
    const llegadaPorDni = new Map(llegadas.map((l) => [onlyDigits(l.dni), l]));

    const turnosGhl = crudos.map(({ locationId, badge, e, c, agendadoPor }) => {
        const dni = c?.dni ? String(c.dni) : null;
        const hora = hhmmAR(new Date(e.startTime));
        const llegada = dni ? (llegadaPorDni.get(onlyDigits(dni)) ?? null) : null;
        const ingresoTotem = llegada !== null;
        // Estado efectivo, por prioridad: marca local del sistema → check-in del tótem
        // ("en_recepcion") → espejo del estado de GHL (showed/noshow) → sin marcar.
        const estado =
          estadoMap.get(e.eventId) ??
          (ingresoTotem ? "en_recepcion" : estadoDesdeGhl(e.estadoGhl));
        const salaAt = salaMap.get(e.eventId) ?? null;
        const finAt = finMap.get(e.eventId) ?? null;
        const retiroAt = retiroMap.get(e.eventId) ?? null;
        const llegadaOverride = llegadaOverrideMap.get(e.eventId) ?? null;
        // Prioridad: el check-in del tótem es la hora de llegada real; si no hubo, se usa
        // la que estampó el marcado en recepción o la edición manual (llegadaOverride).
        const llegadaFecha = (llegada ? llegada.createdAt : null) ?? llegadaOverride;
        const aCargoId = aCargoMap.get(e.eventId) ?? null;
        return {
          tipo: "ghl" as const,
          rowId: `ghl:${e.eventId}`,
          id: e.eventId as string | null,
          eventId: e.eventId as string | null,
          contactId: e.contactId as string | null,
          calendarId: e.calendarId as string | null,
          // Subcuenta de origen del turno: la usan las mutaciones para tocar la location
          // correcta; el badge distingue el origen en la tabla.
          locationId,
          origenSub: badge,
          hora,
          startTime: e.startTime,
          endTime: e.endTime,
          paciente: e.title || c?.nombre || "—",
          pacienteContacto: c?.nombre ?? "—",
          firstName: c?.firstName ?? null,
          lastName: c?.lastName ?? null,
          email: c?.email ?? null,
          descripcion: e.descripcion || null,
          dni,
          telefono: c?.telefono ?? null,
          obraSocial: c?.obraSocial ?? null,
          observaciones: c?.observaciones ?? null,
          ficha: c?.ficha ?? null,
          profesional: e.profesional,
          motivo: e.title,
          estadoGhl: e.estadoGhl,
          agendadoPor,
          origen: e.origen,
          ingresoTotem,
          llegadaEstado: llegada?.estado ?? null,
          llegadaHora: llegadaFecha ? hhmmAR(new Date(llegadaFecha)) : null,
          salaHora: salaAt ? hhmmAR(new Date(salaAt)) : null,
          finalizadoHora: finAt ? hhmmAR(new Date(finAt)) : null,
          retiroHora: retiroAt ? hhmmAR(new Date(retiroAt)) : null,
          cancelMotivo: cancelMotivoMap.get(e.eventId) ?? null,
          odontologoACargoId: aCargoId,
          odontologoACargo: aCargoId ? (odontNombre.get(aCargoId) ?? null) : null,
          pisoId: pisoMap.get(e.eventId) ?? null,
          prioridad: prioridadMap.get(e.eventId) ?? null,
          notasInternas: notasMap.get(e.eventId) ?? null,
          contactoUrl: `https://app.gohighlevel.com/v2/location/${locationId}/contacts/detail/${e.contactId}`,
          estado,
        };
      });

    // Orden base: prioridad (1=alta … 3=baja, sin prioridad al final) y luego por hora.
    const prioRank = (t: { prioridad: number | null }) => t.prioridad ?? 99;
    const turnos = [...turnosGhl, ...manuales].sort(
      (a, b) => prioRank(a) - prioRank(b) || a.startTime.localeCompare(b.startTime),
    );

    return { soportado: true as const, turnos };
  });

// Resumen liviano para el Inicio: turnos del día (solo conteo, sin resolver contactos)
// + llegadas del tótem (pendientes / atendidas).
export const getResumenRecepcion = createServerFn({ method: "GET" })
  .inputValidator((i: unknown) =>
    z.object({ sucursalId: z.string().uuid(), fecha: z.string() }).parse(i),
  )
  .handler(async ({ data }) => {
    const ctx = await requireAuth();
    if (!ctx.sucursalIds.includes(data.sucursalId)) {
      return { turnos: null, llegadasPendientes: 0, llegadasAtendidas: 0, llegadasTotal: 0 };
    }
    const dayStart = new Date(`${data.fecha}T00:00:00-03:00`);
    const dayEnd = new Date(`${data.fecha}T23:59:59-03:00`);
    const llegadas = await db
      .select({ estado: arrivals.estado })
      .from(arrivals)
      .where(
        and(
          eq(arrivals.sucursalId, data.sucursalId),
          gte(arrivals.createdAt, dayStart),
          lte(arrivals.createdAt, dayEnd),
        ),
      );
    const [suc] = await db
      .select({ slug: sucursales.slug })
      .from(sucursales)
      .where(eq(sucursales.id, data.sucursalId))
      .limit(1);
    const sources = ghlSourcesForSlug(suc?.slug ?? null);
    let turnos: number | null = null;
    if (sources.length > 0) {
      try {
        const counts = await Promise.all(
          sources.map(async (source) => (await listDayEvents(source, data.fecha)).length),
        );
        turnos = counts.reduce((a, b) => a + b, 0);
      } catch {
        turnos = null;
      }
    }
    return {
      turnos,
      llegadasTotal: llegadas.length,
      llegadasPendientes: llegadas.filter((l) => l.estado === "Pendiente").length,
      llegadasAtendidas: llegadas.filter((l) => l.estado === "Atendido").length,
    };
  });

// Estados marcables desde el selector de Recepción. "cancelado" NO va acá: se escribe por
// cancelarTurno* (lleva motivo y mapea a GHL cancelled), no por el marcado rápido.
const ESTADO_TURNO = ["en_recepcion", "en_consultorio", "finalizado", "ausente", "se_retiro"] as const;
const ESTADO_LABEL: Record<string, string> = {
  en_recepcion: "En recepción",
  en_consultorio: "En sala",
  finalizado: "Finalizado",
  ausente: "Ausente",
  se_retiro: "Se retiró",
  cancelado: "Cancelado",
};

export const marcarEstadoTurno = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z
      .object({
        eventId: z.string().min(1),
        contactId: z.string().min(1),
        sucursalId: z.string().uuid(),
        locationId: z.string().min(1),
        fecha: z.string(),
        estado: z.enum(ESTADO_TURNO),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    const ctx = await requireAuth();
    if (!ctx.sucursalIds.includes(data.sucursalId)) {
      throw new Error("No tenés acceso a esa sucursal");
    }
    // Espejo hacia GHL: cualquier estado de asistencia (en recepción / en sala / finalizado)
    // marca la cita como "showed" (asistió); "ausente" la marca "noshow". Así el estado del
    // sistema y el de GHL quedan siempre reflejados.
    const ghlStatus = data.estado === "ausente" ? "noshow" : "showed";
    const [suc] = await db
      .select({ slug: sucursales.slug })
      .from(sucursales)
      .where(eq(sucursales.id, data.sucursalId))
      .limit(1);
    const cfg = sourceForLocation(suc?.slug ?? null, data.locationId);
    if (cfg) {
      await updateAppointmentStatus(cfg, data.eventId, ghlStatus);
      // El workflow de recupero de inasistidos evalúa el custom field "Estado de la cita"
      // (no el appointmentStatus nativo). Lo espejamos acá para que no dispare el mensaje de
      // "no asistió" a quien la recepción marcó presente.
      if (cfg.estadoCitaField) {
        await updateContactField(
          cfg,
          data.contactId,
          cfg.estadoCitaField,
          data.estado === "ausente" ? "No Asistido" : "Asistido",
        );
      }
    }
    // Timestamps del flujo. Se estampan al marcar cada estado y NO se pisan después
    // (coalesce mantiene el primero). La hora de LLEGADA se registra en cualquier estado
    // de presencia (recepción / sala / finalizado / retiro): antes solo la dejaba el
    // check-in del tótem, así que los turnos marcados a mano quedaban sin hora de llegada.
    // "ausente" y "cancelado" no cuentan como llegada.
    const PRESENCIA: string[] = ["en_recepcion", "en_consultorio", "finalizado", "se_retiro"];
    const llegadaAhora = PRESENCIA.includes(data.estado) ? new Date() : null;
    const salaAhora = data.estado === "en_consultorio" ? new Date() : null;
    const finAhora = data.estado === "finalizado" ? new Date() : null;
    const retiroAhora = data.estado === "se_retiro" ? new Date() : null;
    await db
      .insert(turnoAsistencias)
      .values({
        ghlEventId: data.eventId,
        sucursalId: data.sucursalId,
        fecha: data.fecha,
        asistio: data.estado === "finalizado",
        estado: data.estado,
        llegadaAt: llegadaAhora,
        salaAt: salaAhora,
        finalizadoAt: finAhora,
        retiroAt: retiroAhora,
        marcadoPor: ctx.userId,
      })
      .onConflictDoUpdate({
        target: turnoAsistencias.ghlEventId,
        set: {
          asistio: data.estado === "finalizado",
          estado: data.estado,
          llegadaAt: sql`coalesce(${turnoAsistencias.llegadaAt}, ${llegadaAhora ? llegadaAhora.toISOString() : null})`,
          salaAt: sql`coalesce(${turnoAsistencias.salaAt}, ${salaAhora ? salaAhora.toISOString() : null})`,
          finalizadoAt: sql`coalesce(${turnoAsistencias.finalizadoAt}, ${finAhora ? finAhora.toISOString() : null})`,
          retiroAt: sql`coalesce(${turnoAsistencias.retiroAt}, ${retiroAhora ? retiroAhora.toISOString() : null})`,
          marcadoPor: ctx.userId,
          updatedAt: new Date(),
        },
      });
    await logAudit(ctx, {
      action: "update",
      resource: "asistencia",
      entityId: data.eventId,
      resumen: `Marcó turno: ${ESTADO_LABEL[data.estado] ?? data.estado}`,
      sucursalId: data.sucursalId,
    });
    return { ok: true };
  });

// Cancela un turno de GHL: marca la cita "cancelled" y (si hay motivo) deja una nota en el
// contacto. Localmente guarda estado "cancelado" + el motivo. El motivo es opcional.
export const cancelarTurnoGhl = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z
      .object({
        eventId: z.string().min(1),
        contactId: z.string().min(1),
        sucursalId: z.string().uuid(),
        locationId: z.string().min(1),
        fecha: z.string(),
        motivo: z.string().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    const ctx = await requireAuth();
    if (!ctx.sucursalIds.includes(data.sucursalId)) {
      throw new Error("No tenés acceso a esa sucursal");
    }
    const motivo = data.motivo?.trim() || null;
    const [suc] = await db
      .select({ slug: sucursales.slug })
      .from(sucursales)
      .where(eq(sucursales.id, data.sucursalId))
      .limit(1);
    const cfg = sourceForLocation(suc?.slug ?? null, data.locationId);
    if (cfg) {
      await updateAppointmentStatus(cfg, data.eventId, "cancelled");
      if (motivo) await addContactNote(cfg, data.contactId, `Turno cancelado desde recepción: ${motivo}`);
    }
    await db
      .insert(turnoAsistencias)
      .values({
        ghlEventId: data.eventId,
        sucursalId: data.sucursalId,
        fecha: data.fecha,
        asistio: false,
        estado: "cancelado",
        cancelMotivo: motivo,
        marcadoPor: ctx.userId,
      })
      .onConflictDoUpdate({
        target: turnoAsistencias.ghlEventId,
        set: {
          asistio: false,
          estado: "cancelado",
          cancelMotivo: motivo,
          marcadoPor: ctx.userId,
          updatedAt: new Date(),
        },
      });
    await logAudit(ctx, {
      action: "update",
      resource: "asistencia",
      entityId: data.eventId,
      resumen: motivo ? `Canceló el turno: ${motivo}` : "Canceló el turno",
      sucursalId: data.sucursalId,
    });
    return { ok: true };
  });

// Cancela un turno manual (sin GHL): estado "cancelado" + motivo opcional local.
export const cancelarTurnoManual = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z.object({ id: z.string().uuid(), motivo: z.string().optional() }).parse(i),
  )
  .handler(async ({ data }) => {
    const ctx = await requireAuth();
    const [t] = await db
      .select({ sucursalId: turnosManuales.sucursalId })
      .from(turnosManuales)
      .where(eq(turnosManuales.id, data.id))
      .limit(1);
    if (!t) throw new Error("Turno no encontrado");
    if (!ctx.sucursalIds.includes(t.sucursalId)) {
      throw new Error("No tenés acceso a esa sucursal");
    }
    const motivo = data.motivo?.trim() || null;
    await db
      .update(turnosManuales)
      .set({ estado: "cancelado", cancelMotivo: motivo, marcadoPor: ctx.userId, updatedAt: new Date() })
      .where(eq(turnosManuales.id, data.id));
    await logAudit(ctx, {
      action: "update",
      resource: "turno_manual",
      entityId: data.id,
      resumen: motivo ? `Canceló el turno manual: ${motivo}` : "Canceló el turno manual",
      sucursalId: t.sucursalId,
    });
    return { ok: true };
  });

// Odontólogo que realmente atendió un turno de GHL (cuando difiere del de la agenda).
// Guarda un override local en turno_asistencias; null = vuelve al de la agenda.
export const setOdontologoACargoTurno = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z
      .object({
        eventId: z.string().min(1),
        sucursalId: z.string().uuid(),
        fecha: z.string(),
        odontologoACargoId: z.string().uuid().nullable(),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    const ctx = await requireAuth();
    if (!ctx.sucursalIds.includes(data.sucursalId)) {
      throw new Error("No tenés acceso a esa sucursal");
    }
    await db
      .insert(turnoAsistencias)
      .values({
        ghlEventId: data.eventId,
        sucursalId: data.sucursalId,
        fecha: data.fecha,
        odontologoACargoId: data.odontologoACargoId,
        marcadoPor: ctx.userId,
      })
      .onConflictDoUpdate({
        target: turnoAsistencias.ghlEventId,
        set: { odontologoACargoId: data.odontologoACargoId, updatedAt: new Date() },
      });
    await logAudit(ctx, {
      action: "update",
      resource: "asistencia",
      entityId: data.eventId,
      resumen: "Cambió el odontólogo a cargo del turno",
      sucursalId: data.sucursalId,
    });
    return { ok: true };
  });

// Override de piso de un turno de GHL (editable inline en la tabla). null = piso del odontólogo.
export const setPisoTurno = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z
      .object({
        eventId: z.string().min(1),
        sucursalId: z.string().uuid(),
        fecha: z.string(),
        pisoId: z.string().uuid().nullable(),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    const ctx = await requireAuth();
    if (!ctx.sucursalIds.includes(data.sucursalId)) {
      throw new Error("No tenés acceso a esa sucursal");
    }
    await db
      .insert(turnoAsistencias)
      .values({
        ghlEventId: data.eventId,
        sucursalId: data.sucursalId,
        fecha: data.fecha,
        pisoId: data.pisoId,
        marcadoPor: ctx.userId,
      })
      .onConflictDoUpdate({
        target: turnoAsistencias.ghlEventId,
        set: { pisoId: data.pisoId, updatedAt: new Date() },
      });
    await logAudit(ctx, {
      action: "update",
      resource: "asistencia",
      entityId: data.eventId,
      resumen: "Cambió el piso del turno",
      sucursalId: data.sucursalId,
    });
    return { ok: true };
  });

// Override de piso de un turno manual (editable inline en la tabla).
export const setPisoManual = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z.object({ id: z.string().uuid(), pisoId: z.string().uuid().nullable() }).parse(i),
  )
  .handler(async ({ data }) => {
    const ctx = await requireAuth();
    const [t] = await db
      .select({ sucursalId: turnosManuales.sucursalId })
      .from(turnosManuales)
      .where(eq(turnosManuales.id, data.id))
      .limit(1);
    if (!t) throw new Error("Turno no encontrado");
    if (!ctx.sucursalIds.includes(t.sucursalId)) {
      throw new Error("No tenés acceso a esa sucursal");
    }
    await db
      .update(turnosManuales)
      .set({ pisoId: data.pisoId, marcadoPor: ctx.userId, updatedAt: new Date() })
      .where(eq(turnosManuales.id, data.id));
    await logAudit(ctx, {
      action: "update",
      resource: "turno_manual",
      entityId: data.id,
      resumen: "Cambió el piso del turno manual",
      sucursalId: t.sucursalId,
    });
    return { ok: true };
  });

// Prioridad de atención de un turno de GHL (editable inline en la tabla). 1=alta, 2=media,
// 3=baja, null=sin prioridad. Ordena la lista para que recepción atienda por urgencia.
export const setPrioridadTurno = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z
      .object({
        eventId: z.string().min(1),
        sucursalId: z.string().uuid(),
        fecha: z.string(),
        prioridad: z.number().int().min(1).max(3).nullable(),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    const ctx = await requireAuth();
    if (!ctx.sucursalIds.includes(data.sucursalId)) {
      throw new Error("No tenés acceso a esa sucursal");
    }
    await db
      .insert(turnoAsistencias)
      .values({
        ghlEventId: data.eventId,
        sucursalId: data.sucursalId,
        fecha: data.fecha,
        prioridad: data.prioridad,
        marcadoPor: ctx.userId,
      })
      .onConflictDoUpdate({
        target: turnoAsistencias.ghlEventId,
        set: { prioridad: data.prioridad, updatedAt: new Date() },
      });
    return { ok: true };
  });

// Prioridad de atención de un turno manual (editable inline en la tabla).
export const setPrioridadManual = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z
      .object({ id: z.string().uuid(), prioridad: z.number().int().min(1).max(3).nullable() })
      .parse(i),
  )
  .handler(async ({ data }) => {
    const ctx = await requireAuth();
    const [t] = await db
      .select({ sucursalId: turnosManuales.sucursalId })
      .from(turnosManuales)
      .where(eq(turnosManuales.id, data.id))
      .limit(1);
    if (!t) throw new Error("Turno no encontrado");
    if (!ctx.sucursalIds.includes(t.sucursalId)) {
      throw new Error("No tenés acceso a esa sucursal");
    }
    await db
      .update(turnosManuales)
      .set({ prioridad: data.prioridad, marcadoPor: ctx.userId, updatedAt: new Date() })
      .where(eq(turnosManuales.id, data.id));
    return { ok: true };
  });

// Notas internas de recepción de un turno de GHL (editable inline / en el modal). Propias del
// sistema: NO se escriben en GHL ni tocan descripción/observaciones del contacto.
export const setNotasInternasTurno = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z
      .object({
        eventId: z.string().min(1),
        sucursalId: z.string().uuid(),
        fecha: z.string(),
        notasInternas: z.string().nullable(),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    const ctx = await requireAuth();
    if (!ctx.sucursalIds.includes(data.sucursalId)) {
      throw new Error("No tenés acceso a esa sucursal");
    }
    const valor = data.notasInternas?.trim() || null;
    await db
      .insert(turnoAsistencias)
      .values({
        ghlEventId: data.eventId,
        sucursalId: data.sucursalId,
        fecha: data.fecha,
        notasInternas: valor,
        marcadoPor: ctx.userId,
      })
      .onConflictDoUpdate({
        target: turnoAsistencias.ghlEventId,
        set: { notasInternas: valor, updatedAt: new Date() },
      });
    return { ok: true };
  });

// Notas internas de recepción de un turno manual.
export const setNotasInternasManual = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z.object({ id: z.string().uuid(), notasInternas: z.string().nullable() }).parse(i),
  )
  .handler(async ({ data }) => {
    const ctx = await requireAuth();
    const [t] = await db
      .select({ sucursalId: turnosManuales.sucursalId })
      .from(turnosManuales)
      .where(eq(turnosManuales.id, data.id))
      .limit(1);
    if (!t) throw new Error("Turno no encontrado");
    if (!ctx.sucursalIds.includes(t.sucursalId)) {
      throw new Error("No tenés acceso a esa sucursal");
    }
    await db
      .update(turnosManuales)
      .set({ notasInternas: data.notasInternas?.trim() || null, marcadoPor: ctx.userId, updatedAt: new Date() })
      .where(eq(turnosManuales.id, data.id));
    return { ok: true };
  });

// Edición completa de un turno de GHL desde el modal: datos del contacto + custom fields,
// reprogramación de la cita (start/end en GHL) y campos locales (estado, a cargo, horas).
export const actualizarTurnoGhl = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z
      .object({
        eventId: z.string().min(1),
        contactId: z.string().min(1),
        sucursalId: z.string().uuid(),
        locationId: z.string().min(1),
        fecha: z.string(),
        calendarId: z.string().nullable().optional(),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        telefono: z.string().optional(),
        email: z.string().optional(),
        dni: z.string().optional(),
        obraSocial: z.string().optional(),
        observaciones: z.string().optional(),
        ficha: z.string().optional(),
        startTime: z.string().nullable().optional(),
        endTime: z.string().nullable().optional(),
        estado: z.enum(ESTADO_TURNO).nullable().optional(),
        odontologoACargoId: z.string().uuid().nullable().optional(),
        pisoId: z.string().uuid().nullable().optional(),
        llegadaHora: z.string().optional(),
        salaHora: z.string().optional(),
        finalizadoHora: z.string().optional(),
        retiroHora: z.string().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    const ctx = await requireAuth();
    if (!ctx.sucursalIds.includes(data.sucursalId)) {
      throw new Error("No tenés acceso a esa sucursal");
    }
    const [suc] = await db
      .select({ slug: sucursales.slug })
      .from(sucursales)
      .where(eq(sucursales.id, data.sucursalId))
      .limit(1);
    const cfg = sourceForLocation(suc?.slug ?? null, data.locationId);
    if (!cfg) throw new Error("Sucursal sin GHL configurado");

    // 1) Contacto: datos base + custom fields. Solo se escriben los custom fields que la
    // subcuenta tenga (IOMA, p. ej., no tiene DNI/Observaciones/Ficha).
    const customFields: { id: string; value: string }[] = [];
    if (data.dni !== undefined && cfg.dniField)
      customFields.push({ id: cfg.dniField, value: data.dni });
    if (data.obraSocial !== undefined && cfg.osField)
      customFields.push({ id: cfg.osField, value: data.obraSocial });
    if (data.observaciones !== undefined && cfg.obsField)
      customFields.push({ id: cfg.obsField, value: data.observaciones });
    if (data.ficha !== undefined && cfg.fichaField)
      customFields.push({ id: cfg.fichaField, value: data.ficha });
    const contactBody: Record<string, unknown> = {};
    if (data.firstName !== undefined) contactBody.firstName = data.firstName;
    if (data.lastName !== undefined) contactBody.lastName = data.lastName;
    if (data.telefono !== undefined) contactBody.phone = data.telefono;
    if (data.email !== undefined) contactBody.email = data.email;
    if (customFields.length) contactBody.customFields = customFields;
    if (Object.keys(contactBody).length) await updateContactFull(cfg, data.contactId, contactBody);

    // 2) Cita: reprograma (start/end) y/o estado.
    const apptBody: Record<string, unknown> = {};
    if (data.startTime) {
      apptBody.startTime = data.startTime;
      if (data.endTime) apptBody.endTime = data.endTime;
      if (data.calendarId) apptBody.calendarId = data.calendarId;
    }
    if (data.estado) apptBody.appointmentStatus = data.estado === "ausente" ? "noshow" : "showed";
    if (Object.keys(apptBody).length) await updateAppointmentFull(cfg, data.eventId, apptBody);
    // Espejar el custom field "Estado de la cita" que lee el workflow de recupero de inasistidos
    // (mismo motivo que en marcarEstadoTurno). Sin esto, corregir la asistencia desde la edición
    // dejaba el appointmentStatus en "showed" pero el field en "No Asistido", y el paciente que
    // sí asistió recibía igual el mensaje de "no asistió" al día siguiente.
    if (data.estado && cfg.estadoCitaField) {
      await updateContactField(
        cfg,
        data.contactId,
        cfg.estadoCitaField,
        data.estado === "ausente" ? "No Asistido" : "Asistido",
      );
    }

    // 3) Local: estado + a cargo + horas (edición explícita, se pisan).
    const llegadaAt =
      data.llegadaHora !== undefined ? horaARaDate(data.fecha, data.llegadaHora) : undefined;
    const salaAt = data.salaHora !== undefined ? horaARaDate(data.fecha, data.salaHora) : undefined;
    const finalizadoAt =
      data.finalizadoHora !== undefined ? horaARaDate(data.fecha, data.finalizadoHora) : undefined;
    const retiroAt =
      data.retiroHora !== undefined ? horaARaDate(data.fecha, data.retiroHora) : undefined;
    const setFields: Record<string, unknown> = { marcadoPor: ctx.userId, updatedAt: new Date() };
    if (data.estado) {
      setFields.estado = data.estado;
      setFields.asistio = data.estado === "finalizado";
    }
    if (data.odontologoACargoId !== undefined) setFields.odontologoACargoId = data.odontologoACargoId;
    if (data.pisoId !== undefined) setFields.pisoId = data.pisoId;
    if (llegadaAt !== undefined) setFields.llegadaAt = llegadaAt;
    if (salaAt !== undefined) setFields.salaAt = salaAt;
    if (finalizadoAt !== undefined) setFields.finalizadoAt = finalizadoAt;
    if (retiroAt !== undefined) setFields.retiroAt = retiroAt;
    await db
      .insert(turnoAsistencias)
      .values({
        ghlEventId: data.eventId,
        sucursalId: data.sucursalId,
        fecha: data.fecha,
        estado: data.estado ?? null,
        asistio: data.estado === "finalizado",
        odontologoACargoId: data.odontologoACargoId ?? null,
        pisoId: data.pisoId ?? null,
        llegadaAt: llegadaAt ?? null,
        salaAt: salaAt ?? null,
        finalizadoAt: finalizadoAt ?? null,
        retiroAt: retiroAt ?? null,
        marcadoPor: ctx.userId,
      })
      .onConflictDoUpdate({ target: turnoAsistencias.ghlEventId, set: setFields });

    await logAudit(ctx, {
      action: "update",
      resource: "asistencia",
      entityId: data.eventId,
      resumen: "Editó el turno (datos del paciente / cita)",
      sucursalId: data.sucursalId,
    });
    return { ok: true };
  });

// Actualiza el campo "Ficha" (Tiene ficha / No tiene ficha) del contacto en GHL.
const FICHA_VALORES = ["Tiene Ficha", "No tiene ficha"] as const;

export const actualizarFichaContacto = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z
      .object({
        sucursalId: z.string().uuid(),
        locationId: z.string().min(1),
        contactId: z.string().min(1),
        valor: z.enum(FICHA_VALORES),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    const ctx = await requireAuth();
    if (!ctx.sucursalIds.includes(data.sucursalId)) {
      throw new Error("No tenés acceso a esa sucursal");
    }
    const [suc] = await db
      .select({ slug: sucursales.slug })
      .from(sucursales)
      .where(eq(sucursales.id, data.sucursalId))
      .limit(1);
    const cfg = sourceForLocation(suc?.slug ?? null, data.locationId);
    if (!cfg) throw new Error("Esta sucursal no tiene GHL configurado");
    if (!cfg.fichaField)
      throw new Error("Esta subcuenta no tiene el campo Ficha (p. ej. IOMA)");
    await updateContactField(cfg, data.contactId, cfg.fichaField, data.valor);
    await logAudit(ctx, {
      action: "update",
      resource: "ficha",
      entityId: data.contactId,
      resumen: `Marcó ficha: ${data.valor}`,
      sucursalId: data.sucursalId,
    });
    return { ok: true };
  });

// -------------------------------------------------------------------------
// Turnos manuales (sin GHL). Se cargan a mano y se listan junto a los de GHL.
// -------------------------------------------------------------------------

const dniField = z
  .string()
  .refine((v) => isValidDni(v), "DNI inválido (6 a 9 dígitos)")
  .transform((v) => normalizeDni(v));

export const crearTurnoManual = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z
      .object({
        sucursalId: z.string().uuid(),
        fecha: z.string(),
        // null = ST (sin turno): urgencia sin horario, se atiende por orden de llegada.
        hora: z
          .string()
          .regex(/^\d{2}:\d{2}$/, "Hora inválida")
          .optional()
          .nullable(),
        pacienteNombre: z.string().trim().min(1, "Falta el nombre del paciente"),
        dni: dniField,
        telefono: z.string().trim().optional().nullable(),
        obraSocialId: z.string().uuid().optional().nullable(),
        odontologoId: z.string().uuid().optional().nullable(),
        pisoId: z.string().uuid().optional().nullable(),
        motivo: z.string().trim().optional().nullable(),
        // Estado inicial de la cita, opcional: permite marcar "En sala" (u otro) al agendar
        // desde el modal, sin tener que reabrir el turno después.
        estado: z.enum(ESTADO_TURNO).optional().nullable(),
        // Prioridad de atención opcional al agendar (1=alta, 2=media, 3=baja).
        prioridad: z.number().int().min(1).max(3).optional().nullable(),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    const ctx = await requireAuth();
    if (!ctx.sucursalIds.includes(data.sucursalId)) {
      throw new Error("No tenés acceso a esa sucursal");
    }
    // El manual se carga con el paciente presente: se estampa la llegada al crear. Si además
    // se eligió un estado, se estampan sala/finalización/retiro según corresponda (una vez).
    const ahora = new Date();
    const est = data.estado || null;
    const [row] = await db
      .insert(turnosManuales)
      .values({
        sucursalId: data.sucursalId,
        fecha: data.fecha,
        hora: data.hora || null,
        pacienteNombre: data.pacienteNombre.trim(),
        dni: data.dni,
        telefono: data.telefono?.trim() || null,
        obraSocialId: data.obraSocialId || null,
        odontologoId: data.odontologoId || null,
        pisoId: data.pisoId || null,
        motivo: data.motivo?.trim() || null,
        estado: est,
        prioridad: data.prioridad ?? null,
        llegadaAt: ahora,
        salaAt: est === "en_consultorio" ? ahora : null,
        finalizadoAt: est === "finalizado" ? ahora : null,
        retiroAt: est === "se_retiro" ? ahora : null,
        marcadoPor: ctx.userId,
        createdBy: ctx.userId,
      })
      .returning({ id: turnosManuales.id });
    await logAudit(ctx, {
      action: "create",
      resource: "turno_manual",
      entityId: row.id,
      resumen: `Cargó turno manual de ${data.pacienteNombre.trim()} (DNI ${data.dni}) ${data.fecha} ${data.hora || "ST"}`,
      sucursalId: data.sucursalId,
    });
    return { ok: true, id: row.id };
  });

export const marcarEstadoTurnoManual = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z.object({ id: z.string().uuid(), estado: z.enum(ESTADO_TURNO) }).parse(i),
  )
  .handler(async ({ data }) => {
    const ctx = await requireAuth();
    const [t] = await db
      .select({ sucursalId: turnosManuales.sucursalId })
      .from(turnosManuales)
      .where(eq(turnosManuales.id, data.id))
      .limit(1);
    if (!t) throw new Error("Turno no encontrado");
    if (!ctx.sucursalIds.includes(t.sucursalId)) {
      throw new Error("No tenés acceso a esa sucursal");
    }
    // Igual que GHL: llegada al marcar "En recepción", sala al marcar "En sala" y
    // finalización al marcar "Finalizado", cada una una sola vez.
    const ahora = new Date().toISOString();
    const nueva = data.estado === "en_recepcion" ? ahora : null;
    const nuevaSala = data.estado === "en_consultorio" ? ahora : null;
    const nuevaFin = data.estado === "finalizado" ? ahora : null;
    const nuevaRetiro = data.estado === "se_retiro" ? ahora : null;
    await db
      .update(turnosManuales)
      .set({
        estado: data.estado,
        llegadaAt: sql`coalesce(${turnosManuales.llegadaAt}, ${nueva})`,
        salaAt: sql`coalesce(${turnosManuales.salaAt}, ${nuevaSala})`,
        finalizadoAt: sql`coalesce(${turnosManuales.finalizadoAt}, ${nuevaFin})`,
        retiroAt: sql`coalesce(${turnosManuales.retiroAt}, ${nuevaRetiro})`,
        marcadoPor: ctx.userId,
        updatedAt: new Date(),
      })
      .where(eq(turnosManuales.id, data.id));
    await logAudit(ctx, {
      action: "update",
      resource: "turno_manual",
      entityId: data.id,
      resumen: `Marcó turno manual: ${ESTADO_LABEL[data.estado] ?? data.estado}`,
      sucursalId: t.sucursalId,
    });
    return { ok: true };
  });

// Odontólogo que realmente atendió un turno manual (override del asignado en el alta).
export const setOdontologoACargoManual = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z.object({ id: z.string().uuid(), odontologoACargoId: z.string().uuid().nullable() }).parse(i),
  )
  .handler(async ({ data }) => {
    const ctx = await requireAuth();
    const [t] = await db
      .select({ sucursalId: turnosManuales.sucursalId })
      .from(turnosManuales)
      .where(eq(turnosManuales.id, data.id))
      .limit(1);
    if (!t) throw new Error("Turno no encontrado");
    if (!ctx.sucursalIds.includes(t.sucursalId)) {
      throw new Error("No tenés acceso a esa sucursal");
    }
    await db
      .update(turnosManuales)
      .set({ odontologoACargoId: data.odontologoACargoId, updatedAt: new Date() })
      .where(eq(turnosManuales.id, data.id));
    await logAudit(ctx, {
      action: "update",
      resource: "turno_manual",
      entityId: data.id,
      resumen: "Cambió el odontólogo a cargo del turno manual",
      sucursalId: t.sucursalId,
    });
    return { ok: true };
  });

// Edición completa de un turno manual desde el modal (todo local, sin GHL).
export const actualizarTurnoManual = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        fecha: z.string(),
        pacienteNombre: z.string().optional(),
        dni: z.string().optional(),
        telefono: z.string().nullable().optional(),
        obraSocialId: z.string().uuid().nullable().optional(),
        odontologoId: z.string().uuid().nullable().optional(),
        odontologoACargoId: z.string().uuid().nullable().optional(),
        pisoId: z.string().uuid().nullable().optional(),
        motivo: z.string().nullable().optional(),
        hora: z.string().nullable().optional(),
        ficha: z.string().nullable().optional(),
        estado: z.enum(ESTADO_TURNO).nullable().optional(),
        llegadaHora: z.string().optional(),
        salaHora: z.string().optional(),
        finalizadoHora: z.string().optional(),
        retiroHora: z.string().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    const ctx = await requireAuth();
    const [t] = await db
      .select({ sucursalId: turnosManuales.sucursalId })
      .from(turnosManuales)
      .where(eq(turnosManuales.id, data.id))
      .limit(1);
    if (!t) throw new Error("Turno no encontrado");
    if (!ctx.sucursalIds.includes(t.sucursalId)) {
      throw new Error("No tenés acceso a esa sucursal");
    }
    const set: Record<string, unknown> = { marcadoPor: ctx.userId, updatedAt: new Date() };
    if (data.pacienteNombre !== undefined) set.pacienteNombre = data.pacienteNombre;
    if (data.dni !== undefined) set.dni = data.dni;
    if (data.telefono !== undefined) set.telefono = data.telefono;
    if (data.obraSocialId !== undefined) set.obraSocialId = data.obraSocialId;
    if (data.odontologoId !== undefined) set.odontologoId = data.odontologoId;
    if (data.odontologoACargoId !== undefined) set.odontologoACargoId = data.odontologoACargoId;
    if (data.pisoId !== undefined) set.pisoId = data.pisoId;
    if (data.motivo !== undefined) set.motivo = data.motivo;
    if (data.hora !== undefined) set.hora = data.hora;
    if (data.ficha !== undefined) set.tieneFicha = data.ficha;
    if (data.estado !== undefined) set.estado = data.estado;
    if (data.llegadaHora !== undefined) set.llegadaAt = horaARaDate(data.fecha, data.llegadaHora);
    if (data.salaHora !== undefined) set.salaAt = horaARaDate(data.fecha, data.salaHora);
    if (data.finalizadoHora !== undefined)
      set.finalizadoAt = horaARaDate(data.fecha, data.finalizadoHora);
    if (data.retiroHora !== undefined) set.retiroAt = horaARaDate(data.fecha, data.retiroHora);
    await db.update(turnosManuales).set(set).where(eq(turnosManuales.id, data.id));
    await logAudit(ctx, {
      action: "update",
      resource: "turno_manual",
      entityId: data.id,
      resumen: "Editó el turno manual",
      sucursalId: t.sucursalId,
    });
    return { ok: true };
  });

// Marca la ficha (Tiene Ficha / No tiene ficha) de un turno manual. Local, sin GHL.
export const actualizarFichaManual = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z.object({ id: z.string().uuid(), valor: z.enum(FICHA_VALORES) }).parse(i),
  )
  .handler(async ({ data }) => {
    const ctx = await requireAuth();
    const [t] = await db
      .select({ sucursalId: turnosManuales.sucursalId })
      .from(turnosManuales)
      .where(eq(turnosManuales.id, data.id))
      .limit(1);
    if (!t) throw new Error("Turno no encontrado");
    if (!ctx.sucursalIds.includes(t.sucursalId)) {
      throw new Error("No tenés acceso a esa sucursal");
    }
    await db
      .update(turnosManuales)
      .set({ tieneFicha: data.valor, updatedAt: new Date() })
      .where(eq(turnosManuales.id, data.id));
    await logAudit(ctx, {
      action: "update",
      resource: "ficha",
      entityId: data.id,
      resumen: `Marcó ficha (manual): ${data.valor}`,
      sucursalId: t.sucursalId,
    });
    return { ok: true };
  });

export const eliminarTurnoManual = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const ctx = await requireAuth();
    const [t] = await db
      .select({ sucursalId: turnosManuales.sucursalId, paciente: turnosManuales.pacienteNombre })
      .from(turnosManuales)
      .where(eq(turnosManuales.id, data.id))
      .limit(1);
    if (!t) throw new Error("Turno no encontrado");
    if (!ctx.sucursalIds.includes(t.sucursalId)) {
      throw new Error("No tenés acceso a esa sucursal");
    }
    await db.delete(turnosManuales).where(eq(turnosManuales.id, data.id));
    await logAudit(ctx, {
      action: "delete",
      resource: "turno_manual",
      entityId: data.id,
      resumen: `Eliminó turno manual de ${t.paciente}`,
      sucursalId: t.sucursalId,
    });
    return { ok: true };
  });
