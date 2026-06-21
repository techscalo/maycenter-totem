import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { profiles, userRoles, sucursales } from "@/db/schema";

export type AppRole = "admin" | "administrativo" | "direccion" | "odontologo";

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

  return {
    user: { id: userId, email: session.user.email, name: session.user.name },
    profile: profileRow ?? null,
    roles: roleRows.map((r) => r.role as AppRole),
  };
});
