import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "@/db/client";
import {
  sucursales,
  turnoAsistencias,
  turnosManuales,
  arrivals,
  odontologos,
  obrasSociales,
  pacientes,
} from "@/db/schema";
import { requireAuth } from "@/lib/gestion/session.server";
import {
  ghlConfigForSlug,
  listRangeEvents,
  resolveContactos,
  estadoDesdeGhl,
  onlyDigits,
} from "@/lib/gestion/ghl.server";

// -------------------------------------------------------------------------
// Métricas de Recepción. "Cita" = turno de la agenda: turno de GHL (traído en
// vivo por rango) + turno manual (DB). Las llegadas del tótem (arrivals) NO se
// cuentan como citas aparte para no duplicar (un turno de GHL con check-in en el
// tótem es una sola cita); se usan como señal de asistencia (estado efectivo) y
// para el ranking de última asistencia.
// -------------------------------------------------------------------------

// Estado efectivo → etiqueta unificada para agrupar. Manuales y GHL comparten
// vocabulario (en_recepcion/en_consultorio/finalizado/ausente/se_retiro/cancelado).
function estadoLabel(estado: string | null | undefined): string {
  switch (estado) {
    case "finalizado":
      return "Atendido / Finalizado";
    case "en_recepcion":
    case "en_consultorio":
      return "En curso";
    case "ausente":
      return "Ausente";
    case "se_retiro":
      return "Se retiró";
    case "cancelado":
      return "Cancelado";
    default:
      return "Sin marcar";
  }
}

// Espejo GHL → sistema, extendido con cancelado (el base solo mapea showed/noshow).
function estadoDesdeGhlExt(appointmentStatus: string | null | undefined): string | null {
  const s = (appointmentStatus ?? "").toLowerCase();
  if (s === "cancelled" || s === "canceled") return "cancelado";
  return estadoDesdeGhl(appointmentStatus);
}

const DIAS_SEMANA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

// Fecha "YYYY-MM-DD" en hora de Argentina a partir de un ISO/epoch.
function fechaAR(d: Date): string {
  // en-CA da formato YYYY-MM-DD; fijamos la TZ para no correr el día en prod (UTC).
  return d.toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
}
const WEEKDAY_ES: Record<string, string> = {
  Sunday: "Domingo",
  Monday: "Lunes",
  Tuesday: "Martes",
  Wednesday: "Miércoles",
  Thursday: "Jueves",
  Friday: "Viernes",
  Saturday: "Sábado",
};
function diaSemanaAR(d: Date): string {
  const wd = d.toLocaleDateString("en-US", {
    weekday: "long",
    timeZone: "America/Argentina/Buenos_Aires",
  });
  return WEEKDAY_ES[wd] ?? "";
}

type Conteo = { label: string; count: number };

// Agrupa una lista de labels en conteos ordenados desc, colapsando la cola en "Otras".
function contar(labels: string[], topN?: number): Conteo[] {
  const map = new Map<string, number>();
  for (const l of labels) map.set(l, (map.get(l) ?? 0) + 1);
  const arr = [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
  if (!topN || arr.length <= topN) return arr;
  const top = arr.slice(0, topN);
  const otras = arr.slice(topN).reduce((s, x) => s + x.count, 0);
  if (otras > 0) top.push({ label: "Otras", count: otras });
  return top;
}

export const getMetricasRecepcion = createServerFn({ method: "GET" })
  .inputValidator((i: unknown) =>
    z.object({ sucursalId: z.string().uuid(), from: z.string(), to: z.string() }).parse(i),
  )
  .handler(async ({ data }) => {
    const ctx = await requireAuth();
    if (!ctx.sucursalIds.includes(data.sucursalId)) {
      throw new Error("No tenés acceso a esa sucursal");
    }
    const desde = new Date(data.from);
    const hasta = new Date(data.to);

    // --- Turnos manuales del rango (DB) ---
    const manuales = await db
      .select({
        fecha: turnosManuales.fecha,
        estado: turnosManuales.estado,
        obraSocial: obrasSociales.nombre,
        profesional: odontologos.nombre,
      })
      .from(turnosManuales)
      .leftJoin(obrasSociales, eq(turnosManuales.obraSocialId, obrasSociales.id))
      .leftJoin(odontologos, eq(turnosManuales.odontologoId, odontologos.id))
      .where(
        and(
          eq(turnosManuales.sucursalId, data.sucursalId),
          gte(turnosManuales.fecha, fechaAR(desde)),
          lte(turnosManuales.fecha, fechaAR(hasta)),
        ),
      );

    // --- Llegadas del tótem del rango (para asistencia efectiva de GHL + KPI info) ---
    const llegadas = await db
      .select({ dni: arrivals.dni, createdAt: arrivals.createdAt })
      .from(arrivals)
      .where(
        and(
          eq(arrivals.sucursalId, data.sucursalId),
          gte(arrivals.createdAt, desde),
          lte(arrivals.createdAt, hasta),
        ),
      );
    // Índice DNI+día → hubo check-in en el tótem ese día.
    const llegadaDniDia = new Set(
      llegadas.map((l) => `${onlyDigits(l.dni)}:${fechaAR(new Date(l.createdAt))}`),
    );

    // --- Turnos de GHL del rango (en vivo) ---
    const [suc] = await db
      .select({ slug: sucursales.slug })
      .from(sucursales)
      .where(eq(sucursales.id, data.sucursalId))
      .limit(1);
    const cfg = ghlConfigForSlug(suc?.slug ?? null);

    type Cita = {
      fecha: string;
      estado: string | null;
      obraSocial: string;
      profesional: string;
      fuente: "GHL" | "Manual";
    };
    const citas: Cita[] = manuales.map((m) => ({
      fecha: m.fecha,
      estado: m.estado,
      obraSocial: m.obraSocial ?? "Sin especificar",
      profesional: m.profesional ?? "Sin asignar",
      fuente: "Manual" as const,
    }));

    let soportadoGhl = false;
    if (cfg) {
      soportadoGhl = true;
      const eventos = await listRangeEvents(cfg, desde.getTime(), hasta.getTime());
      const contactos = await resolveContactos(
        cfg,
        eventos.map((e) => e.contactId),
      );
      // Marcas locales de estado para esos eventos.
      const ids = eventos.map((e) => e.eventId);
      const marcadas = ids.length
        ? await db
            .select({ eventId: turnoAsistencias.ghlEventId, estado: turnoAsistencias.estado })
            .from(turnoAsistencias)
            .where(inArray(turnoAsistencias.ghlEventId, ids))
        : [];
      const estadoLocal = new Map(marcadas.map((m) => [m.eventId, m.estado]));

      for (const e of eventos) {
        const c = contactos.get(e.contactId);
        const dni = c?.dni ? onlyDigits(String(c.dni)) : null;
        const fecha = fechaAR(new Date(e.startTime));
        const ingresoTotem = dni ? llegadaDniDia.has(`${dni}:${fecha}`) : false;
        // Misma prioridad que getTurnosDelDia: marca local → check-in tótem → estado GHL.
        const estado =
          estadoLocal.get(e.eventId) ??
          (ingresoTotem ? "en_recepcion" : estadoDesdeGhlExt(e.estadoGhl));
        citas.push({
          fecha,
          estado,
          obraSocial: c?.obraSocial ? String(c.obraSocial) : "Sin especificar",
          profesional: e.profesional || "Sin asignar",
          fuente: "GHL",
        });
      }
    }

    // --- Agregados ---
    const totalCitas = citas.length;
    const cuenta = (pred: (c: Cita) => boolean) => citas.filter(pred).length;
    const atendidas = cuenta((c) => c.estado === "finalizado");
    const ausentes = cuenta((c) => c.estado === "ausente");
    const cancelados = cuenta((c) => c.estado === "cancelado");
    const seRetiraron = cuenta((c) => c.estado === "se_retiro");

    const porDiaMap = new Map<string, number>();
    for (const c of citas) porDiaMap.set(c.fecha, (porDiaMap.get(c.fecha) ?? 0) + 1);
    const porDia = [...porDiaMap.entries()]
      .map(([fecha, count]) => ({ fecha, count }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha));

    const porDiaSemana = DIAS_SEMANA.slice(1)
      .concat(DIAS_SEMANA[0]) // Lun..Sáb, Dom al final
      .map((label) => ({
        label,
        count: citas.filter((c) => diaSemanaAR(new Date(`${c.fecha}T12:00:00-03:00`)) === label)
          .length,
      }))
      .filter((d) => d.count > 0);

    return {
      soportadoGhl,
      totalCitas,
      atendidas,
      ausentes,
      cancelados,
      seRetiraron,
      llegadasTotem: llegadas.length,
      porEstado: contar(citas.map((c) => estadoLabel(c.estado))),
      porObraSocial: contar(
        citas.map((c) => c.obraSocial),
        12,
      ),
      porFuente: contar(citas.map((c) => c.fuente)),
      porProfesional: contar(
        citas.map((c) => c.profesional),
        12,
      ),
      porDia,
      porDiaSemana,
    };
  });

// -------------------------------------------------------------------------
// Última asistencia por paciente (100% DB, sin GHL). "Asistió" = quedó rastro de
// llegada física en el sistema (llegada del tótem o turno manual con llegada/retiro),
// sin importar si terminó en atención. Fuentes con DNI en la base: arrivals + turnos
// manuales. (Un turno de GHL marcado sin check-in en el tótem no tiene DNI en la base
// y no se refleja acá.)
// -------------------------------------------------------------------------
export const getUltimaAsistenciaPacientes = createServerFn({ method: "GET" })
  .inputValidator((i: unknown) =>
    z
      .object({
        sucursalId: z.string().uuid().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    const ctx = await requireAuth();
    // Scope de sucursal: la pedida (si el usuario tiene acceso) o todas las suyas.
    const sucursalIds =
      data.sucursalId && ctx.sucursalIds.includes(data.sucursalId)
        ? [data.sucursalId]
        : ctx.sucursalIds;
    if (sucursalIds.length === 0) return [];

    const desde = data.from ? new Date(data.from) : null;
    const hasta = data.to ? new Date(data.to) : null;

    // Llegadas del tótem.
    const arrConds = [inArray(arrivals.sucursalId, sucursalIds)];
    if (desde) arrConds.push(gte(arrivals.createdAt, desde));
    if (hasta) arrConds.push(lte(arrivals.createdAt, hasta));
    const llegadas = await db
      .select({ dni: arrivals.dni, nombre: arrivals.nombreApellido, at: arrivals.createdAt })
      .from(arrivals)
      .where(and(...arrConds));

    // Turnos manuales (usa llegada_at; fallback a la fecha del turno).
    const manConds = [inArray(turnosManuales.sucursalId, sucursalIds)];
    if (desde) manConds.push(gte(turnosManuales.fecha, fechaAR(desde)));
    if (hasta) manConds.push(lte(turnosManuales.fecha, fechaAR(hasta)));
    const manuales = await db
      .select({
        dni: turnosManuales.dni,
        nombre: turnosManuales.pacienteNombre,
        fecha: turnosManuales.fecha,
        llegadaAt: turnosManuales.llegadaAt,
        retiroAt: turnosManuales.retiroAt,
        estado: turnosManuales.estado,
      })
      .from(turnosManuales)
      .where(and(...manConds));

    // Nombres canónicos de la ficha de paciente (pisa el del registro suelto).
    const dnisSet = new Set<string>();
    llegadas.forEach((l) => dnisSet.add(onlyDigits(l.dni)));
    manuales.forEach((m) => dnisSet.add(onlyDigits(m.dni)));
    const dnis = [...dnisSet].filter(Boolean);
    const fichas = dnis.length
      ? await db
          .select({ dni: pacientes.dni, nombre: pacientes.nombre })
          .from(pacientes)
          .where(inArray(pacientes.dni, dnis))
      : [];
    const nombreFicha = new Map(fichas.map((f) => [onlyDigits(f.dni), f.nombre]));

    // Consolidar por DNI: última fecha de asistencia + visitas (días distintos).
    type Acc = { dni: string; nombre: string; ultima: Date; dias: Set<string> };
    const acc = new Map<string, Acc>();
    const push = (dniRaw: string, nombre: string | null, at: Date | null) => {
      if (!at) return;
      const dni = onlyDigits(dniRaw);
      if (!dni) return;
      const cur = acc.get(dni);
      const dia = fechaAR(at);
      if (!cur) {
        acc.set(dni, {
          dni,
          nombre: nombreFicha.get(dni) ?? nombre ?? "—",
          ultima: at,
          dias: new Set([dia]),
        });
      } else {
        if (at > cur.ultima) cur.ultima = at;
        cur.dias.add(dia);
        if (nombreFicha.get(dni)) cur.nombre = nombreFicha.get(dni)!;
      }
    };
    for (const l of llegadas) push(l.dni, l.nombre, new Date(l.at));
    for (const m of manuales) {
      // Presencia del manual: llegada estampada, retiro, o (si no hay timestamp pero el
      // estado indica que vino) la fecha del turno al mediodía AR.
      const vino =
        m.llegadaAt ??
        m.retiroAt ??
        (["en_recepcion", "en_consultorio", "finalizado", "se_retiro"].includes(m.estado ?? "")
          ? new Date(`${m.fecha}T12:00:00-03:00`)
          : null);
      push(m.dni, m.nombre, vino);
    }

    const now = Date.now();
    return [...acc.values()]
      .map((a) => ({
        dni: a.dni,
        nombre: a.nombre,
        ultimaAsistencia: a.ultima.toISOString(),
        diasDesde: Math.floor((now - a.ultima.getTime()) / 86_400_000),
        visitas: a.dias.size,
      }))
      .sort((a, b) => b.ultimaAsistencia.localeCompare(a.ultimaAsistencia));
  });
