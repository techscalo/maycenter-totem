-- Registro de cambios ("buchón"): historial de altas/ediciones/bajas con actor. Idempotente.
CREATE TABLE IF NOT EXISTS "audit_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "actor_user_id" text,
  "actor_nombre" text,
  "action" text NOT NULL,
  "resource" text NOT NULL,
  "entity_id" text,
  "resumen" text,
  "meta" jsonb,
  "sucursal_id" uuid REFERENCES "sucursales"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_created" ON "audit_log" ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_actor" ON "audit_log" ("actor_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_resource" ON "audit_log" ("resource");
