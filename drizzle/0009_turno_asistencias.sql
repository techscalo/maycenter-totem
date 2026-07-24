-- Asistencia local a turnos de GHL (Recepción). No escribe en GHL. Idempotente.
CREATE TABLE IF NOT EXISTS "turno_asistencias" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "ghl_event_id" text NOT NULL UNIQUE,
  "sucursal_id" uuid REFERENCES "sucursales"("id") ON DELETE set null,
  "fecha" date NOT NULL,
  "asistio" boolean DEFAULT true NOT NULL,
  "marcado_por" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
