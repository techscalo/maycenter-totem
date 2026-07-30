// Aplica una migración .sql idempotente contra la DB de DATABASE_URL.
// Divide por "--> statement-breakpoint" y corre cada statement con el driver Neon.
// Uso: node --env-file=.env scripts/apply-migration.mjs drizzle/0011_audit_log.sql
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("Falta el path del .sql");
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);
const raw = readFileSync(file, "utf8");
const statements = raw
  .split("--> statement-breakpoint")
  .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
  .filter(Boolean);

console.log(`Aplicando ${file} (${statements.length} statement(s))…`);
for (const [i, stmt] of statements.entries()) {
  await sql.query(stmt);
  console.log(`  [${i + 1}/${statements.length}] ok`);
}
console.log("Listo.");
