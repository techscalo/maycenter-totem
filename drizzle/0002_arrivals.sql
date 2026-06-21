CREATE TABLE "arrivals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"tipo_llegada" text NOT NULL,
	"tipo_paciente" text NOT NULL,
	"tipo_atencion" text NOT NULL,
	"cobertura" text,
	"nombre_apellido" text,
	"dni" text NOT NULL,
	"estado" text DEFAULT 'Pendiente' NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_arrivals_created" ON "arrivals" USING btree ("created_at");