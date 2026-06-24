DROP INDEX "nomencladores_os_codigo_uq";--> statement-breakpoint
ALTER TABLE "nomencladores" ADD COLUMN "plan" text;--> statement-breakpoint
CREATE UNIQUE INDEX "nomencladores_os_plan_codigo_uq" ON "nomencladores" USING btree ("obra_social_id",coalesce("plan", ''),"codigo");