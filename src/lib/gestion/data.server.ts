import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  sucursales,
  pisos,
  obrasSociales,
  odontologos,
  nomencladores,
  nomencladorPriceHistory,
  serviciosParticulares,
  atenciones,
  atencionItems,
  arrivals,
  pacientes,
} from "@/db/schema";
import {
  requireAuth,
  requireAdmin,
  requirePermission,
  type AuthCtx,
} from "@/lib/gestion/session.server";
import { logAudit } from "@/lib/gestion/audit";
import { isValidDni, normalizeDni } from "@/lib/dni";
import { SUBTIPO_VALUES } from "@/lib/gestion/codigos";
import { parsePdfToCanonical } from "@/lib/gestion/nomenclador-parse.server";

// DNI obligatorio + validación de formato (6 a 9 dígitos), compartido por las cargas con paciente.
const dniField = z
  .string()
  .refine((v) => isValidDni(v), "DNI inválido (6 a 9 dígitos)")
  .transform((v) => normalizeDni(v));

// Resuelve la sucursal de trabajo: valida que la pedida sea una de las asignadas;
// si no se pide ninguna, usa la primera asignada. Lanza si el usuario no tiene acceso.
function resolveSucursal(ctx: AuthCtx, pedida?: string): string {
  if (ctx.sucursalIds.length === 0) throw new Error("No tenés ninguna sucursal asignada");
  if (pedida) {
    if (!ctx.sucursalIds.includes(pedida)) throw new Error("No tenés acceso a esa sucursal");
    return pedida;
  }
  return ctx.sucursalIds[0];
}

// ---------------------------------------------------------------------------
// Catálogos (lectura)
// ---------------------------------------------------------------------------

export const listSucursales = createServerFn({ method: "GET" }).handler(async () => {
  await requireAuth();
  return db.select().from(sucursales).orderBy(asc(sucursales.nombre));
});

export const listObrasSociales = createServerFn({ method: "GET" }).handler(async () => {
  await requireAuth();
  return db.select().from(obrasSociales).orderBy(asc(obrasSociales.nombre));
});

export const listPisos = createServerFn({ method: "GET" })
  .inputValidator((i: unknown) => z.object({ sucursalId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    await requireAuth();
    return db
      .select()
      .from(pisos)
      .where(eq(pisos.sucursalId, data.sucursalId))
      .orderBy(asc(pisos.nombre));
  });

export const listPisosAll = createServerFn({ method: "GET" }).handler(async () => {
  await requireAuth();
  return db
    .select({
      id: pisos.id,
      nombre: pisos.nombre,
      sucursalId: pisos.sucursalId,
      sucursalNombre: sucursales.nombre,
    })
    .from(pisos)
    .leftJoin(sucursales, eq(pisos.sucursalId, sucursales.id))
    .orderBy(asc(pisos.nombre));
});

export const listOdontologos = createServerFn({ method: "GET" })
  .inputValidator((i: unknown) =>
    z
      .object({
        sucursalId: z.string().uuid().optional(),
        pisoId: z.string().uuid().optional(),
        soloActivos: z.boolean().optional(),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data }) => {
    const ctx = await requireAuth();
    if (ctx.sucursalIds.length === 0) return [];
    const conds = [];
    // Acota a las sucursales asignadas; si piden una específica, la valida.
    if (data.sucursalId) {
      if (!ctx.sucursalIds.includes(data.sucursalId)) return [];
      conds.push(eq(odontologos.sucursalId, data.sucursalId));
    } else {
      conds.push(inArray(odontologos.sucursalId, ctx.sucursalIds));
    }
    if (data.pisoId) conds.push(eq(odontologos.pisoId, data.pisoId));
    if (data.soloActivos) conds.push(eq(odontologos.activo, true));
    return db
      .select({
        id: odontologos.id,
        nombre: odontologos.nombre,
        numeroOd: odontologos.numeroOd,
        pisoId: odontologos.pisoId,
        sucursalId: odontologos.sucursalId,
        activo: odontologos.activo,
        sucursalNombre: sucursales.nombre,
        pisoNombre: pisos.nombre,
      })
      .from(odontologos)
      .leftJoin(sucursales, eq(odontologos.sucursalId, sucursales.id))
      .leftJoin(pisos, eq(odontologos.pisoId, pisos.id))
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(asc(odontologos.nombre));
  });

export const listNomencladores = createServerFn({ method: "GET" })
  .inputValidator((i: unknown) => z.object({ obraSocialId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    await requireAuth();
    return db
      .select()
      .from(nomencladores)
      .where(and(eq(nomencladores.obraSocialId, data.obraSocialId), eq(nomencladores.activo, true)))
      .orderBy(asc(nomencladores.plan), asc(nomencladores.codigo));
  });

export const listServiciosParticulares = createServerFn({ method: "GET" }).handler(async () => {
  await requireAuth();
  return db
    .select()
    .from(serviciosParticulares)
    .where(eq(serviciosParticulares.activo, true))
    .orderBy(asc(serviciosParticulares.descripcion));
});

// Pública (la usa el tótem sin login y el selector inicial): sucursales con slug + sus pisos.
export const getSucursalesTotem = createServerFn({ method: "GET" }).handler(async () => {
  const sucs = await db
    .select({ id: sucursales.id, nombre: sucursales.nombre, slug: sucursales.slug })
    .from(sucursales)
    .orderBy(asc(sucursales.nombre));
  const allPisos = await db
    .select({ nombre: pisos.nombre, sucursalId: pisos.sucursalId })
    .from(pisos)
    .orderBy(asc(pisos.nombre));
  return sucs
    .filter((s) => !!s.slug)
    .map((s) => ({
      slug: s.slug as string,
      nombre: s.nombre,
      pisos: allPisos.filter((p) => p.sucursalId === s.id).map((p) => p.nombre),
    }));
});

// ---------------------------------------------------------------------------
// Prestaciones (vista plana: 1 fila = 1 item de atención)
// ---------------------------------------------------------------------------

const odoSelf = async (ctx: AuthCtx): Promise<string[]> => {
  const rows = await db
    .select({ id: odontologos.id })
    .from(odontologos)
    .where(eq(odontologos.userId, ctx.userId));
  return rows.map((r) => r.id);
};

export const listPrestaciones = createServerFn({ method: "GET" })
  .inputValidator((i: unknown) =>
    z
      .object({
        desde: z.string(),
        hasta: z.string(),
        sucursalId: z.string().uuid().optional(),
        obraSocialId: z.string().uuid().optional(),
        odontologoId: z.string().uuid().optional(),
        limit: z.number().int().positive().max(2000).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    const ctx = await requireAuth();
    if (ctx.sucursalIds.length === 0) return [];

    // Scope por sede activa (validada contra las asignadas). Aplica a todos los roles.
    const sucursalId = resolveSucursal(ctx, data.sucursalId);
    const conds = [
      gte(atenciones.fecha, data.desde),
      lte(atenciones.fecha, data.hasta),
      eq(atenciones.sucursalId, sucursalId),
    ];
    if (data.obraSocialId) conds.push(eq(atenciones.obraSocialId, data.obraSocialId));
    if (data.odontologoId) conds.push(eq(atenciones.odontologoId, data.odontologoId));

    // El odontólogo (sin rol administrativo) ve solo sus propias prestaciones.
    if (!ctx.isStaff && ctx.roles.includes("odontologo") && !ctx.roles.includes("administrativo")) {
      const ids = await odoSelf(ctx);
      if (!ids.length) return [];
      conds.push(inArray(atenciones.odontologoId, ids));
    }

    const rows = await db
      .select({
        id: atencionItems.id,
        atencion_id: atenciones.id,
        fecha: atenciones.fecha,
        paciente: atenciones.paciente,
        dni: atenciones.dni,
        codigo_consulta: atenciones.codigoConsulta,
        primera_vez: atenciones.primeraVez,
        piso_id: atenciones.pisoId,
        observaciones: atenciones.observaciones,
        cantidad: atencionItems.cantidad,
        monto: atencionItems.monto,
        monto_paciente: atencionItems.montoPaciente,
        monto_usd: atencionItems.montoUsd,
        facturable: atencionItems.facturable,
        estado_placa: atencionItems.estadoPlaca,
        codigo_manual: atencionItems.codigoManual,
        descripcion_manual: atencionItems.descripcionManual,
        created_at: atenciones.createdAt,
        sucursal_nombre: sucursales.nombre,
        obra_nombre: obrasSociales.nombre,
        piso_nombre: pisos.nombre,
        odo_nombre: odontologos.nombre,
        odo_numero: odontologos.numeroOd,
        nom_codigo: nomencladores.codigo,
        nom_descripcion: nomencladores.descripcion,
        serv_codigo: serviciosParticulares.codigo,
        serv_descripcion: serviciosParticulares.descripcion,
      })
      .from(atencionItems)
      .innerJoin(atenciones, eq(atencionItems.atencionId, atenciones.id))
      .leftJoin(sucursales, eq(atenciones.sucursalId, sucursales.id))
      .leftJoin(obrasSociales, eq(atenciones.obraSocialId, obrasSociales.id))
      .leftJoin(pisos, eq(atenciones.pisoId, pisos.id))
      .leftJoin(odontologos, eq(atenciones.odontologoId, odontologos.id))
      .leftJoin(nomencladores, eq(atencionItems.nomencladorId, nomencladores.id))
      .leftJoin(
        serviciosParticulares,
        eq(atencionItems.servicioParticularId, serviciosParticulares.id),
      )
      .where(and(...conds))
      .orderBy(desc(atenciones.fecha), desc(atenciones.createdAt))
      .limit(data.limit ?? 500);

    // Forma compatible con los componentes existentes
    return rows.map((r) => ({
      id: r.id,
      atencion_id: r.atencion_id,
      fecha: r.fecha,
      paciente: r.paciente,
      dni: r.dni,
      codigo_consulta: r.codigo_consulta,
      primera_vez: r.primera_vez,
      piso_id: r.piso_id,
      cantidad: r.cantidad,
      monto: Number(r.monto),
      monto_paciente: r.monto_paciente === null ? null : Number(r.monto_paciente),
      monto_usd: r.monto_usd === null ? null : Number(r.monto_usd),
      facturable: r.facturable,
      estado_placa: r.estado_placa,
      observaciones: r.observaciones,
      codigo_manual: r.nom_codigo ? null : (r.serv_codigo ?? r.codigo_manual),
      descripcion_manual: r.nom_descripcion ? null : (r.serv_descripcion ?? r.descripcion_manual),
      sucursales: r.sucursal_nombre ? { nombre: r.sucursal_nombre } : null,
      obras_sociales: r.obra_nombre ? { nombre: r.obra_nombre } : null,
      pisos: r.piso_nombre ? { nombre: r.piso_nombre } : null,
      odontologos: r.odo_nombre ? { nombre: r.odo_nombre, numero_od: r.odo_numero } : null,
      nomencladores: r.nom_codigo ? { codigo: r.nom_codigo, descripcion: r.nom_descripcion } : null,
    }));
  });

// ---------------------------------------------------------------------------
// Crear atención (cabecera + N items)
// ---------------------------------------------------------------------------

const itemInput = z.object({
  nomencladorId: z.string().uuid().nullable().optional(),
  servicioParticularId: z.string().uuid().nullable().optional(),
  codigoManual: z.string().nullable().optional(),
  descripcionManual: z.string().nullable().optional(),
  cantidad: z.number().int().positive().default(1),
  monto: z.number().min(0).default(0),
  montoPaciente: z.number().min(0).nullable().optional(),
  montoUsd: z.number().min(0).nullable().optional(),
  cotizacionUsd: z.number().min(0).nullable().optional(),
  facturable: z.boolean().default(true),
  estadoPlaca: z.enum(SUBTIPO_VALUES).nullable().optional(),
});

export const createAtencion = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z
      .object({
        fecha: z.string(),
        paciente: z.string().min(1),
        dni: dniField,
        sucursalId: z.string().uuid(),
        obraSocialId: z.string().uuid(),
        pisoId: z.string().uuid().nullable().optional(),
        odontologoId: z.string().uuid(),
        codigoConsulta: z.string().nullable().optional(),
        primeraVez: z.boolean().default(false),
        observaciones: z.string().nullable().optional(),
        items: z.array(itemInput).min(1),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    const ctx = await requireAuth();
    requirePermission(ctx, "prestaciones", "create");
    // Solo se puede cargar en una sucursal asignada (aplica a todos los roles).
    if (!ctx.sucursalIds.includes(data.sucursalId)) {
      throw new Error("Solo podés cargar en una sucursal asignada");
    }

    const [atencion] = await db
      .insert(atenciones)
      .values({
        fecha: data.fecha,
        paciente: data.paciente.trim(),
        dni: data.dni.trim(),
        sucursalId: data.sucursalId,
        obraSocialId: data.obraSocialId,
        pisoId: data.pisoId ?? null,
        odontologoId: data.odontologoId,
        codigoConsulta: data.codigoConsulta?.trim() || null,
        primeraVez: data.primeraVez,
        observaciones: data.observaciones?.trim() || null,
        createdBy: ctx.userId,
      })
      .returning({ id: atenciones.id });

    await db.insert(atencionItems).values(
      data.items.map((it) => ({
        atencionId: atencion.id,
        nomencladorId: it.nomencladorId ?? null,
        servicioParticularId: it.servicioParticularId ?? null,
        codigoManual: it.codigoManual?.trim() || null,
        descripcionManual: it.descripcionManual?.trim() || null,
        cantidad: it.cantidad,
        monto: String(it.monto),
        montoPaciente:
          it.montoPaciente === null || it.montoPaciente === undefined
            ? null
            : String(it.montoPaciente),
        montoUsd: it.montoUsd === null || it.montoUsd === undefined ? null : String(it.montoUsd),
        cotizacionUsd:
          it.cotizacionUsd === null || it.cotizacionUsd === undefined
            ? null
            : String(it.cotizacionUsd),
        facturable: it.facturable,
        estadoPlaca: it.estadoPlaca ?? null,
      })),
    );

    // Alimenta la ficha de paciente (upsert por DNI): crea si es nuevo, refresca nombre/OS.
    await db
      .insert(pacientes)
      .values({
        dni: data.dni.trim(),
        nombre: data.paciente.trim(),
        obraSocialId: data.obraSocialId,
      })
      .onConflictDoUpdate({
        target: pacientes.dni,
        set: {
          nombre: data.paciente.trim(),
          obraSocialId: data.obraSocialId,
          updatedAt: new Date(),
        },
      });

    await logAudit(ctx, {
      action: "create",
      resource: "prestacion",
      entityId: atencion.id,
      resumen: `Cargó prestación de ${data.paciente.trim()} (DNI ${data.dni.trim()}) con ${data.items.length} ítem(s)`,
      sucursalId: data.sucursalId,
    });

    return { ok: true, atencionId: atencion.id };
  });

export const deleteAtencion = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ atencionId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const ctx = await requireAuth();
    requirePermission(ctx, "prestaciones", "delete");
    await db.delete(atenciones).where(eq(atenciones.id, data.atencionId));
    await logAudit(ctx, {
      action: "delete",
      resource: "prestacion",
      entityId: data.atencionId,
      resumen: "Borró una atención completa",
    });
    return { ok: true };
  });

export const updateAtencionItem = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z
      .object({
        itemId: z.string().uuid(),
        cantidad: z.number().int().positive().optional(),
        monto: z.number().min(0).optional(),
        montoPaciente: z.number().min(0).nullable().optional(),
        montoUsd: z.number().min(0).nullable().optional(),
        facturable: z.boolean().optional(),
        estadoPlaca: z.enum(SUBTIPO_VALUES).nullable().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    const ctx = await requireAuth();
    requirePermission(ctx, "prestaciones", "edit");
    await db
      .update(atencionItems)
      .set({
        ...(data.cantidad !== undefined ? { cantidad: data.cantidad } : {}),
        ...(data.monto !== undefined ? { monto: String(data.monto) } : {}),
        ...(data.montoPaciente !== undefined
          ? { montoPaciente: data.montoPaciente === null ? null : String(data.montoPaciente) }
          : {}),
        ...(data.montoUsd !== undefined
          ? { montoUsd: data.montoUsd === null ? null : String(data.montoUsd) }
          : {}),
        ...(data.facturable !== undefined ? { facturable: data.facturable } : {}),
        ...(data.estadoPlaca !== undefined ? { estadoPlaca: data.estadoPlaca } : {}),
      })
      .where(eq(atencionItems.id, data.itemId));
    await logAudit(ctx, {
      action: "update",
      resource: "prestacion",
      entityId: data.itemId,
      resumen: "Editó un ítem de prestación",
      meta: data,
    });
    return { ok: true };
  });

export const deleteAtencionItem = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ itemId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const ctx = await requireAuth();
    requirePermission(ctx, "prestaciones", "delete");
    // borrar el item; si era el último de la atención, borrar la cabecera huérfana
    const [item] = await db
      .select({ atencionId: atencionItems.atencionId })
      .from(atencionItems)
      .where(eq(atencionItems.id, data.itemId))
      .limit(1);
    await db.delete(atencionItems).where(eq(atencionItems.id, data.itemId));
    if (item) {
      const rest = await db
        .select({ id: atencionItems.id })
        .from(atencionItems)
        .where(eq(atencionItems.atencionId, item.atencionId))
        .limit(1);
      if (!rest.length) {
        await db.delete(atenciones).where(eq(atenciones.id, item.atencionId));
      }
    }
    await logAudit(ctx, {
      action: "delete",
      resource: "prestacion",
      entityId: data.itemId,
      resumen: "Borró un ítem de prestación",
    });
    return { ok: true };
  });

export const deleteAtencionItems = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z.object({ itemIds: z.array(z.string().uuid()).min(1).max(500) }).parse(i),
  )
  .handler(async ({ data }) => {
    const ctx = await requireAuth();
    requirePermission(ctx, "prestaciones", "delete");
    // atenciones afectadas, para limpiar cabeceras que queden sin ítems
    const afectadas = await db
      .selectDistinct({ atencionId: atencionItems.atencionId })
      .from(atencionItems)
      .where(inArray(atencionItems.id, data.itemIds));
    await db.delete(atencionItems).where(inArray(atencionItems.id, data.itemIds));
    for (const { atencionId } of afectadas) {
      const rest = await db
        .select({ id: atencionItems.id })
        .from(atencionItems)
        .where(eq(atencionItems.atencionId, atencionId))
        .limit(1);
      if (!rest.length) {
        await db.delete(atenciones).where(eq(atenciones.id, atencionId));
      }
    }
    await logAudit(ctx, {
      action: "delete",
      resource: "prestacion",
      resumen: `Borró ${data.itemIds.length} ítems de prestación en lote`,
    });
    return { ok: true, count: data.itemIds.length };
  });

export const updateAtencionCabecera = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z
      .object({
        atencionId: z.string().uuid(),
        fecha: z.string().optional(),
        paciente: z.string().min(1).optional(),
        dni: dniField.optional(),
        pisoId: z.string().uuid().nullable().optional(),
        observaciones: z.string().nullable().optional(),
        codigoConsulta: z.string().nullable().optional(),
        primeraVez: z.boolean().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    const ctx = await requireAuth();
    requirePermission(ctx, "prestaciones", "edit");
    await db
      .update(atenciones)
      .set({
        ...(data.fecha !== undefined ? { fecha: data.fecha } : {}),
        ...(data.paciente !== undefined ? { paciente: data.paciente } : {}),
        ...(data.dni !== undefined ? { dni: data.dni } : {}),
        ...(data.pisoId !== undefined ? { pisoId: data.pisoId } : {}),
        ...(data.observaciones !== undefined ? { observaciones: data.observaciones } : {}),
        ...(data.codigoConsulta !== undefined ? { codigoConsulta: data.codigoConsulta } : {}),
        ...(data.primeraVez !== undefined ? { primeraVez: data.primeraVez } : {}),
        updatedAt: new Date(),
      })
      .where(eq(atenciones.id, data.atencionId));
    await logAudit(ctx, {
      action: "update",
      resource: "prestacion",
      entityId: data.atencionId,
      resumen: "Editó la cabecera de una atención",
      meta: data,
    });
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// ABM de catálogos (solo admin)
// ---------------------------------------------------------------------------

export const createSucursal = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ nombre: z.string().min(1) }).parse(i))
  .handler(async ({ data }) => {
    const ctx = await requireAdmin();
    const [row] = await db
      .insert(sucursales)
      .values({ nombre: data.nombre.trim() })
      .returning({ id: sucursales.id });
    await logAudit(ctx, {
      action: "create",
      resource: "sucursal",
      entityId: row.id,
      resumen: `Creó la sucursal "${data.nombre.trim()}"`,
    });
    return { ok: true };
  });

export const deleteSucursal = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const ctx = await requireAdmin();
    await db.delete(sucursales).where(eq(sucursales.id, data.id));
    await logAudit(ctx, { action: "delete", resource: "sucursal", entityId: data.id });
    return { ok: true };
  });

export const createPiso = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z.object({ nombre: z.string().min(1), sucursalId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data }) => {
    const ctx = await requireAdmin();
    const [row] = await db
      .insert(pisos)
      .values({ nombre: data.nombre.trim(), sucursalId: data.sucursalId })
      .returning({ id: pisos.id });
    await logAudit(ctx, {
      action: "create",
      resource: "piso",
      entityId: row.id,
      resumen: `Creó el piso "${data.nombre.trim()}"`,
      sucursalId: data.sucursalId,
    });
    return { ok: true };
  });

export const deletePiso = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const ctx = await requireAdmin();
    await db.delete(pisos).where(eq(pisos.id, data.id));
    await logAudit(ctx, { action: "delete", resource: "piso", entityId: data.id });
    return { ok: true };
  });

export const createObraSocial = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z.object({ nombre: z.string().min(1), esParticular: z.boolean().default(false) }).parse(i),
  )
  .handler(async ({ data }) => {
    const ctx = await requireAdmin();
    const [row] = await db
      .insert(obrasSociales)
      .values({ nombre: data.nombre.trim(), esParticular: data.esParticular })
      .returning({ id: obrasSociales.id });
    await logAudit(ctx, {
      action: "create",
      resource: "obra_social",
      entityId: row.id,
      resumen: `Creó la obra social "${data.nombre.trim()}"`,
    });
    return { ok: true };
  });

export const toggleObraSocial = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid(), activa: z.boolean() }).parse(i))
  .handler(async ({ data }) => {
    const ctx = await requireAdmin();
    await db
      .update(obrasSociales)
      .set({ activa: data.activa })
      .where(eq(obrasSociales.id, data.id));
    await logAudit(ctx, {
      action: "update",
      resource: "obra_social",
      entityId: data.id,
      resumen: data.activa ? "Activó una obra social" : "Desactivó una obra social",
    });
    return { ok: true };
  });

export const deleteObraSocial = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const ctx = await requireAdmin();
    await db.delete(obrasSociales).where(eq(obrasSociales.id, data.id));
    await logAudit(ctx, { action: "delete", resource: "obra_social", entityId: data.id });
    return { ok: true };
  });

export const createOdontologo = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z
      .object({
        nombre: z.string().min(1),
        numeroOd: z.string().nullable().optional(),
        sucursalId: z.string().uuid(),
        pisoId: z.string().uuid().nullable().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    const ctx = await requireAdmin();
    const [row] = await db
      .insert(odontologos)
      .values({
        nombre: data.nombre.trim(),
        numeroOd: data.numeroOd?.trim() || null,
        sucursalId: data.sucursalId,
        pisoId: data.pisoId || null,
      })
      .returning({ id: odontologos.id });
    await logAudit(ctx, {
      action: "create",
      resource: "odontologo",
      entityId: row.id,
      resumen: `Creó al odontólogo "${data.nombre.trim()}"`,
      sucursalId: data.sucursalId,
    });
    return { ok: true };
  });

export const updateOdontologo = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        nombre: z.string().min(1).optional(),
        numeroOd: z.string().nullable().optional(),
        sucursalId: z.string().uuid().optional(),
        pisoId: z.string().uuid().nullable().optional(),
        activo: z.boolean().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    const ctx = await requireAdmin();
    await db
      .update(odontologos)
      .set({
        ...(data.nombre !== undefined ? { nombre: data.nombre.trim() } : {}),
        ...(data.numeroOd !== undefined ? { numeroOd: data.numeroOd?.trim() || null } : {}),
        ...(data.sucursalId !== undefined ? { sucursalId: data.sucursalId } : {}),
        ...(data.pisoId !== undefined ? { pisoId: data.pisoId } : {}),
        ...(data.activo !== undefined ? { activo: data.activo } : {}),
      })
      .where(eq(odontologos.id, data.id));
    await logAudit(ctx, {
      action: "update",
      resource: "odontologo",
      entityId: data.id,
      resumen: "Editó un odontólogo",
      meta: data,
    });
    return { ok: true };
  });

export const deleteOdontologo = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const ctx = await requireAdmin();
    await db.delete(odontologos).where(eq(odontologos.id, data.id));
    await logAudit(ctx, { action: "delete", resource: "odontologo", entityId: data.id });
    return { ok: true };
  });

export const createNomenclador = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z
      .object({
        obraSocialId: z.string().uuid(),
        plan: z.string().trim().min(1).nullable().optional(),
        codigo: z.string().min(1),
        descripcion: z.string().min(1),
        monto: z.number().min(0).default(0),
        montoPaciente: z.number().min(0).nullable().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    const ctx = await requireAdmin();
    const [row] = await db
      .insert(nomencladores)
      .values({
        obraSocialId: data.obraSocialId,
        plan: data.plan ?? null,
        codigo: data.codigo.trim(),
        descripcion: data.descripcion.trim(),
        monto: String(data.monto),
        montoPaciente: data.montoPaciente == null ? null : String(data.montoPaciente),
      })
      .returning({ id: nomencladores.id });
    await logAudit(ctx, {
      action: "create",
      resource: "precio",
      entityId: row.id,
      resumen: `Creó código ${data.codigo.trim()} ($${data.monto})`,
      meta: { tipo: "nomenclador", obraSocialId: data.obraSocialId, plan: data.plan ?? null },
    });
    return { ok: true };
  });

export const updateNomenclador = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        plan: z.string().trim().min(1).nullable().optional(),
        codigo: z.string().min(1).optional(),
        descripcion: z.string().min(1).optional(),
        monto: z.number().min(0).optional(),
        montoPaciente: z.number().min(0).nullable().optional(),
        activo: z.boolean().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    const ctx = await requireAdmin();
    const set: Record<string, unknown> = {};
    if (data.plan !== undefined) set.plan = data.plan;
    if (data.codigo !== undefined) set.codigo = data.codigo.trim();
    if (data.descripcion !== undefined) set.descripcion = data.descripcion.trim();
    if (data.monto !== undefined) set.monto = String(data.monto);
    if (data.montoPaciente !== undefined)
      set.montoPaciente = data.montoPaciente == null ? null : String(data.montoPaciente);
    if (data.activo !== undefined) set.activo = data.activo;
    if (Object.keys(set).length === 0) return { ok: true };
    await db.update(nomencladores).set(set).where(eq(nomencladores.id, data.id));
    await logAudit(ctx, {
      action: "update",
      resource: "precio",
      entityId: data.id,
      resumen:
        data.monto !== undefined ? `Actualizó un precio a $${data.monto}` : "Editó un código",
      meta: { tipo: "nomenclador", ...data },
    });
    return { ok: true };
  });

export const deleteNomenclador = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const ctx = await requireAdmin();
    await db.delete(nomencladores).where(eq(nomencladores.id, data.id));
    await logAudit(ctx, {
      action: "delete",
      resource: "precio",
      entityId: data.id,
      meta: { tipo: "nomenclador" },
    });
    return { ok: true };
  });

// ---- Importación / actualización masiva de nomencladores ----------------------
// Fila canónica del documento (la OS se elige en la UI, no viene en el archivo).
const nomencladorImportRow = z.object({
  codigo: z.string().trim().min(1),
  plan: z.string().trim().nullable().optional(),
  descripcion: z.string().trim().optional(),
  monto: z.number().min(0),
  copago: z.number().min(0).nullable().optional(),
});

const DELTA_WARN = 0.5; // ±50%: variación sospechosa (marca warning, no bloquea)
const keyOf = (plan: string | null | undefined, codigo: string) =>
  `${(plan ?? "").trim()}::${codigo.trim()}`;
const eqNum = (a: number | null, b: number | null) =>
  (a == null && b == null) || (a != null && b != null && Math.abs(a - b) < 0.01);

type ImportWarning = { codigo: string; plan: string | null; issue: string };

// Cruza las filas del documento contra la DB de la OS y arma el diff. No escribe.
async function buildImportDiff(obraSocialId: string, rows: unknown[]) {
  const warnings: ImportWarning[] = [];
  const parsed: z.infer<typeof nomencladorImportRow>[] = [];
  const seen = new Set<string>();
  for (const raw of rows) {
    const r = nomencladorImportRow.safeParse(raw);
    if (!r.success) {
      warnings.push({ codigo: String((raw as any)?.codigo ?? "?"), plan: null, issue: "fila inválida" });
      continue;
    }
    const k = keyOf(r.data.plan, r.data.codigo);
    if (seen.has(k)) {
      warnings.push({ codigo: r.data.codigo, plan: r.data.plan ?? null, issue: "duplicado en el archivo" });
      continue;
    }
    seen.add(k);
    if (r.data.copago != null && r.data.copago > r.data.monto)
      warnings.push({ codigo: r.data.codigo, plan: r.data.plan ?? null, issue: "copago mayor al monto" });
    parsed.push(r.data);
  }

  const dbRows = await db
    .select()
    .from(nomencladores)
    .where(eq(nomencladores.obraSocialId, obraSocialId));
  const dbByKey = new Map(dbRows.map((r) => [keyOf(r.plan, r.codigo), r]));
  const fileKeys = new Set(parsed.map((p) => keyOf(p.plan, p.codigo)));

  const toUpdate: {
    id: string;
    codigo: string;
    plan: string | null;
    montoOld: number;
    montoNew: number;
    copagoOld: number | null;
    copagoNew: number | null;
  }[] = [];
  const toCreate: {
    codigo: string;
    plan: string | null;
    descripcion: string;
    monto: number;
    copago: number | null;
  }[] = [];
  let unchanged = 0;

  for (const row of parsed) {
    const cur = dbByKey.get(keyOf(row.plan, row.codigo));
    const newCopago = row.copago ?? null;
    if (!cur) {
      toCreate.push({
        codigo: row.codigo,
        plan: row.plan ?? null,
        descripcion: row.descripcion ?? row.codigo,
        monto: row.monto,
        copago: newCopago,
      });
      continue;
    }
    const oldMonto = Number(cur.monto);
    const oldCopago = cur.montoPaciente == null ? null : Number(cur.montoPaciente);
    if (eqNum(oldMonto, row.monto) && eqNum(oldCopago, newCopago)) {
      unchanged++;
      continue;
    }
    if (row.monto === 0) warnings.push({ codigo: row.codigo, plan: row.plan ?? null, issue: "monto 0" });
    else if (oldMonto > 0) {
      const d = (row.monto - oldMonto) / oldMonto;
      if (Math.abs(d) > DELTA_WARN)
        warnings.push({ codigo: row.codigo, plan: row.plan ?? null, issue: `variación ${(d * 100).toFixed(0)}%` });
    }
    toUpdate.push({
      id: cur.id,
      codigo: row.codigo,
      plan: row.plan ?? null,
      montoOld: oldMonto,
      montoNew: row.monto,
      copagoOld: oldCopago,
      copagoNew: newCopago,
    });
  }
  const missingInFile = dbRows
    .filter((r) => !fileKeys.has(keyOf(r.plan, r.codigo)))
    .map((r) => ({ codigo: r.codigo, plan: r.plan }));

  return {
    toUpdate,
    toCreate,
    unchanged,
    missingInFile,
    warnings,
    dbCount: dbRows.length,
    fileCount: parsed.length,
  };
}

export const previewNomencladorImport = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z.object({ obraSocialId: z.string().uuid(), rows: z.array(z.unknown()).max(5000) }).parse(i),
  )
  .handler(async ({ data }) => {
    await requireAdmin();
    return buildImportDiff(data.obraSocialId, data.rows);
  });

export const applyNomencladorImport = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z
      .object({
        obraSocialId: z.string().uuid(),
        rows: z.array(z.unknown()).max(5000),
        createMissing: z.boolean().default(false),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    const ctx = await requireAdmin();
    const diff = await buildImportDiff(data.obraSocialId, data.rows);

    const stmts: unknown[] = [];
    const history: (typeof nomencladorPriceHistory.$inferInsert)[] = [];
    for (const u of diff.toUpdate) {
      stmts.push(
        db
          .update(nomencladores)
          .set({
            monto: String(u.montoNew),
            montoPaciente: u.copagoNew == null ? null : String(u.copagoNew),
          })
          .where(eq(nomencladores.id, u.id)),
      );
      history.push({
        nomencladorId: u.id,
        obraSocialId: data.obraSocialId,
        codigo: u.codigo,
        plan: u.plan,
        montoOld: String(u.montoOld),
        montoNew: String(u.montoNew),
        copagoOld: u.copagoOld == null ? null : String(u.copagoOld),
        copagoNew: u.copagoNew == null ? null : String(u.copagoNew),
        actorUserId: ctx.userId,
        source: "import",
      });
    }
    let created = 0;
    if (data.createMissing) {
      for (const c of diff.toCreate) {
        const id = crypto.randomUUID();
        stmts.push(
          db.insert(nomencladores).values({
            id,
            obraSocialId: data.obraSocialId,
            plan: c.plan,
            codigo: c.codigo,
            descripcion: c.descripcion,
            monto: String(c.monto),
            montoPaciente: c.copago == null ? null : String(c.copago),
          }),
        );
        history.push({
          nomencladorId: id,
          obraSocialId: data.obraSocialId,
          codigo: c.codigo,
          plan: c.plan,
          montoNew: String(c.monto),
          copagoNew: c.copago == null ? null : String(c.copago),
          actorUserId: ctx.userId,
          source: "import-create",
        });
        created++;
      }
    }
    if (history.length) stmts.push(db.insert(nomencladorPriceHistory).values(history));
    if (stmts.length) await db.batch(stmts as [any, ...any[]]);

    await logAudit(ctx, {
      action: "update",
      resource: "precio",
      resumen: `Import masivo: ${diff.toUpdate.length} actualizados${created ? `, ${created} nuevos` : ""}`,
      meta: { obraSocialId: data.obraSocialId, updated: diff.toUpdate.length, created, unchanged: diff.unchanged },
    });
    return { updated: diff.toUpdate.length, created, unchanged: diff.unchanged, warnings: diff.warnings.length };
  });

// Sube el PDF crudo (base64), lo parsea server-side y devuelve el mismo diff que el
// import por CSV, más el arquetipo detectado y las filas canónicas (que el cliente
// reenvía a applyNomencladorImport al confirmar). No escribe nada.
export const previewNomencladorImportPdf = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z
      .object({
        obraSocialId: z.string().uuid(),
        fileBase64: z.string().min(1),
        archetype: z.enum(["flat-ars", "flat-dotted", "matrix-plans"]).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    await requireAdmin();
    const bytes = Uint8Array.from(atob(data.fileBase64), (c) => c.charCodeAt(0));
    const { archetype, rows, parseWarnings } = await parsePdfToCanonical(bytes, data.archetype);
    const diff = await buildImportDiff(data.obraSocialId, rows);
    return { archetype, rows, parseWarnings, ...diff };
  });

// Listado completo (incluye inactivos) para la pantalla de Precios. Solo lectura,
// así que basta con estar autenticado; la edición sigue siendo admin.
export const listNomencladoresAdmin = createServerFn({ method: "GET" })
  .inputValidator((i: unknown) => z.object({ obraSocialId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    await requireAuth();
    return db
      .select()
      .from(nomencladores)
      .where(eq(nomencladores.obraSocialId, data.obraSocialId))
      .orderBy(asc(nomencladores.plan), asc(nomencladores.codigo));
  });

// Servicios particulares (catálogo USD)
export const listServiciosParticularesAdmin = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireAdmin();
    return db.select().from(serviciosParticulares).orderBy(asc(serviciosParticulares.descripcion));
  },
);

export const createServicioParticular = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z
      .object({
        codigo: z.string().nullable().optional(),
        descripcion: z.string().min(1),
        precioUsd: z.number().min(0).default(0),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    const ctx = await requireAdmin();
    const [row] = await db
      .insert(serviciosParticulares)
      .values({
        codigo: data.codigo?.trim() || null,
        descripcion: data.descripcion.trim(),
        precioUsd: String(data.precioUsd),
      })
      .returning({ id: serviciosParticulares.id });
    await logAudit(ctx, {
      action: "create",
      resource: "precio",
      entityId: row.id,
      resumen: `Creó servicio particular "${data.descripcion.trim()}" (USD ${data.precioUsd})`,
      meta: { tipo: "particular" },
    });
    return { ok: true };
  });

export const updateServicioParticular = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        codigo: z.string().trim().nullable().optional(),
        descripcion: z.string().trim().min(1).optional(),
        precioUsd: z.number().min(0).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    const ctx = await requireAdmin();
    const set: Record<string, unknown> = {};
    if (data.codigo !== undefined) set.codigo = data.codigo?.trim() || null;
    if (data.descripcion !== undefined) set.descripcion = data.descripcion.trim();
    if (data.precioUsd !== undefined) set.precioUsd = String(data.precioUsd);
    if (Object.keys(set).length === 0) return { ok: true };
    await db
      .update(serviciosParticulares)
      .set(set)
      .where(eq(serviciosParticulares.id, data.id));
    await logAudit(ctx, {
      action: "update",
      resource: "precio",
      entityId: data.id,
      resumen:
        data.precioUsd !== undefined
          ? `Actualizó precio particular a USD ${data.precioUsd}`
          : "Editó un servicio particular",
      meta: { tipo: "particular", ...data },
    });
    return { ok: true };
  });

export const deleteServicioParticular = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const ctx = await requireAdmin();
    await db.delete(serviciosParticulares).where(eq(serviciosParticulares.id, data.id));
    await logAudit(ctx, {
      action: "delete",
      resource: "precio",
      entityId: data.id,
      meta: { tipo: "particular" },
    });
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Arrivals (tótem público + panel de recepción)
// ---------------------------------------------------------------------------

export const createArrival = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z
      .object({
        tipoLlegada: z.string().min(1),
        tipoPaciente: z.string().min(1),
        tipoAtencion: z.string().min(1),
        cobertura: z.string().nullable().optional(),
        nombreApellido: z.string().min(1),
        dni: dniField,
        // Origen del tótem: slug de clínica (?clinica=caba) y nombre de piso (?piso=3).
        clinica: z.string().optional(),
        piso: z.string().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    // Pública: la usa el tótem sin autenticación.
    // Resuelve clínica (por slug) y piso (por nombre dentro de esa clínica).
    let sucursalId: string | null = null;
    let pisoId: string | null = null;
    if (data.clinica) {
      const [s] = await db
        .select({ id: sucursales.id })
        .from(sucursales)
        .where(eq(sucursales.slug, data.clinica.trim().toLowerCase()))
        .limit(1);
      sucursalId = s?.id ?? null;
      if (sucursalId && data.piso) {
        const [p] = await db
          .select({ id: pisos.id })
          .from(pisos)
          .where(and(eq(pisos.sucursalId, sucursalId), eq(pisos.nombre, data.piso.trim())))
          .limit(1);
        pisoId = p?.id ?? null;
      }
    }
    await db.insert(arrivals).values({
      tipoLlegada: data.tipoLlegada,
      tipoPaciente: data.tipoPaciente,
      tipoAtencion: data.tipoAtencion,
      cobertura: data.cobertura ?? null,
      nombreApellido: data.nombreApellido.trim(),
      dni: data.dni.trim(),
      sucursalId,
      pisoId,
      estado: "Pendiente",
    });
    return { ok: true };
  });

export const listArrivals = createServerFn({ method: "GET" })
  .inputValidator((i: unknown) =>
    z
      .object({
        from: z.string().optional(),
        to: z.string().optional(),
        sucursalId: z.string().uuid().optional(),
        pisoId: z.string().uuid().optional(),
        limit: z.number().int().positive().max(1000).optional(),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data }) => {
    const ctx = await requireAuth();
    const conds = [];
    if (data.from) conds.push(gte(arrivals.createdAt, new Date(data.from)));
    if (data.to) conds.push(lte(arrivals.createdAt, new Date(data.to)));
    // Scope por sucursal: la pedida (validada contra las asignadas) o la primera asignada.
    const sucursalId = data.sucursalId
      ? ctx.sucursalIds.includes(data.sucursalId)
        ? data.sucursalId
        : null
      : ctx.sucursalIds[0];
    if (sucursalId) conds.push(eq(arrivals.sucursalId, sucursalId));
    if (data.pisoId) conds.push(eq(arrivals.pisoId, data.pisoId));
    const rows = await db
      .select({
        id: arrivals.id,
        createdAt: arrivals.createdAt,
        tipoLlegada: arrivals.tipoLlegada,
        tipoPaciente: arrivals.tipoPaciente,
        tipoAtencion: arrivals.tipoAtencion,
        cobertura: arrivals.cobertura,
        nombreApellido: arrivals.nombreApellido,
        dni: arrivals.dni,
        estado: arrivals.estado,
        sucursalId: arrivals.sucursalId,
        sucursalNombre: sucursales.nombre,
        pisoId: arrivals.pisoId,
        pisoNombre: pisos.nombre,
      })
      .from(arrivals)
      .leftJoin(pisos, eq(arrivals.pisoId, pisos.id))
      .leftJoin(sucursales, eq(arrivals.sucursalId, sucursales.id))
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(arrivals.createdAt))
      .limit(data.limit ?? 500);
    // forma compatible con el componente (snake_case)
    return rows.map((a) => ({
      id: a.id,
      created_at: a.createdAt instanceof Date ? a.createdAt.toISOString() : String(a.createdAt),
      tipo_llegada: a.tipoLlegada,
      tipo_paciente: a.tipoPaciente,
      tipo_atencion: a.tipoAtencion,
      cobertura: a.cobertura,
      nombre_apellido: a.nombreApellido,
      dni: a.dni,
      estado: a.estado,
      sucursal_id: a.sucursalId,
      sucursal_nombre: a.sucursalNombre,
      piso_id: a.pisoId,
      piso_nombre: a.pisoNombre,
    }));
  });

export const updateArrivalEstado = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z.object({ id: z.string().uuid(), estado: z.string().min(1) }).parse(i),
  )
  .handler(async ({ data }) => {
    await requireAuth();
    await db.update(arrivals).set({ estado: data.estado }).where(eq(arrivals.id, data.id));
    return { ok: true };
  });

export const archiveOldArrivals = createServerFn({ method: "POST" }).handler(async () => {
  await requireAuth();
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  await db.delete(arrivals).where(lte(arrivals.createdAt, start));
  return { ok: true };
});

// ---------------------------------------------------------------------------
// Pacientes (ficha + autocompletado por DNI)
// ---------------------------------------------------------------------------

// Devuelve el paciente por DNI exacto (para autocompletar en la carga). null si no existe.
export const getPacienteByDni = createServerFn({ method: "GET" })
  .inputValidator((i: unknown) => z.object({ dni: z.string().min(1) }).parse(i))
  .handler(async ({ data }) => {
    await requireAuth();
    const [p] = await db
      .select()
      .from(pacientes)
      .where(eq(pacientes.dni, data.dni.trim()))
      .limit(1);
    if (!p) return null;
    return {
      id: p.id,
      dni: p.dni,
      nombre: p.nombre,
      telefono: p.telefono,
      obra_social_id: p.obraSocialId,
      notas: p.notas,
    };
  });

// Listado de pacientes con búsqueda opcional por nombre o DNI.
// Se acota a la sucursal pedida: aparecen los pacientes con al menos una atención en esa sede.
export const listPacientes = createServerFn({ method: "GET" })
  .inputValidator((i: unknown) =>
    z
      .object({
        q: z.string().optional(),
        sucursalId: z.string().uuid().optional(),
        limit: z.number().int().positive().max(1000).optional(),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data }) => {
    const ctx = await requireAuth();
    const q = data.q?.trim().toLowerCase();
    // Sede a filtrar: la pedida (validada) o la primera asignada.
    const sucursalId = data.sucursalId
      ? ctx.sucursalIds.includes(data.sucursalId)
        ? data.sucursalId
        : null
      : ctx.sucursalIds[0];
    if (!sucursalId) return [];
    const rows = await db
      .select({
        id: pacientes.id,
        dni: pacientes.dni,
        nombre: pacientes.nombre,
        telefono: pacientes.telefono,
        obraNombre: obrasSociales.nombre,
        updatedAt: pacientes.updatedAt,
      })
      .from(pacientes)
      .leftJoin(obrasSociales, eq(pacientes.obraSocialId, obrasSociales.id))
      .where(
        sql`EXISTS (SELECT 1 FROM ${atenciones} a WHERE a.dni = ${pacientes.dni} AND a.sucursal_id = ${sucursalId})`,
      )
      .orderBy(asc(pacientes.nombre))
      .limit(q ? 2000 : (data.limit ?? 500));
    const filtered = q
      ? rows.filter((r) => `${r.nombre} ${r.dni}`.toLowerCase().includes(q))
      : rows;
    return filtered.map((r) => ({
      id: r.id,
      dni: r.dni,
      nombre: r.nombre,
      telefono: r.telefono,
      obra_nombre: r.obraNombre,
      updated_at: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r.updatedAt),
    }));
  });

// Historial completo de atenciones de un paciente (todas las sedes), vista plana por línea.
export const getPacienteHistorial = createServerFn({ method: "GET" })
  .inputValidator((i: unknown) => z.object({ dni: z.string().min(1) }).parse(i))
  .handler(async ({ data }) => {
    await requireAuth();
    const rows = await db
      .select({
        id: atencionItems.id,
        atencion_id: atenciones.id,
        fecha: atenciones.fecha,
        paciente: atenciones.paciente,
        primera_vez: atenciones.primeraVez,
        cantidad: atencionItems.cantidad,
        monto: atencionItems.monto,
        facturable: atencionItems.facturable,
        codigo_manual: atencionItems.codigoManual,
        descripcion_manual: atencionItems.descripcionManual,
        sucursal_nombre: sucursales.nombre,
        obra_nombre: obrasSociales.nombre,
        odo_nombre: odontologos.nombre,
        nom_codigo: nomencladores.codigo,
        nom_descripcion: nomencladores.descripcion,
      })
      .from(atencionItems)
      .innerJoin(atenciones, eq(atencionItems.atencionId, atenciones.id))
      .leftJoin(sucursales, eq(atenciones.sucursalId, sucursales.id))
      .leftJoin(obrasSociales, eq(atenciones.obraSocialId, obrasSociales.id))
      .leftJoin(odontologos, eq(atenciones.odontologoId, odontologos.id))
      .leftJoin(nomencladores, eq(atencionItems.nomencladorId, nomencladores.id))
      .where(eq(atenciones.dni, data.dni.trim()))
      .orderBy(desc(atenciones.fecha), desc(atenciones.createdAt));
    return rows.map((r) => ({
      id: r.id,
      atencion_id: r.atencion_id,
      fecha: r.fecha,
      primera_vez: r.primera_vez,
      cantidad: r.cantidad,
      monto: Number(r.monto),
      facturable: r.facturable,
      sucursal_nombre: r.sucursal_nombre,
      obra_nombre: r.obra_nombre,
      odo_nombre: r.odo_nombre,
      codigo: r.nom_codigo ?? r.codigo_manual,
      descripcion: r.nom_descripcion ?? r.descripcion_manual,
    }));
  });
