-- Hora de ingreso a la sala de atención (distinta del ingreso a la clínica del tótem).
-- Se setea al marcar el turno "En sala" (estado en_consultorio). null = todavía no entró. Idempotente.
ALTER TABLE "turno_asistencias" ADD COLUMN IF NOT EXISTS "sala_at" timestamptz;
