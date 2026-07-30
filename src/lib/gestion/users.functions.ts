import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { profiles, userRoles, sucursales, userSucursales, userPermissions } from "@/db/schema";
import { user as userTable, account as accountTable } from "@/db/auth-schema";
import { requireAdmin } from "@/lib/gestion/session.server";
import { logAudit } from "@/lib/gestion/audit";
import { presetForRole } from "@/lib/gestion/permissions";

// Convierte claves "resource:action" en filas de user_permissions.
function permRows(userId: string, keys: string[]) {
  return keys
    .map((k) => {
      const [resource, action] = k.split(":");
      return resource && action ? { userId, resource, action } : null;
    })
    .filter((r): r is { userId: string; resource: string; action: string } => r !== null);
}

const roleEnum = z.enum(["admin", "administrativo", "direccion", "odontologo", "recepcionista"]);

async function hashPassword(password: string): Promise<string> {
  const ctx = await auth.$context;
  return ctx.password.hash(password);
}

export const listGestionUsers = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();

  const profs = await db
    .select({
      userId: profiles.userId,
      nombre: profiles.nombre,
      email: userTable.email,
      createdAt: userTable.createdAt,
    })
    .from(profiles)
    .leftJoin(userTable, eq(profiles.userId, userTable.id));

  const ids = profs.map((p) => p.userId);
  let rolesByUser: Record<string, string[]> = {};
  let sucsByUser: Record<string, { id: string; nombre: string }[]> = {};
  let permsByUser: Record<string, string[]> = {};
  if (ids.length) {
    const roles = await db
      .select({ userId: userRoles.userId, role: userRoles.role })
      .from(userRoles)
      .where(inArray(userRoles.userId, ids));
    rolesByUser = roles.reduce(
      (acc, r) => {
        (acc[r.userId] ||= []).push(r.role);
        return acc;
      },
      {} as Record<string, string[]>,
    );

    const sucs = await db
      .select({
        userId: userSucursales.userId,
        id: userSucursales.sucursalId,
        nombre: sucursales.nombre,
      })
      .from(userSucursales)
      .leftJoin(sucursales, eq(userSucursales.sucursalId, sucursales.id))
      .where(inArray(userSucursales.userId, ids));
    sucsByUser = sucs.reduce(
      (acc, s) => {
        (acc[s.userId] ||= []).push({ id: s.id, nombre: s.nombre ?? "" });
        return acc;
      },
      {} as Record<string, { id: string; nombre: string }[]>,
    );

    const perms = await db
      .select({
        userId: userPermissions.userId,
        resource: userPermissions.resource,
        action: userPermissions.action,
      })
      .from(userPermissions)
      .where(inArray(userPermissions.userId, ids));
    permsByUser = perms.reduce(
      (acc, p) => {
        (acc[p.userId] ||= []).push(`${p.resource}:${p.action}`);
        return acc;
      },
      {} as Record<string, string[]>,
    );
  }

  return profs
    .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))
    .map((p) => ({
      user_id: p.userId,
      nombre: p.nombre,
      email: p.email ?? "",
      sucursales: sucsByUser[p.userId] ?? [],
      sucursal_ids: (sucsByUser[p.userId] ?? []).map((s) => s.id),
      roles: rolesByUser[p.userId] ?? [],
      // Filas cargadas (vacío = usa el preset del rol como fallback).
      permissions: permsByUser[p.userId] ?? [],
    }));
});

export const createGestionUser = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        email: z.string().email(),
        password: z.string().min(6).max(72),
        nombre: z.string().min(1).max(120),
        role: roleEnum,
        sucursal_ids: z.array(z.string().uuid()).min(1),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const ctx = await requireAdmin();

    const existing = await db
      .select({ id: userTable.id })
      .from(userTable)
      .where(eq(userTable.email, data.email.toLowerCase()))
      .limit(1);
    if (existing.length) throw new Error("Ya existe un usuario con ese email");

    const userId = crypto.randomUUID();
    const now = new Date();
    const hash = await hashPassword(data.password);

    await db.insert(userTable).values({
      id: userId,
      name: data.nombre,
      email: data.email.toLowerCase(),
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(accountTable).values({
      id: crypto.randomUUID(),
      accountId: userId,
      providerId: "credential",
      userId,
      password: hash,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(profiles).values({
      userId,
      nombre: data.nombre,
    });
    await db.insert(userRoles).values({ userId, role: data.role });
    await db
      .insert(userSucursales)
      .values(data.sucursal_ids.map((sucursalId) => ({ userId, sucursalId })));

    // Permisos iniciales = preset del rol (el admin los ajusta luego).
    const preset = permRows(userId, presetForRole(data.role));
    if (preset.length) await db.insert(userPermissions).values(preset);

    await logAudit(ctx, {
      action: "create",
      resource: "usuario",
      entityId: userId,
      resumen: `Creó el usuario ${data.email.toLowerCase()} (${data.role})`,
    });

    return { ok: true, user_id: userId };
  });

export const updateGestionUser = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        user_id: z.string(),
        nombre: z.string().min(1).max(120).optional(),
        sucursal_ids: z.array(z.string().uuid()).min(1).optional(),
        role: roleEnum.optional(),
        new_password: z.string().min(6).max(72).optional(),
        // Matriz de permisos "resource:action". Si viene, reemplaza los del usuario.
        permissions: z.array(z.string()).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const ctx = await requireAdmin();

    if (data.nombre !== undefined) {
      await db
        .update(profiles)
        .set({ nombre: data.nombre, updatedAt: new Date() })
        .where(eq(profiles.userId, data.user_id));
    }

    if (data.sucursal_ids) {
      await db.delete(userSucursales).where(eq(userSucursales.userId, data.user_id));
      await db
        .insert(userSucursales)
        .values(data.sucursal_ids.map((sucursalId) => ({ userId: data.user_id, sucursalId })));
    }

    if (data.role) {
      await db.delete(userRoles).where(eq(userRoles.userId, data.user_id));
      await db.insert(userRoles).values({ userId: data.user_id, role: data.role });
    }

    // Permisos: si vienen explícitos, se setean tal cual. Si solo cambió el rol
    // (sin matriz), se re-aplica el preset del nuevo rol.
    if (data.permissions) {
      await db.delete(userPermissions).where(eq(userPermissions.userId, data.user_id));
      const rows = permRows(data.user_id, data.permissions);
      if (rows.length) await db.insert(userPermissions).values(rows);
    } else if (data.role) {
      await db.delete(userPermissions).where(eq(userPermissions.userId, data.user_id));
      const rows = permRows(data.user_id, presetForRole(data.role));
      if (rows.length) await db.insert(userPermissions).values(rows);
    }

    if (data.new_password) {
      const hash = await hashPassword(data.new_password);
      await db
        .update(accountTable)
        .set({ password: hash, updatedAt: new Date() })
        .where(eq(accountTable.userId, data.user_id));
    }

    const cambios = [
      data.nombre !== undefined && "nombre",
      data.role && "rol",
      data.sucursal_ids && "sucursales",
      data.new_password && "contraseña",
    ].filter(Boolean);
    await logAudit(ctx, {
      action: "update",
      resource: "usuario",
      entityId: data.user_id,
      resumen: `Editó un usuario (${cambios.join(", ") || "sin cambios"})`,
      meta: { role: data.role, sucursal_ids: data.sucursal_ids, cambio_password: !!data.new_password },
    });

    return { ok: true };
  });

export const deleteGestionUser = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ user_id: z.string() }).parse(input))
  .handler(async ({ data }) => {
    const ctx = await requireAdmin();
    if (data.user_id === ctx.userId) throw new Error("No podés eliminarte a vos mismo");
    await db.delete(userRoles).where(eq(userRoles.userId, data.user_id));
    await db.delete(userSucursales).where(eq(userSucursales.userId, data.user_id));
    await db.delete(userPermissions).where(eq(userPermissions.userId, data.user_id));
    await db.delete(profiles).where(eq(profiles.userId, data.user_id));
    await db.delete(userTable).where(eq(userTable.id, data.user_id)); // cascade: session, account
    await logAudit(ctx, {
      action: "delete",
      resource: "usuario",
      entityId: data.user_id,
      resumen: "Eliminó un usuario",
    });
    return { ok: true };
  });
