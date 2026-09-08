-- Hora de finalización del turno + odontólogo que realmente atendió (a cargo), cuando
-- difiere del de la agenda. Aplica a turnos de GHL y manuales. Idempotente.
ALTER TABLE "turno_asistencias" ADD COLUMN IF NOT EXISTS "finalizado_at" timestamptz;
--> statement-breakpoint
ALTER TABLE "turno_asistencias" ADD COLUMN IF NOT EXISTS "odontologo_a_cargo_id" uuid REFERENCES "odontologos"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "turnos_manuales" ADD COLUMN IF NOT EXISTS "finalizado_at" timestamptz;
--> statement-breakpoint
ALTER TABLE "turnos_manuales" ADD COLUMN IF NOT EXISTS "odontologo_a_cargo_id" uuid REFERENCES "odontologos"("id") ON DELETE SET NULL;
