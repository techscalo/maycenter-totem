-- Estado de flujo del turno (reemplaza el binario asistio). Idempotente.
-- Valores: en_recepcion | en_consultorio | finalizado | ausente (null = sin marcar).
ALTER TABLE "turno_asistencias" ADD COLUMN IF NOT EXISTS "estado" text;
--> statement-breakpoint
UPDATE "turno_asistencias"
SET "estado" = CASE WHEN "asistio" THEN 'finalizado' ELSE 'ausente' END
WHERE "estado" IS NULL;
