// Parsing server-side de PDFs de aranceles → filas canónicas. Server-only (usa unpdf,
// que es pesado y no debe entrar al bundle del cliente). Los PDFs tienen capa de texto
// real: la extracción es determinística (no OCR). Reconstruye líneas agrupando ítems
// por coordenada `y` con tolerancia (los precios suelen quedar ~2px desalineados).
import { getDocumentProxy } from "unpdf";

export type CanonicalRow = {
  codigo: string;
  plan: string | null;
  descripcion?: string;
  monto: number;
  copago: number | null;
};
export type Archetype = "flat-ars" | "flat-dotted" | "matrix-plans";

const Y_TOL = 4; // puntos: fusiona ítems de la misma fila con baseline levemente distinto
const PLAN_ORDER = ["2310", "2410", "2450", "2510", "8360", "8430"]; // columnas OSDE con datos

const ARS = /(\d{1,3}(?:\.\d{3})*,\d{2})/g;
const DEC = /(\d+\.\d{2})\b/g;
const parseArs = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));
const cleanDesc = (s: string) =>
  s.replace(/_+/g, " ").replace(/[$|]+\s*$/g, "").replace(/\s+/g, " ").trim();

export async function pdfToLines(bytes: Uint8Array): Promise<string[]> {
  const pdf = await getDocumentProxy(bytes);
  const out: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const content = await (await pdf.getPage(p)).getTextContent();
    const items = content.items
      .filter((it: any) => it.str && it.str.trim())
      .map((it: any) => ({ x: it.transform[4], y: it.transform[5], s: it.str }));
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    let cur: { y: number; items: typeof items } | null = null;
    const rows: { y: number; items: typeof items }[] = [];
    for (const it of items) {
      if (cur && Math.abs(it.y - cur.y) <= Y_TOL) cur.items.push(it);
      else {
        cur = { y: it.y, items: [it] };
        rows.push(cur);
      }
    }
    for (const r of rows) out.push(r.items.sort((a, b) => a.x - b.x).map((i) => i.s).join(" "));
  }
  return out;
}

export function detectArchetype(lines: string[]): Archetype {
  let matrix = 0,
    dotted = 0,
    flat = 0;
  for (const l of lines) {
    if (/^\s*\d{6}\s+\D/.test(l) && DEC.test(l)) matrix++;
    else if (/^\s*\d{2}\.\d{2}\.\d{2}/.test(l)) dotted++;
    else if (/^\s*\d{4}\s+\D/.test(l)) flat++;
    DEC.lastIndex = 0;
  }
  if (matrix >= dotted && matrix >= flat && matrix > 3) return "matrix-plans";
  if (dotted >= flat && dotted > 3) return "flat-dotted";
  return "flat-ars";
}

function parse(lines: string[], archetype: Archetype) {
  const rows: CanonicalRow[] = [];
  const warnings: string[] = [];
  if (archetype === "flat-ars") {
    for (const line of lines) {
      const m = line.match(/^\s*(\d{4})\s+(.+)$/);
      if (!m) continue;
      const prices = [...m[2].matchAll(ARS)].map((x) => x[1]);
      if (!prices.length) {
        warnings.push(`sin precio: ${m[1]}`);
        continue;
      }
      const last = prices[prices.length - 1];
      rows.push({
        codigo: m[1],
        plan: null,
        descripcion: cleanDesc(m[2].slice(0, m[2].lastIndexOf(last))),
        monto: parseArs(last),
        copago: null,
      });
    }
  } else if (archetype === "flat-dotted") {
    for (const line of lines) {
      const m = line.match(/^\s*(\d{2}\.\d{2}\.\d{2})\b(.*)$/);
      if (!m) continue;
      const prices = [...m[2].matchAll(ARS)].map((x) => x[1]);
      if (!prices.length) {
        warnings.push(`sin precio: ${m[1]}`);
        continue;
      }
      rows.push({
        codigo: m[1],
        plan: null,
        descripcion: cleanDesc(m[2].slice(0, m[2].indexOf(prices[0]))),
        monto: parseArs(prices[0]),
        copago: prices.length >= 3 ? parseArs(prices[1]) : null,
      });
    }
  } else {
    for (const line of lines) {
      const m = line.match(/^\s*(\d{6})\s+(.*)$/);
      if (!m) continue;
      const vals = [...m[2].matchAll(DEC)].map((x) => Number(x[1])).filter((n) => n > 0);
      if (!vals.length) continue;
      const desc = cleanDesc(m[2].replace(DEC, "").replace(/\$/g, ""));
      if (vals.length === 1) {
        for (const plan of PLAN_ORDER)
          rows.push({ codigo: m[1], plan, descripcion: desc, monto: vals[0], copago: null });
      } else if (vals.length === PLAN_ORDER.length) {
        PLAN_ORDER.forEach((plan, i) =>
          rows.push({ codigo: m[1], plan, descripcion: desc, monto: vals[i], copago: null }),
        );
      } else {
        warnings.push(`${m[1]}: ${vals.length} valores (esperados 1 o 6) → revisión manual`);
      }
    }
  }
  return { rows, warnings };
}

export async function parsePdfToCanonical(bytes: Uint8Array, forced?: Archetype) {
  const lines = await pdfToLines(bytes);
  const archetype = forced ?? detectArchetype(lines);
  const { rows, warnings } = parse(lines, archetype);
  return { archetype, rows, parseWarnings: warnings };
}
