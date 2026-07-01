import { getRequestHeaders } from "@tanstack/react-start/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { userRoles, userSucursales } from "@/db/schema";

export type AppRole = "admin" | "administrativo" | "direccion" | "odontologo";

export type AuthCtx = {
  userId: string;
  roles: AppRole[];
  isStaff: boolean;
  isAdmin: boolean;
  sucursalIds: string[];
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

  return {
    userId,
    roles,
    isStaff: roles.includes("admin") || roles.includes("direccion"),
    isAdmin: roles.includes("admin"),
    sucursalIds: sucRows.map((r) => r.sucursalId),
  };
}

export async function requireAdmin(): Promise<AuthCtx> {
  const ctx = await requireAuth();
  if (!ctx.isAdmin) throw new Error("Solo administradores");
  return ctx;
}
