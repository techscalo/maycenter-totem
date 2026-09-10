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
// Config GHL por sucursal (slug). Cada sede es una subcuenta GHL separada, así
// que el slug resuelve a un location/PIT propio + el custom field DNI de esa
// subcuenta. Credenciales por env (no en DB).
// -------------------------------------------------------------------------
type GhlConfig = {
  locationId: string;
  pit: string;
  dniField: string;
  osField: string;
  // Custom field "Observaciones" del contacto (para la columna de la tabla de turnos).
  obsField: string;
  // Custom field "Ficha" del contacto (Tiene ficha / No tiene ficha).
  fichaField: string;
  // Custom field "Estado de la cita" del contacto (Asistido / No Asistido). Lo lee el
  // workflow de recupero de inasistidos, que no puede evaluar el appointmentStatus nativo.
  // Solo existe en CABA; en el resto de sucursales es null y no se escribe.
  estadoCitaField: string | null;
  // Filtros de calendarios (por id). Se aplican sobre la location, DESPUÉS del cache.
  onlyCalendarIds?: string[];
  excludeCalendarIds?: string[];
};

// Calendario de Diagonal 77 que hoy vive dentro de la subcuenta de La Plata (Calle 10).
// TEMPORAL: hasta que los turnos/contactos se migren a la subcuenta MY-LP Diag 77
// (GHL_DIAG77_*) y la autoagenda apunte allí, diag77 se lee de La Plata filtrando este
// calendario, y calle10 lo excluye.
const EDIFICIO_B_DIAG77 = "4g2Z2btBt4XHjXCUzHP8";

const GHL_BY_SLUG: Record<
  string,
  {
    locEnv: string;
    pitEnv: string;
    dniField: string;
    osField: string;
    obsField: string;
    fichaField: string;
    estadoCitaField?: string;
    onlyCalendarIds?: string[];
    excludeCalendarIds?: string[];
  }
> = {
  caba: {
    locEnv: "GHL_CABA_LOCATION_ID",
    pitEnv: "GHL_CABA_PIT",
    dniField: "rjdIgjhi3iPZFpRVDP7h",
    osField: "J1dLEUewkTaqVthYDOak",
    obsField: "RNgqB0yQSDM1LxeS7IRc",
    fichaField: "SP1rAdxTjKwrVa9Tougf",
    estadoCitaField: "qGZJCp60BtzNyipXIjvD",
  },
  calle10: {
    locEnv: "GHL_LAPLATA_LOCATION_ID",
    pitEnv: "GHL_LAPLATA_PIT",
    dniField: "KoiPTwrSvVz8ud5LKzBN",
    osField: "VoybEaSZn3agkMBk1MRU",
    obsField: "iPovCNTHMScBeLHsFAEc",
    fichaField: "jiuTQYHKyxQCheXjdq2t",
    excludeCalendarIds: [EDIFICIO_B_DIAG77],
  },
  diag77: {
    locEnv: "GHL_LAPLATA_LOCATION_ID",
    pitEnv: "GHL_LAPLATA_PIT",
    dniField: "KoiPTwrSvVz8ud5LKzBN",
    osField: "VoybEaSZn3agkMBk1MRU",
    obsField: "iPovCNTHMScBeLHsFAEc",
    fichaField: "jiuTQYHKyxQCheXjdq2t",
    onlyCalendarIds: [EDIFICIO_B_DIAG77],
  },
};

function ghlConfigForSlug(slug: string | null): GhlConfig | null {
  if (!slug) return null;
  const entry = GHL_BY_SLUG[slug];
  if (!entry) return null;
  const locationId = process.env[entry.locEnv];
  const pit = process.env[entry.pitEnv];
  if (locationId && pit)
    return {
      locationId,
      pit,
      dniField: entry.dniField,
      osField: entry.osField,
      obsField: entry.obsField,
      fichaField: entry.fichaField,
      estadoCitaField: entry.estadoCitaField ?? null,
      onlyCalendarIds: entry.onlyCalendarIds,
      excludeCalendarIds: entry.excludeCalendarIds,
    };
  return null;
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
  const res = await fetch(`${GHL_BASE}${path}`, {
    headers: { Authorization: `Bearer ${pit}`, Version: version, "User-Agent": "curl/8.4.0" },
  });
  if (!res.ok) throw new Error(`GHL ${res.status} en ${path}`);
  return res.json();
}

// Actualiza el estado de una cita en GHL (showed = asistió, noshow = ausente).
async function updateAppointmentStatus(cfg: GhlConfig, eventId: string, status: string) {
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
async function updateContactField(cfg: GhlConfig, contactId: string, fieldId: string, value: string) {
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
async function updateContactFull(cfg: GhlConfig, contactId: string, body: Record<string, unknown>) {
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
async function updateAppointmentFull(cfg: GhlConfig, eventId: string, body: Record<string, unknown>) {
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

const onlyDigits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

// "HH:MM" (hora de Argentina) + fecha "YYYY-MM-DD" → Date. "" o null → null (limpia el valor).
function horaARaDate(fecha: string, hhmm: string | null | undefined): Date | null {
  const v = (hhmm ?? "").trim();
  if (!v) return null;
  return new Date(`${fecha}T${v}:00-03:00`);
}

// Espejo GHL → sistema: si la cita ya viene marcada en GHL, reflejarlo.
// showed (asistió) → finalizado; noshow (no asistió) → ausente; el resto no mapea.
function estadoDesdeGhl(appointmentStatus: string | null | undefined): string | null {
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
async function listCalendars(cfg: GhlConfig): Promise<{ id: string; name: string }[]> {
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

async function listDayEvents(cfg: GhlConfig, fecha: string) {
  const start = new Date(`${fecha}T00:00:00-03:00`).getTime();
  const end = new Date(`${fecha}T23:59:59-03:00`).getTime();
  const cals = await listCalendars(cfg);
  const calName = new Map(cals.map((c) => [c.id, c.name]));
  const perCal = await mapLimit(cals, 6, async (c) => {
    const data = await ghlFetch(
      cfg.pit,
      `/calendars/events?locationId=${cfg.locationId}&calendarId=${c.id}&startTime=${start}&endTime=${end}`,
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

// Nombre + teléfono + DNI de los contactos (dedup + paralelo).
async function resolveContactos(cfg: GhlConfig, ids: string[]) {
  const unique = [...new Set(ids)];
  const entries = await Promise.all(
    unique.map(async (id) => {
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
    }),
  );
  return new Map(entries);
}

// Nombre de los usuarios que agendaron (dedup + cache).
const userCache = new Map<string, string>();
async function resolveUsuarios(cfg: GhlConfig, ids: (string | null)[]) {
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
      obraSocialId: turnosManuales.obraSocialId,
      obraSocial: obrasSociales.nombre,
      odontologoId: turnosManuales.odontologoId,
      profesional: odontologos.nombre,
      odontologoACargoId: turnosManuales.odontologoACargoId,
      odontologoACargo: odontCargo.nombre,
      pisoId: turnosManuales.pisoId,
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
    odontologoACargoId: m.odontologoACargoId as string | null,
    odontologoACargo: m.odontologoACargo as string | null,
    pisoId: m.pisoId as string | null,
    contactoUrl: null as string | null,
    estado: m.estado,
    };
  });
}

export const getTurnosDelDia = createServerFn({ method: "GET" })
  .inputValidator((i: unknown) =>
    z.object({ sucursalId: z.string().uuid(), fecha: z.string() }).parse(i),
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
    const cfg = ghlConfigForSlug(suc?.slug ?? null);
    if (!cfg) {
      return {
        soportado: false as const,
        turnos: [...manuales].sort((a, b) => a.startTime.localeCompare(b.startTime)),
      };
    }

    const eventos = await listDayEvents(cfg, data.fecha);
    const [contactos, usuarios] = await Promise.all([
      resolveContactos(
        cfg,
        eventos.map((e) => e.contactId),
      ),
      resolveUsuarios(
        cfg,
        eventos.map((e) => e.creadoPorUserId),
      ),
    ]);

    // Estados de flujo ya marcados localmente.
    const ids = eventos.map((e) => e.eventId);
    const marcadas = ids.length
      ? await db
          .select({
            eventId: turnoAsistencias.ghlEventId,
            estado: turnoAsistencias.estado,
            salaAt: turnoAsistencias.salaAt,
            llegadaAt: turnoAsistencias.llegadaAt,
            finalizadoAt: turnoAsistencias.finalizadoAt,
            odontologoACargoId: turnoAsistencias.odontologoACargoId,
            pisoId: turnoAsistencias.pisoId,
          })
          .from(turnoAsistencias)
          .where(inArray(turnoAsistencias.ghlEventId, ids))
      : [];
    const estadoMap = new Map(marcadas.map((m) => [m.eventId, m.estado]));
    const salaMap = new Map(marcadas.map((m) => [m.eventId, m.salaAt]));
    const finMap = new Map(marcadas.map((m) => [m.eventId, m.finalizadoAt]));
    const llegadaOverrideMap = new Map(marcadas.map((m) => [m.eventId, m.llegadaAt]));
    const aCargoMap = new Map(marcadas.map((m) => [m.eventId, m.odontologoACargoId]));
    const pisoMap = new Map(marcadas.map((m) => [m.eventId, m.pisoId]));

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

    const turnosGhl = eventos
      .map((e) => {
        const c = contactos.get(e.contactId);
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
        const llegadaOverride = llegadaOverrideMap.get(e.eventId) ?? null;
        const llegadaFecha = llegadaOverride ?? (llegada ? llegada.createdAt : null);
        const aCargoId = aCargoMap.get(e.eventId) ?? null;
        return {
          tipo: "ghl" as const,
          rowId: `ghl:${e.eventId}`,
          id: e.eventId as string | null,
          eventId: e.eventId as string | null,
          contactId: e.contactId as string | null,
          calendarId: e.calendarId as string | null,
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
          agendadoPor: e.creadoPorUserId ? (usuarios.get(e.creadoPorUserId) ?? "—") : "—",
          origen: e.origen,
          ingresoTotem,
          llegadaEstado: llegada?.estado ?? null,
          llegadaHora: llegadaFecha ? hhmmAR(new Date(llegadaFecha)) : null,
          salaHora: salaAt ? hhmmAR(new Date(salaAt)) : null,
          finalizadoHora: finAt ? hhmmAR(new Date(finAt)) : null,
          odontologoACargoId: aCargoId,
          odontologoACargo: aCargoId ? (odontNombre.get(aCargoId) ?? null) : null,
          pisoId: pisoMap.get(e.eventId) ?? null,
          contactoUrl: `https://app.gohighlevel.com/v2/location/${cfg.locationId}/contacts/detail/${e.contactId}`,
          estado,
        };
      });

    const turnos = [...turnosGhl, ...manuales].sort((a, b) =>
      a.startTime.localeCompare(b.startTime),
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
    const cfg = ghlConfigForSlug(suc?.slug ?? null);
    let turnos: number | null = null;
    if (cfg) {
      try {
        turnos = (await listDayEvents(cfg, data.fecha)).length;
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

const ESTADO_TURNO = ["en_recepcion", "en_consultorio", "finalizado", "ausente"] as const;
const ESTADO_LABEL: Record<string, string> = {
  en_recepcion: "En recepción",
  en_consultorio: "En sala",
  finalizado: "Finalizado",
  ausente: "Ausente",
};

export const marcarEstadoTurno = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z
      .object({
        eventId: z.string().min(1),
        contactId: z.string().min(1),
        sucursalId: z.string().uuid(),
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
    const cfg = ghlConfigForSlug(suc?.slug ?? null);
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
    // Hora de ingreso a sala / finalización: se estampan al marcar "En sala" (en_consultorio)
    // y "Finalizado" respectivamente y no se pisan en marcas posteriores (coalesce mantiene la
    // primera).
    const salaAhora = data.estado === "en_consultorio" ? new Date() : null;
    const finAhora = data.estado === "finalizado" ? new Date() : null;
    await db
      .insert(turnoAsistencias)
      .values({
        ghlEventId: data.eventId,
        sucursalId: data.sucursalId,
        fecha: data.fecha,
        asistio: data.estado === "finalizado",
        estado: data.estado,
        salaAt: salaAhora,
        finalizadoAt: finAhora,
        marcadoPor: ctx.userId,
      })
      .onConflictDoUpdate({
        target: turnoAsistencias.ghlEventId,
        set: {
          asistio: data.estado === "finalizado",
          estado: data.estado,
          salaAt: sql`coalesce(${turnoAsistencias.salaAt}, ${salaAhora ? salaAhora.toISOString() : null})`,
          finalizadoAt: sql`coalesce(${turnoAsistencias.finalizadoAt}, ${finAhora ? finAhora.toISOString() : null})`,
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

// Edición completa de un turno de GHL desde el modal: datos del contacto + custom fields,
// reprogramación de la cita (start/end en GHL) y campos locales (estado, a cargo, horas).
export const actualizarTurnoGhl = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z
      .object({
        eventId: z.string().min(1),
        contactId: z.string().min(1),
        sucursalId: z.string().uuid(),
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
    const cfg = ghlConfigForSlug(suc?.slug ?? null);
    if (!cfg) throw new Error("Sucursal sin GHL configurado");

    // 1) Contacto: datos base + custom fields.
    const customFields: { id: string; value: string }[] = [];
    if (data.dni !== undefined) customFields.push({ id: cfg.dniField, value: data.dni });
    if (data.obraSocial !== undefined) customFields.push({ id: cfg.osField, value: data.obraSocial });
    if (data.observaciones !== undefined)
      customFields.push({ id: cfg.obsField, value: data.observaciones });
    if (data.ficha !== undefined) customFields.push({ id: cfg.fichaField, value: data.ficha });
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
    const cfg = ghlConfigForSlug(suc?.slug ?? null);
    if (!cfg) throw new Error("Esta sucursal no tiene GHL configurado");
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
        motivo: z.string().trim().optional().nullable(),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    const ctx = await requireAuth();
    if (!ctx.sucursalIds.includes(data.sucursalId)) {
      throw new Error("No tenés acceso a esa sucursal");
    }
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
        motivo: data.motivo?.trim() || null,
        // El manual se carga con el paciente presente: se estampa la llegada al crear.
        llegadaAt: new Date(),
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
    await db
      .update(turnosManuales)
      .set({
        estado: data.estado,
        llegadaAt: sql`coalesce(${turnosManuales.llegadaAt}, ${nueva})`,
        salaAt: sql`coalesce(${turnosManuales.salaAt}, ${nuevaSala})`,
        finalizadoAt: sql`coalesce(${turnosManuales.finalizadoAt}, ${nuevaFin})`,
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
