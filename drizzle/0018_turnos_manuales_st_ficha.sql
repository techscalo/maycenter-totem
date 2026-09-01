-- Turnos manuales: soportar "ST" (sin turno) y ficha editable.
-- hora nullable = ST (urgencia sin horario, se atiende por orden de llegada).
ALTER TABLE "turnos_manuales" ALTER COLUMN "hora" DROP NOT NULL;
--> statement-breakpoint
-- Ficha del paciente para turnos manuales (los de GHL la tienen en el contacto).
ALTER TABLE "turnos_manuales" ADD COLUMN IF NOT EXISTS "tiene_ficha" text;
