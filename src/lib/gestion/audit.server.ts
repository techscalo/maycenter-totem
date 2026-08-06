import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db/client";
import { auditLog, sucursales } from "@/db/schema";
import { requireAuth } from "@/lib/gestion/session.server";

// Listado del registro de cambios, con filtros y paginación. Solo dirección/admin
// (en F2 pasa a gobernarse por el permiso registro:view).
export const listAuditLog = createServerFn({ method: "GET" })
  .inputValidator((i: unknown) =>
    z
      .object({
        actorUserId: z.string().optional(),
        resource: z.string().optional(),
        action: z.enum(["create", "update", "delete", "login"]).optional(),
        desde: z.string().optional(),
        hasta: z.string().optional(),
        limit: z.number().int().positive().max(500).optional(),
        offset: z.number().int().min(0).optional(),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data }) => {
    const ctx = await requireAuth();
    if (!ctx.isStaff) throw new Error("Sin permiso");

    const conds = [];
    if (data.actorUserId) conds.push(eq(auditLog.actorUserId, data.actorUserId));
    if (data.resource) conds.push(eq(auditLog.resource, data.resource));
    if (data.action) conds.push(eq(auditLog.action, data.action));
    if (data.desde) conds.push(gte(auditLog.createdAt, new Date(data.desde)));
    if (data.hasta) conds.push(lte(auditLog.createdAt, new Date(data.hasta)));

    const rows = await db
      .select({
        id: auditLog.id,
        actorUserId: auditLog.actorUserId,
        actorNombre: auditLog.actorNombre,
        action: auditLog.action,
        resource: auditLog.resource,
        entityId: auditLog.entityId,
        resumen: auditLog.resumen,
        createdAt: auditLog.createdAt,
        sucursalNombre: sucursales.nombre,
      })
      .from(auditLog)
      .leftJoin(sucursales, eq(auditLog.sucursalId, sucursales.id))
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(auditLog.createdAt))
      .limit(data.limit ?? 100)
      .offset(data.offset ?? 0);

    return rows.map((r) => ({
      id: r.id,
      actor_user_id: r.actorUserId,
      actor_nombre: r.actorNombre,
      action: r.action,
      resource: r.resource,
      entity_id: r.entityId,
      resumen: r.resumen,
      sucursal_nombre: r.sucursalNombre,
      created_at: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    }));
  });

// Lista de actores distintos (para el filtro por usuario del registro).
export const listAuditActores = createServerFn({ method: "GET" }).handler(async () => {
  const ctx = await requireAuth();
  if (!ctx.isStaff) return [];
  const rows = await db
    .selectDistinct({ userId: auditLog.actorUserId, nombre: auditLog.actorNombre })
    .from(auditLog);
  return rows
    .filter((r) => r.userId)
    .map((r) => ({ user_id: r.userId as string, nombre: r.nombre ?? "—" }));
});
