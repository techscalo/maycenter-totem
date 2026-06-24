import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "@/db/client";
import {
  sucursales,
  pisos,
  obrasSociales,
  odontologos,
  nomencladores,
  serviciosParticulares,
  atenciones,
  atencionItems,
  arrivals,
} from "@/db/schema";
import { requireAuth, requireAdmin, type AuthCtx } from "@/lib/gestion/session.server";

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
    await requireAuth();
    const conds = [];
    if (data.sucursalId) conds.push(eq(odontologos.sucursalId, data.sucursalId));
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
      .where(
        and(eq(nomencladores.obraSocialId, data.obraSocialId), eq(nomencladores.activo, true)),
      )
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

    const conds = [gte(atenciones.fecha, data.desde), lte(atenciones.fecha, data.hasta)];
    if (data.sucursalId) conds.push(eq(atenciones.sucursalId, data.sucursalId));
    if (data.obraSocialId) conds.push(eq(atenciones.obraSocialId, data.obraSocialId));
    if (data.odontologoId) conds.push(eq(atenciones.odontologoId, data.odontologoId));

    // Autorización (ex-RLS)
    if (!ctx.isStaff) {
      if (ctx.roles.includes("administrativo")) {
        if (ctx.sucursalId) conds.push(eq(atenciones.sucursalId, ctx.sucursalId));
        else return [];
      } else if (ctx.roles.includes("odontologo")) {
        const ids = await odoSelf(ctx);
        if (!ids.length) return [];
        conds.push(inArray(atenciones.odontologoId, ids));
      } else {
        return [];
      }
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
        observaciones: atenciones.observaciones,
        cantidad: atencionItems.cantidad,
        monto: atencionItems.monto,
        monto_usd: atencionItems.montoUsd,
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
      .leftJoin(serviciosParticulares, eq(atencionItems.servicioParticularId, serviciosParticulares.id))
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
      cantidad: r.cantidad,
      monto: Number(r.monto),
      monto_usd: r.monto_usd === null ? null : Number(r.monto_usd),
      observaciones: r.observaciones,
      codigo_manual: r.nom_codigo ? null : (r.serv_codigo ?? r.codigo_manual),
      descripcion_manual: r.nom_descripcion ? null : (r.serv_descripcion ?? r.descripcion_manual),
      sucursales: r.sucursal_nombre ? { nombre: r.sucursal_nombre } : null,
      obras_sociales: r.obra_nombre ? { nombre: r.obra_nombre } : null,
      pisos: r.piso_nombre ? { nombre: r.piso_nombre } : null,
      odontologos: r.odo_nombre ? { nombre: r.odo_nombre, numero_od: r.odo_numero } : null,
      nomencladores: r.nom_codigo
        ? { codigo: r.nom_codigo, descripcion: r.nom_descripcion }
        : null,
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
  montoUsd: z.number().min(0).nullable().optional(),
  cotizacionUsd: z.number().min(0).nullable().optional(),
});

export const createAtencion = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z
      .object({
        fecha: z.string(),
        paciente: z.string().min(1),
        dni: z.string().min(1),
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
    if (!ctx.isStaff && !ctx.roles.includes("administrativo")) {
      throw new Error("No tenés permiso para cargar prestaciones");
    }
    // administrativo: forzar su sucursal
    if (!ctx.isStaff && ctx.roles.includes("administrativo")) {
      if (!ctx.sucursalId || ctx.sucursalId !== data.sucursalId) {
        throw new Error("Solo podés cargar en tu sucursal");
      }
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
        montoUsd: it.montoUsd === null || it.montoUsd === undefined ? null : String(it.montoUsd),
        cotizacionUsd:
          it.cotizacionUsd === null || it.cotizacionUsd === undefined
            ? null
            : String(it.cotizacionUsd),
      })),
    );

    return { ok: true, atencionId: atencion.id };
  });

export const deleteAtencion = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ atencionId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const ctx = await requireAuth();
    if (!ctx.isStaff && !ctx.roles.includes("administrativo")) {
      throw new Error("No tenés permiso");
    }
    await db.delete(atenciones).where(eq(atenciones.id, data.atencionId));
    return { ok: true };
  });

export const updateAtencionItem = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z
      .object({
        itemId: z.string().uuid(),
        cantidad: z.number().int().positive().optional(),
        monto: z.number().min(0).optional(),
        montoUsd: z.number().min(0).nullable().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    const ctx = await requireAuth();
    if (!ctx.isStaff && !ctx.roles.includes("administrativo")) throw new Error("Sin permiso");
    await db
      .update(atencionItems)
      .set({
        ...(data.cantidad !== undefined ? { cantidad: data.cantidad } : {}),
        ...(data.monto !== undefined ? { monto: String(data.monto) } : {}),
        ...(data.montoUsd !== undefined
          ? { montoUsd: data.montoUsd === null ? null : String(data.montoUsd) }
          : {}),
      })
      .where(eq(atencionItems.id, data.itemId));
    return { ok: true };
  });

export const deleteAtencionItem = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ itemId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const ctx = await requireAuth();
    if (!ctx.isStaff && !ctx.roles.includes("administrativo")) throw new Error("Sin permiso");
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
    return { ok: true };
  });

export const updateAtencionCabecera = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z
      .object({
        atencionId: z.string().uuid(),
        paciente: z.string().min(1).optional(),
        dni: z.string().min(1).optional(),
        observaciones: z.string().nullable().optional(),
        codigoConsulta: z.string().nullable().optional(),
        primeraVez: z.boolean().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    const ctx = await requireAuth();
    if (!ctx.isStaff && !ctx.roles.includes("administrativo")) throw new Error("Sin permiso");
    await db
      .update(atenciones)
      .set({
        ...(data.paciente !== undefined ? { paciente: data.paciente } : {}),
        ...(data.dni !== undefined ? { dni: data.dni } : {}),
        ...(data.observaciones !== undefined ? { observaciones: data.observaciones } : {}),
        ...(data.codigoConsulta !== undefined ? { codigoConsulta: data.codigoConsulta } : {}),
        ...(data.primeraVez !== undefined ? { primeraVez: data.primeraVez } : {}),
        updatedAt: new Date(),
      })
      .where(eq(atenciones.id, data.atencionId));
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// ABM de catálogos (solo admin)
// ---------------------------------------------------------------------------

export const createSucursal = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ nombre: z.string().min(1) }).parse(i))
  .handler(async ({ data }) => {
    await requireAdmin();
    await db.insert(sucursales).values({ nombre: data.nombre.trim() });
    return { ok: true };
  });

export const deleteSucursal = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    await requireAdmin();
    await db.delete(sucursales).where(eq(sucursales.id, data.id));
    return { ok: true };
  });

export const createPiso = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z.object({ nombre: z.string().min(1), sucursalId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data }) => {
    await requireAdmin();
    await db.insert(pisos).values({ nombre: data.nombre.trim(), sucursalId: data.sucursalId });
    return { ok: true };
  });

export const deletePiso = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    await requireAdmin();
    await db.delete(pisos).where(eq(pisos.id, data.id));
    return { ok: true };
  });

export const createObraSocial = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z.object({ nombre: z.string().min(1), esParticular: z.boolean().default(false) }).parse(i),
  )
  .handler(async ({ data }) => {
    await requireAdmin();
    await db
      .insert(obrasSociales)
      .values({ nombre: data.nombre.trim(), esParticular: data.esParticular });
    return { ok: true };
  });

export const toggleObraSocial = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z.object({ id: z.string().uuid(), activa: z.boolean() }).parse(i),
  )
  .handler(async ({ data }) => {
    await requireAdmin();
    await db.update(obrasSociales).set({ activa: data.activa }).where(eq(obrasSociales.id, data.id));
    return { ok: true };
  });

export const deleteObraSocial = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    await requireAdmin();
    await db.delete(obrasSociales).where(eq(obrasSociales.id, data.id));
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
    await requireAdmin();
    await db.insert(odontologos).values({
      nombre: data.nombre.trim(),
      numeroOd: data.numeroOd?.trim() || null,
      sucursalId: data.sucursalId,
      pisoId: data.pisoId || null,
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
    await requireAdmin();
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
    return { ok: true };
  });

export const deleteOdontologo = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    await requireAdmin();
    await db.delete(odontologos).where(eq(odontologos.id, data.id));
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
    await requireAdmin();
    await db.insert(nomencladores).values({
      obraSocialId: data.obraSocialId,
      plan: data.plan ?? null,
      codigo: data.codigo.trim(),
      descripcion: data.descripcion.trim(),
      monto: String(data.monto),
      montoPaciente: data.montoPaciente == null ? null : String(data.montoPaciente),
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
    await requireAdmin();
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
    return { ok: true };
  });

export const deleteNomenclador = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    await requireAdmin();
    await db.delete(nomencladores).where(eq(nomencladores.id, data.id));
    return { ok: true };
  });

export const listNomencladoresAdmin = createServerFn({ method: "GET" })
  .inputValidator((i: unknown) => z.object({ obraSocialId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    await requireAdmin();
    return db
      .select()
      .from(nomencladores)
      .where(eq(nomencladores.obraSocialId, data.obraSocialId))
      .orderBy(asc(nomencladores.plan), asc(nomencladores.codigo));
  });

// Servicios particulares (catálogo USD)
export const listServiciosParticularesAdmin = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  return db.select().from(serviciosParticulares).orderBy(asc(serviciosParticulares.descripcion));
});

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
    await requireAdmin();
    await db.insert(serviciosParticulares).values({
      codigo: data.codigo?.trim() || null,
      descripcion: data.descripcion.trim(),
      precioUsd: String(data.precioUsd),
    });
    return { ok: true };
  });

export const updateServicioParticular = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z.object({ id: z.string().uuid(), precioUsd: z.number().min(0) }).parse(i),
  )
  .handler(async ({ data }) => {
    await requireAdmin();
    await db
      .update(serviciosParticulares)
      .set({ precioUsd: String(data.precioUsd) })
      .where(eq(serviciosParticulares.id, data.id));
    return { ok: true };
  });

export const deleteServicioParticular = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    await requireAdmin();
    await db.delete(serviciosParticulares).where(eq(serviciosParticulares.id, data.id));
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
        dni: z.string().min(1),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    // Pública: la usa el tótem sin autenticación
    await db.insert(arrivals).values({
      tipoLlegada: data.tipoLlegada,
      tipoPaciente: data.tipoPaciente,
      tipoAtencion: data.tipoAtencion,
      cobertura: data.cobertura ?? null,
      nombreApellido: data.nombreApellido.trim(),
      dni: data.dni.trim(),
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
        limit: z.number().int().positive().max(1000).optional(),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data }) => {
    await requireAuth();
    const conds = [];
    if (data.from) conds.push(gte(arrivals.createdAt, new Date(data.from)));
    if (data.to) conds.push(lte(arrivals.createdAt, new Date(data.to)));
    const rows = await db
      .select()
      .from(arrivals)
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
