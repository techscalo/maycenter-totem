CREATE TABLE IF NOT EXISTS "user_sucursales" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "sucursal_id" uuid NOT NULL REFERENCES "sucursales"("id") ON DELETE cascade,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_sucursales_user_sucursal_uq" ON "user_sucursales" ("user_id","sucursal_id");--> statement-breakpoint
-- Poblar desde el estado actual:
-- 1) usuarios con sucursal asignada en profiles -> esa sede
INSERT INTO "user_sucursales" ("user_id","sucursal_id")
SELECT p."user_id", p."sucursal_id"
FROM "profiles" p
WHERE p."sucursal_id" IS NOT NULL
ON CONFLICT ("user_id","sucursal_id") DO NOTHING;--> statement-breakpoint
-- 2) usuarios sin sucursal (hoy ven todo) -> todas las sedes (preserva acceso total)
INSERT INTO "user_sucursales" ("user_id","sucursal_id")
SELECT p."user_id", s."id"
FROM "profiles" p
CROSS JOIN "sucursales" s
WHERE p."sucursal_id" IS NULL
ON CONFLICT ("user_id","sucursal_id") DO NOTHING;
