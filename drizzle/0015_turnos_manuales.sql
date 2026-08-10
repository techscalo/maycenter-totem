-- Turnos cargados a mano, sin vínculo con GHL. Se listan junto a los de GHL en Turnos del día.
-- Idempotente.
CREATE TABLE IF NOT EXISTS "turnos_manuales" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "sucursal_id" uuid NOT NULL REFERENCES "sucursales"("id") ON DELETE CASCADE,
  "fecha" date NOT NULL,
  "hora" text NOT NULL,
  "paciente_nombre" text NOT NULL,
  "dni" text NOT NULL,
  "telefono" text,
  "obra_social_id" uuid REFERENCES "obras_sociales"("id") ON DELETE SET NULL,
  "odontologo_id" uuid REFERENCES "odontologos"("id") ON DELETE SET NULL,
  "motivo" text,
  "estado" text,
  "llegada_at" timestamptz,
  "sala_at" timestamptz,
  "marcado_por" text,
  "created_by" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_turnos_manuales_fecha" ON "turnos_manuales" ("sucursal_id", "fecha");
