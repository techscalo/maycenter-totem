-- Slug de sucursal (para URL corta del tótem) + sucursal en arrivals + reestructura La Plata.
-- Idempotente.

ALTER TABLE "sucursales" ADD COLUMN IF NOT EXISTS "slug" text;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sucursales_slug_unique') THEN
    ALTER TABLE "sucursales" ADD CONSTRAINT "sucursales_slug_unique" UNIQUE ("slug");
  END IF;
END $$;
--> statement-breakpoint

ALTER TABLE "arrivals"
  ADD COLUMN IF NOT EXISTS "sucursal_id" uuid REFERENCES "sucursales"("id") ON DELETE set null;
--> statement-breakpoint

-- Reestructura La Plata: pasa a ser "La Plata Calle 10" y se agrega "La Plata Diagonal 77".
UPDATE "sucursales" SET "nombre" = 'La Plata Calle 10'
  WHERE "nombre" = 'La Plata';
--> statement-breakpoint
INSERT INTO "sucursales" ("nombre") VALUES ('La Plata Diagonal 77')
  ON CONFLICT ("nombre") DO NOTHING;
--> statement-breakpoint

-- Slugs para la URL del tótem (?clinica=<slug>)
UPDATE "sucursales" SET "slug" = 'caba'    WHERE "nombre" = 'CABA'                AND "slug" IS NULL;
--> statement-breakpoint
UPDATE "sucursales" SET "slug" = 'calle10' WHERE "nombre" = 'La Plata Calle 10'    AND "slug" IS NULL;
--> statement-breakpoint
UPDATE "sucursales" SET "slug" = 'diag77'  WHERE "nombre" = 'La Plata Diagonal 77' AND "slug" IS NULL;
