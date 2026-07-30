import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { eq, asc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { profiles, userRoles, sucursales, userSucursales, userPermissions } from "@/db/schema";
import { effectivePermissions } from "@/lib/gestion/permissions";

export type AppRole = "admin" | "administrativo" | "direccion" | "odontologo" | "recepcionista";

export const getUserContext = createServerFn({ method: "GET" }).handler(async () => {
  const headers = new Headers(getRequestHeaders() as HeadersInit);
  const session = await auth.api.getSession({ headers });
  if (!session?.user) return null;

  const userId = session.user.id;

  const [profileRow] = await db
    .select({
      id: profiles.id,
      userId: profiles.userId,
      nombre: profiles.nombre,
      sucursalId: profiles.sucursalId,
      sucursalNombre: sucursales.nombre,
    })
    .from(profiles)
    .leftJoin(sucursales, eq(profiles.sucursalId, sucursales.id))
    .where(eq(profiles.userId, userId))
    .limit(1);

  const roleRows = await db
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(eq(userRoles.userId, userId));
  const roles = roleRows.map((r) => r.role as AppRole);

  // Sucursales asignadas (acceso). Define qué sedes ve y si puede cambiar.
  const sucRows = await db
    .select({ id: userSucursales.sucursalId, nombre: sucursales.nombre })
    .from(userSucursales)
    .leftJoin(sucursales, eq(userSucursales.sucursalId, sucursales.id))
    .where(eq(userSucursales.userId, userId))
    .orderBy(asc(sucursales.nombre));

  const permRows = await db
    .select({ resource: userPermissions.resource, action: userPermissions.action })
    .from(userPermissions)
    .where(eq(userPermissions.userId, userId));
  const permisos = [
    ...effectivePermissions(
      roles,
      permRows.map((p) => `${p.resource}:${p.action}`),
    ),
  ];

  return {
    user: { id: userId, email: session.user.email, name: session.user.name },
    profile: profileRow ?? null,
    roles,
    sucursales: sucRows.map((r) => ({ id: r.id, nombre: r.nombre ?? "" })),
    permisos,
  };
});
