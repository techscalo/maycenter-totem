import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "@/db/client";
import { sucursales, turnoAsistencias, arrivals } from "@/db/schema";
import { requireAuth } from "@/lib/gestion/session.server";

// -------------------------------------------------------------------------
// Config GHL por sucursal (slug). Solo CABA por ahora. La Plata: pendiente
// (turnos por profesional sin marca de edificio → requiere mapeo aparte).
// -------------------------------------------------------------------------
type GhlConfig = { locationId: string; pit: string; dniField: string };

function ghlConfigForSlug(slug: string | null): GhlConfig | null {
  if (slug === "caba") {
    const locationId = process.env.GHL_CABA_LOCATION_ID;
    const pit = process.env.GHL_CABA_PIT;
    if (locationId && pit) return { locationId, pit, dniField: "rjdIgjhi3iPZFpRVDP7h" };
  }
  return null;
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

const onlyDigits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

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
  const hit = calCache.get(cfg.locationId);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.cals;
  const data = await ghlFetch(cfg.pit, `/calendars/?locationId=${cfg.locationId}`);
  const cals = (data.calendars ?? [])
    .filter((c: any) => c.isActive !== false)
    .map((c: any) => ({ id: c.id as string, name: (c.name as string) ?? "" }));
  calCache.set(cfg.locationId, { at: Date.now(), cals });
  return cals;
}

async function listDayEvents(cfg: GhlConfig, fecha: string) {
  const start = new Date(`${fecha}T00:00:00-03:00`).getTime();
  const end = new Date(`${fecha}T23:59:59-03:00`).getTime();
  const cals = await listCalendars(cfg);
  const calName = new Map(cals.map((c) => [c.id, c.name]));
  const perCal = await Promise.all(
    cals.map(async (c) => {
      const data = await ghlFetch(
        cfg.pit,
        `/calendars/events?locationId=${cfg.locationId}&calendarId=${c.id}&startTime=${start}&endTime=${end}`,
      );
      return (data.events ?? []) as any[];
    }),
  );
  return perCal
    .flat()
    .filter((e) => e && e.deleted !== true && e.contactId)
    .map((e) => ({
      eventId: e.id as string,
      startTime: e.startTime as string,
      title: (e.title as string) ?? "",
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
        return [id, { nombre, telefono: c.phone ?? null, dni: dniField?.value ?? null }] as const;
      } catch {
        return [id, { nombre: "—", telefono: null, dni: null }] as const;
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

export const getTurnosDelDia = createServerFn({ method: "GET" })
  .inputValidator((i: unknown) =>
    z.object({ sucursalId: z.string().uuid(), fecha: z.string() }).parse(i),
  )
  .handler(async ({ data }) => {
    const ctx = await requireAuth();
    if (!ctx.sucursalIds.includes(data.sucursalId)) {
      return { soportado: false as const, turnos: [] };
    }
    const [suc] = await db
      .select({ slug: sucursales.slug })
      .from(sucursales)
      .where(eq(sucursales.id, data.sucursalId))
      .limit(1);
    const cfg = ghlConfigForSlug(suc?.slug ?? null);
    if (!cfg) return { soportado: false as const, turnos: [] };

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

    // Asistencias locales ya marcadas.
    const ids = eventos.map((e) => e.eventId);
    const marcadas = ids.length
      ? await db
          .select({ eventId: turnoAsistencias.ghlEventId, asistio: turnoAsistencias.asistio })
          .from(turnoAsistencias)
          .where(inArray(turnoAsistencias.ghlEventId, ids))
      : [];
    const asisteMap = new Map(marcadas.map((m) => [m.eventId, m.asistio]));
    // null = sin marcar; true = asistió (showed); false = ausente (noshow).
    const asistenciaDe = (eventId: string): boolean | null =>
      asisteMap.has(eventId) ? (asisteMap.get(eventId) as boolean) : null;

    // Llegadas del tótem de esa fecha/sucursal, indexadas por DNI (para el cruce).
    const dayStart = new Date(`${data.fecha}T00:00:00-03:00`);
    const dayEnd = new Date(`${data.fecha}T23:59:59-03:00`);
    const llegadas = await db
      .select({ dni: arrivals.dni, estado: arrivals.estado })
      .from(arrivals)
      .where(
        and(
          eq(arrivals.sucursalId, data.sucursalId),
          gte(arrivals.createdAt, dayStart),
          lte(arrivals.createdAt, dayEnd),
        ),
      );
    const llegadaPorDni = new Map(llegadas.map((l) => [onlyDigits(l.dni), l.estado]));

    const turnos = eventos
      .map((e) => {
        const c = contactos.get(e.contactId);
        const dni = c?.dni ? String(c.dni) : null;
        const hora = new Date(e.startTime).toLocaleTimeString("es-AR", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        });
        const llegadaEstado = dni ? (llegadaPorDni.get(onlyDigits(dni)) ?? null) : null;
        return {
          eventId: e.eventId,
          hora,
          startTime: e.startTime,
          paciente: c?.nombre ?? "—",
          dni,
          telefono: c?.telefono ?? null,
          profesional: e.profesional,
          motivo: e.title,
          estadoGhl: e.estadoGhl,
          agendadoPor: e.creadoPorUserId ? (usuarios.get(e.creadoPorUserId) ?? "—") : "—",
          origen: e.origen,
          ingresoTotem: llegadaEstado !== null,
          llegadaEstado,
          contactoUrl: `https://app.gohighlevel.com/v2/location/${cfg.locationId}/contacts/detail/${e.contactId}`,
          asistio: asistenciaDe(e.eventId),
        };
      })
      .sort((a, b) => a.startTime.localeCompare(b.startTime));

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

export const marcarAsistenciaTurno = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z
      .object({
        eventId: z.string().min(1),
        sucursalId: z.string().uuid(),
        fecha: z.string(),
        asistio: z.boolean(),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    const ctx = await requireAuth();
    if (!ctx.sucursalIds.includes(data.sucursalId)) {
      throw new Error("No tenés acceso a esa sucursal");
    }
    // Reflejar en GHL: showed (asistió) / noshow (ausente). Si falla, no guardamos local
    // para no desincronizar.
    const [suc] = await db
      .select({ slug: sucursales.slug })
      .from(sucursales)
      .where(eq(sucursales.id, data.sucursalId))
      .limit(1);
    const cfg = ghlConfigForSlug(suc?.slug ?? null);
    if (cfg) {
      await updateAppointmentStatus(cfg, data.eventId, data.asistio ? "showed" : "noshow");
    }
    await db
      .insert(turnoAsistencias)
      .values({
        ghlEventId: data.eventId,
        sucursalId: data.sucursalId,
        fecha: data.fecha,
        asistio: data.asistio,
        marcadoPor: ctx.userId,
      })
      .onConflictDoUpdate({
        target: turnoAsistencias.ghlEventId,
        set: { asistio: data.asistio, marcadoPor: ctx.userId, updatedAt: new Date() },
      });
    return { ok: true };
  });
