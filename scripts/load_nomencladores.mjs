// Fase 4: carga scripts/out/nomencladores.json en la tabla nomencladores.
// Idempotente: por cada OS borra lo existente y reinserta. Mapea nombres del doc -> obras_sociales.
// Uso: node scripts/load_nomencladores.mjs   (lee DATABASE_URL del entorno)
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const DIR = dirname(fileURLToPath(import.meta.url));
const sql = neon(process.env.DATABASE_URL);

// nombre en el JSON -> nombre exacto en obras_sociales
const NAME_MAP = { Amebpba: "AMEBPBA", Omint: "OMINT", "DX Salud": "DX Medical" };

const recs = JSON.parse(readFileSync(join(DIR, "out", "nomencladores.json"), "utf8"));

const osRows = await sql`SELECT id, nombre FROM obras_sociales`;
const idByName = new Map(osRows.map((o) => [o.nombre.toLowerCase(), o.id]));

function osId(jsonName) {
  const dbName = NAME_MAP[jsonName] ?? jsonName;
  return idByName.get(dbName.toLowerCase());
}

// agrupar por OS
const byOs = new Map();
const missing = new Set();
for (const r of recs) {
  const id = osId(r.obraSocial);
  if (!id) { missing.add(r.obraSocial); continue; }
  if (!byOs.has(id)) byOs.set(id, []);
  byOs.get(id).push(r);
}
if (missing.size) {
  console.error("OS sin match en obras_sociales:", [...missing].join(", "));
  process.exit(1);
}

let total = 0;
for (const [id, rows] of byOs) {
  await sql`DELETE FROM nomencladores WHERE obra_social_id = ${id}`;
  // insert en chunks de 100 filas (multi-row parametrizado)
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    const values = [];
    const params = [];
    let p = 1;
    for (const r of chunk) {
      values.push(`($${p++},$${p++},$${p++},$${p++},$${p++},$${p++})`);
      params.push(id, r.plan, r.codigo, r.descripcion, r.monto, r.montoPaciente);
    }
    await sql.query(
      `INSERT INTO nomencladores (obra_social_id, plan, codigo, descripcion, monto, monto_paciente) VALUES ${values.join(",")}`,
      params,
    );
    total += chunk.length;
  }
}

// resumen
const summary = await sql`
  SELECT o.nombre, count(*)::int AS n, count(DISTINCT n.plan)::int AS planes
  FROM nomencladores n JOIN obras_sociales o ON o.id = n.obra_social_id
  GROUP BY o.nombre ORDER BY o.nombre`;
console.log(`Insertadas ${total} filas.\n`);
for (const s of summary) console.log(`  ${s.nombre.padEnd(16)} ${String(s.n).padStart(4)} filas  ${s.planes} planes`);
