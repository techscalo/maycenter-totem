-- Override manual de la hora de llegada para turnos de GHL (cuya llegada normalmente viene
-- del tótem por DNI). Editable desde el modal de la fila. Idempotente.
ALTER TABLE "turno_asistencias" ADD COLUMN IF NOT EXISTS "llegada_at" timestamptz;
