-- Permisos página+acción por cuenta (con preset por rol como fallback). Idempotente.
CREATE TABLE IF NOT EXISTS "user_permissions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" text NOT NULL,
  "resource" text NOT NULL,
  "action" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_permissions_uq" ON "user_permissions" ("user_id", "resource", "action");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_permissions_user" ON "user_permissions" ("user_id");
