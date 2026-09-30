-- Prioridad de atención (1=alta, 2=media, 3=baja; null=sin prioridad) + notas internas de
-- recepción (propias del sistema, no van a GHL). Aplican a turnos de GHL y manuales.
ALTER TABLE "turno_asistencias" ADD COLUMN IF NOT EXISTS "prioridad" integer;
--> statement-breakpoint
ALTER TABLE "turno_asistencias" ADD COLUMN IF NOT EXISTS "notas_internas" text;
--> statement-breakpoint
ALTER TABLE "turnos_manuales" ADD COLUMN IF NOT EXISTS "prioridad" integer;
--> statement-breakpoint
ALTER TABLE "turnos_manuales" ADD COLUMN IF NOT EXISTS "notas_internas" text;
