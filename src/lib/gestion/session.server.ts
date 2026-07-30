import { getRequestHeaders } from "@tanstack/react-start/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { userRoles, userSucursales, userPermissions } from "@/db/schema";
import {
  effectivePermissions,
  can as canPermission,
  type Resource,
} from "@/lib/gestion/permissions";

export type AppRole = "admin" | "administrativo" | "direccion" | "odontologo" | "recepcionista";

export type AuthCtx = {
  userId: string;
  roles: AppRole[];
  isStaff: boolean;
  isAdmin: boolean;
  sucursalIds: string[];
  permisos: Set<string>;
};

export async function requireAuth(): Promise<AuthCtx> {
  const headers = new Headers(getRequestHeaders() as HeadersInit);
  const session = await auth.api.getSession({ headers });
  if (!session?.user) throw new Error("No autenticado");
  const userId = session.user.id;

  const roleRows = await db
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(eq(userRoles.userId, userId));
  const roles = roleRows.map((r) => r.role as AppRole);

  const sucRows = await db
    .select({ sucursalId: userSucursales.sucursalId })
    .from(userSucursales)
    .where(eq(userSucursales.userId, userId));

  const permRows = await db
    .select({ resource: userPermissions.resource, action: userPermissions.action })
    .from(userPermissions)
    .where(eq(userPermissions.userId, userId));
  const permisos = effectivePermissions(
    roles,
    permRows.map((p) => `${p.resource}:${p.action}`),
  );

  return {
    userId,
    roles,
    isStaff: roles.includes("admin") || roles.includes("direccion"),
    isAdmin: roles.includes("admin"),
    sucursalIds: sucRows.map((r) => r.sucursalId),
    permisos,
  };
}

// Lanza si el usuario no tiene el permiso resource:action (admin siempre pasa).
export function requirePermission(ctx: AuthCtx, resource: Resource, action: string): void {
  if (!canPermission(ctx.roles, ctx.permisos, resource, action)) {
    throw new Error("No tenés permiso para esta acción");
  }
}

export async function requireAdmin(): Promise<AuthCtx> {
  const ctx = await requireAuth();
  if (!ctx.isAdmin) throw new Error("Solo administradores");
  return ctx;
}
