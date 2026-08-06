// Escritura del registro de cambios. Server-only (usa `db`): SOLO deben importarlo
// otros módulos .server (data/users/ghl). NUNCA un componente, o el bundle del
// cliente arrastraría `db`/neon. La lectura del registro vive en `audit.server.ts`.
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { auditLog, profiles } from "@/db/schema";

export type AuditAction = "create" | "update" | "delete" | "login";

type LogInput = {
  action: AuditAction;
  resource: string;
  entityId?: string | null;
  resumen?: string;
  meta?: Record<string, unknown>;
  sucursalId?: string | null;
};

// Nombre del actor cacheado por userId (evita un SELECT por cada registro).
const nombreCache = new Map<string, string>();
async function actorNombre(userId: string): Promise<string | null> {
  if (nombreCache.has(userId)) return nombreCache.get(userId)!;
  const [p] = await db
    .select({ nombre: profiles.nombre })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);
  const nombre = p?.nombre ?? null;
  if (nombre) nombreCache.set(userId, nombre);
  return nombre;
}

// Registra una acción en el audit log. NUNCA lanza: el registro no debe romper la
// operación de negocio (si falla, se loguea en consola y sigue).
export async function logAudit(ctx: { userId: string }, input: LogInput): Promise<void> {
  try {
    await db.insert(auditLog).values({
      actorUserId: ctx.userId,
      actorNombre: await actorNombre(ctx.userId),
      action: input.action,
      resource: input.resource,
      entityId: input.entityId ?? null,
      resumen: input.resumen ?? null,
      meta: input.meta ?? null,
      sucursalId: input.sucursalId ?? null,
    });
  } catch (e) {
    console.error("logAudit failed", e);
  }
}
