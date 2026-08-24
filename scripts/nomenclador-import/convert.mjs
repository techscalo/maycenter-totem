#!/usr/bin/env node
// Convierte un PDF de nomenclador de obra social al CSV canónico que consume el
// importador in-app (Configuración › Nomencladores › Actualizar precios masivo).
//
// Uso:
//   node convert.mjs --archetype flat-ars     --in "avalian agosto.pdf" --out avalian.csv
//   node convert.mjs --archetype flat-dotted  --in "OSPJN.pdf"          --out ospjn.csv
//   node convert.mjs --archetype matrix-plans --in "OSDE AGOSTO.PDF"    --out osde.csv
//
// Canónico: codigo,plan,descripcion,monto,copago  (la obra social se elige en la UI).
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith("--")) acc.push([a.slice(2), arr[i + 1]]);
    return acc;
  }, []),
);
const { archetype, in: input, out } = args;
if (!archetype || !input || !out) {
  console.error("Uso: --archetype <flat-ars|flat-dotted|matrix-plans> --in <pdf> --out <csv>");
  process.exit(1);
}

// PDF → texto con layout preservado (columnas).
const tmp = join(mkdtempSync(join(tmpdir(), "nom-")), "t.txt");
execFileSync("pdftotext", ["-layout", input, tmp]);
const txt = readFileSync(tmp, "utf8");

const parseArs = (s) => Number(s.replace(/\./g, "").replace(",", "."));
const ars = /(\d{1,3}(?:\.\d{3})*,\d{2})/g;
const cleanDesc = (s) =>
  s.replace(/_+/g, " ").replace(/[$|]+\s*$/g, "").replace(/\s+/g, " ").trim();
const PLAN_ORDER = ["2310", "2410", "2450", "2510", "8360", "8430"]; // columnas OSDE con datos

const warnings = [];
const canon = []; // { codigo, plan, descripcion, monto, copago }

if (archetype === "flat-ars") {
  for (const line of txt.split("\n")) {
    const m = line.match(/^\s*(\d{4})\s+(.+)$/);
    if (!m) continue;
    const prices = [...m[2].matchAll(ars)].map((x) => x[1]);
    if (!prices.length) {
      warnings.push(`sin precio: ${m[1]}`);
      continue;
    }
    const desc = cleanDesc(m[2].slice(0, m[2].indexOf(prices[prices.length - 1])));
    canon.push({ codigo: m[1], plan: "", descripcion: desc, monto: parseArs(prices.at(-1)), copago: "" });
  }
} else if (archetype === "flat-dotted") {
  for (const line of txt.split("\n")) {
    const m = line.match(/^\s*(\d{2}\.\d{2}\.\d{2})\b(.*)$/);
    if (!m) continue;
    const prices = [...m[2].matchAll(ars)].map((x) => x[1]);
    if (!prices.length) {
      warnings.push(`sin precio: ${m[1]}`);
      continue;
    }
    // Prótesis (3 columnas): total, a cargo afiliado (copago), a cargo OS. Resto: 1 total.
    const monto = parseArs(prices[0]);
    const copago = prices.length >= 3 ? parseArs(prices[1]) : "";
    const desc = cleanDesc(m[2].slice(0, m[2].indexOf(prices[0])));
    canon.push({ codigo: m[1], plan: "", descripcion: desc, monto, copago });
  }
} else if (archetype === "matrix-plans") {
  const dec = /(\d+\.\d{2})\b/g;
  for (const line of txt.split("\n")) {
    const m = line.match(/^\s*(\d{6})\s+(.*)$/);
    if (!m) continue;
    const vals = [...m[2].matchAll(dec)].map((x) => Number(x[1])).filter((n) => n > 0);
    if (!vals.length) continue;
    const desc = cleanDesc(m[2].replace(dec, "").replace(/\$/g, ""));
    if (vals.length === 1) {
      for (const plan of PLAN_ORDER)
        canon.push({ codigo: m[1], plan, descripcion: desc, monto: vals[0], copago: "" });
    } else if (vals.length === PLAN_ORDER.length) {
      PLAN_ORDER.forEach((plan, i) =>
        canon.push({ codigo: m[1], plan, descripcion: desc, monto: vals[i], copago: "" }),
      );
    } else {
      warnings.push(`${m[1]}: ${vals.length} valores (esperados 1 o 6) → revisar manual`);
    }
  }
} else {
  console.error(`Arquetipo desconocido: ${archetype}`);
  process.exit(1);
}

// Escribir CSV
const esc = (v) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const header = "codigo,plan,descripcion,monto,copago";
const body = canon.map((r) => [r.codigo, r.plan, r.descripcion, r.monto, r.copago].map(esc).join(","));
writeFileSync(out, [header, ...body].join("\n") + "\n");

console.log(`✓ ${canon.length} filas → ${out}`);
if (warnings.length) {
  console.log(`⚠ ${warnings.length} warnings:`);
  warnings.slice(0, 20).forEach((w) => console.log("  " + w));
}
