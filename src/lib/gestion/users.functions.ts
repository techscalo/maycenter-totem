import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { profiles, userRoles, sucursales } from "@/db/schema";
import { user as userTable, account as accountTable } from "@/db/auth-schema";
import { requireAdmin } from "@/lib/gestion/session.server";

const roleEnum = z.enum(["admin", "administrativo", "direccion", "odontologo"]);

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
      sucursalId: profiles.sucursalId,
      sucursalNombre: sucursales.nombre,
      email: userTable.email,
      createdAt: userTable.createdAt,
    })
    .from(profiles)
    .leftJoin(sucursales, eq(profiles.sucursalId, sucursales.id))
    .leftJoin(userTable, eq(profiles.userId, userTable.id));

  const ids = profs.map((p) => p.userId);
  let rolesByUser: Record<string, string[]> = {};
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
  }

  return profs
    .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))
    .map((p) => ({
      user_id: p.userId,
      nombre: p.nombre,
      email: p.email ?? "",
      sucursal_id: p.sucursalId,
      sucursal_nombre: p.sucursalNombre ?? null,
      roles: rolesByUser[p.userId] ?? [],
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
        sucursal_id: z.string().uuid().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    await requireAdmin();

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
      sucursalId: data.sucursal_id ?? null,
    });
    await db.insert(userRoles).values({ userId, role: data.role });

    return { ok: true, user_id: userId };
  });

export const updateGestionUser = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        user_id: z.string(),
        nombre: z.string().min(1).max(120).optional(),
        sucursal_id: z.string().uuid().nullable().optional(),
        role: roleEnum.optional(),
        new_password: z.string().min(6).max(72).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    await requireAdmin();

    if (data.nombre !== undefined || data.sucursal_id !== undefined) {
      await db
        .update(profiles)
        .set({
          ...(data.nombre !== undefined ? { nombre: data.nombre } : {}),
          ...(data.sucursal_id !== undefined ? { sucursalId: data.sucursal_id } : {}),
          updatedAt: new Date(),
        })
        .where(eq(profiles.userId, data.user_id));
    }

    if (data.role) {
      await db.delete(userRoles).where(eq(userRoles.userId, data.user_id));
      await db.insert(userRoles).values({ userId: data.user_id, role: data.role });
    }

    if (data.new_password) {
      const hash = await hashPassword(data.new_password);
      await db
        .update(accountTable)
        .set({ password: hash, updatedAt: new Date() })
        .where(eq(accountTable.userId, data.user_id));
    }

    return { ok: true };
  });

export const deleteGestionUser = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ user_id: z.string() }).parse(input))
  .handler(async ({ data }) => {
    const ctx = await requireAdmin();
    if (data.user_id === ctx.userId) throw new Error("No podés eliminarte a vos mismo");
    await db.delete(userRoles).where(eq(userRoles.userId, data.user_id));
    await db.delete(profiles).where(eq(profiles.userId, data.user_id));
    await db.delete(userTable).where(eq(userTable.id, data.user_id)); // cascade: session, account
    return { ok: true };
  });
