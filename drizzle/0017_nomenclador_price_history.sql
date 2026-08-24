-- Historial de cambios de precio de nomencladores (snapshot reversible de cada import masivo).
CREATE TABLE IF NOT EXISTS "nomenclador_price_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "nomenclador_id" uuid REFERENCES "nomencladores"("id") ON DELETE SET NULL,
  "obra_social_id" uuid REFERENCES "obras_sociales"("id") ON DELETE CASCADE,
  "codigo" text NOT NULL,
  "plan" text,
  "monto_old" numeric(12, 2),
  "monto_new" numeric(12, 2),
  "copago_old" numeric(12, 2),
  "copago_new" numeric(12, 2),
  "actor_user_id" text,
  "actor_nombre" text,
  "source" text NOT NULL DEFAULT 'import',
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_nph_os" ON "nomenclador_price_history" ("obra_social_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_nph_created" ON "nomenclador_price_history" ("created_at");
