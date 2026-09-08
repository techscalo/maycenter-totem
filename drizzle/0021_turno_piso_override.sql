-- Override de piso por turno (cuando no corresponde con el del odontólogo). Editable desde el
-- modal. null = se usa el piso del odontólogo. Idempotente.
ALTER TABLE "turno_asistencias" ADD COLUMN IF NOT EXISTS "piso_id" uuid REFERENCES "pisos"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "turnos_manuales" ADD COLUMN IF NOT EXISTS "piso_id" uuid REFERENCES "pisos"("id") ON DELETE SET NULL;
