-- Estado "Se retiró" (hora de retiro) y cancelación de turno con motivo opcional.
-- Columnas aditivas y nullable. Idempotente.
ALTER TABLE "turno_asistencias" ADD COLUMN IF NOT EXISTS "retiro_at" timestamptz;
--> statement-breakpoint
ALTER TABLE "turno_asistencias" ADD COLUMN IF NOT EXISTS "cancel_motivo" text;
--> statement-breakpoint
ALTER TABLE "turnos_manuales" ADD COLUMN IF NOT EXISTS "retiro_at" timestamptz;
--> statement-breakpoint
ALTER TABLE "turnos_manuales" ADD COLUMN IF NOT EXISTS "cancel_motivo" text;
