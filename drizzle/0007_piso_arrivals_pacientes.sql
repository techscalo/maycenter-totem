-- Piso en las llegadas del tótem (cada tablet abre /?piso=<id>) + base de pacientes.
-- Idempotente: seguro de correr en staging y luego en main.

-- Piso de la llegada (null = tótem sin piso configurado)
ALTER TABLE "arrivals"
  ADD COLUMN IF NOT EXISTS "piso_id" uuid REFERENCES "pisos"("id") ON DELETE set null;
--> statement-breakpoint

-- Ficha de paciente (se puebla por upsert de DNI al cargar atenciones)
CREATE TABLE IF NOT EXISTS "pacientes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "dni" text NOT NULL UNIQUE,
  "nombre" text NOT NULL,
  "telefono" text,
  "obra_social_id" uuid REFERENCES "obras_sociales"("id") ON DELETE set null,
  "notas" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Backfill: crear pacientes desde las atenciones ya cargadas (última por DNI gana el nombre/OS)
INSERT INTO "pacientes" ("dni","nombre","obra_social_id","created_at","updated_at")
SELECT DISTINCT ON (a."dni")
  a."dni", a."paciente", a."obra_social_id", now(), now()
FROM "atenciones" a
WHERE a."dni" IS NOT NULL AND a."dni" <> ''
ORDER BY a."dni", a."created_at" DESC
ON CONFLICT ("dni") DO NOTHING;
