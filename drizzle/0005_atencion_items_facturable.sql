ALTER TABLE "atencion_items" ADD COLUMN IF NOT EXISTS "facturable" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "atencion_items" ADD COLUMN IF NOT EXISTS "estado_placa" text;
