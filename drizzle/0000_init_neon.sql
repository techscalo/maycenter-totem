CREATE TYPE "public"."app_role" AS ENUM('admin', 'administrativo', 'direccion', 'odontologo');--> statement-breakpoint
CREATE TABLE "atencion_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"atencion_id" uuid NOT NULL,
	"nomenclador_id" uuid,
	"servicio_particular_id" uuid,
	"codigo_manual" text,
	"descripcion_manual" text,
	"cantidad" integer DEFAULT 1 NOT NULL,
	"monto" numeric(12, 2) DEFAULT '0' NOT NULL,
	"monto_usd" numeric(12, 2),
	"cotizacion_usd" numeric(12, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atenciones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fecha" date DEFAULT now() NOT NULL,
	"paciente" text NOT NULL,
	"dni" text NOT NULL,
	"sucursal_id" uuid NOT NULL,
	"obra_social_id" uuid NOT NULL,
	"piso_id" uuid,
	"odontologo_id" uuid NOT NULL,
	"codigo_consulta" text,
	"primera_vez" boolean DEFAULT false NOT NULL,
	"observaciones" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nomencladores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"obra_social_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"descripcion" text NOT NULL,
	"monto" numeric(12, 2) DEFAULT '0' NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "obras_sociales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	"es_particular" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "obras_sociales_nombre_unique" UNIQUE("nombre")
);
--> statement-breakpoint
CREATE TABLE "odontologos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"numero_od" text,
	"piso_id" uuid,
	"sucursal_id" uuid NOT NULL,
	"user_id" text,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pisos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"sucursal_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"nombre" text,
	"sucursal_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "servicios_particulares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" text,
	"descripcion" text NOT NULL,
	"precio_usd" numeric(12, 2) DEFAULT '0' NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sucursales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sucursales_nombre_unique" UNIQUE("nombre")
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"role" "app_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "atencion_items" ADD CONSTRAINT "atencion_items_atencion_id_atenciones_id_fk" FOREIGN KEY ("atencion_id") REFERENCES "public"."atenciones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atencion_items" ADD CONSTRAINT "atencion_items_nomenclador_id_nomencladores_id_fk" FOREIGN KEY ("nomenclador_id") REFERENCES "public"."nomencladores"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atencion_items" ADD CONSTRAINT "atencion_items_servicio_particular_id_servicios_particulares_id_fk" FOREIGN KEY ("servicio_particular_id") REFERENCES "public"."servicios_particulares"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atenciones" ADD CONSTRAINT "atenciones_sucursal_id_sucursales_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atenciones" ADD CONSTRAINT "atenciones_obra_social_id_obras_sociales_id_fk" FOREIGN KEY ("obra_social_id") REFERENCES "public"."obras_sociales"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atenciones" ADD CONSTRAINT "atenciones_piso_id_pisos_id_fk" FOREIGN KEY ("piso_id") REFERENCES "public"."pisos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atenciones" ADD CONSTRAINT "atenciones_odontologo_id_odontologos_id_fk" FOREIGN KEY ("odontologo_id") REFERENCES "public"."odontologos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nomencladores" ADD CONSTRAINT "nomencladores_obra_social_id_obras_sociales_id_fk" FOREIGN KEY ("obra_social_id") REFERENCES "public"."obras_sociales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "odontologos" ADD CONSTRAINT "odontologos_piso_id_pisos_id_fk" FOREIGN KEY ("piso_id") REFERENCES "public"."pisos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "odontologos" ADD CONSTRAINT "odontologos_sucursal_id_sucursales_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pisos" ADD CONSTRAINT "pisos_sucursal_id_sucursales_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_sucursal_id_sucursales_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_atencion_items_atencion" ON "atencion_items" USING btree ("atencion_id");--> statement-breakpoint
CREATE INDEX "idx_atenciones_fecha" ON "atenciones" USING btree ("fecha");--> statement-breakpoint
CREATE INDEX "idx_atenciones_sucursal" ON "atenciones" USING btree ("sucursal_id");--> statement-breakpoint
CREATE INDEX "idx_atenciones_dni" ON "atenciones" USING btree ("dni");--> statement-breakpoint
CREATE UNIQUE INDEX "nomencladores_os_codigo_uq" ON "nomencladores" USING btree ("obra_social_id","codigo");--> statement-breakpoint
CREATE INDEX "idx_nomencladores_os" ON "nomencladores" USING btree ("obra_social_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pisos_sucursal_nombre_uq" ON "pisos" USING btree ("sucursal_id","nombre");--> statement-breakpoint
CREATE UNIQUE INDEX "user_roles_user_role_uq" ON "user_roles" USING btree ("user_id","role");