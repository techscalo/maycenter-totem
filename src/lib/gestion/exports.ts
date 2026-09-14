import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import logoUrl from "@/assets/maycenter-logo.png";

// Marca Maycenter
const BRAND: [number, number, number] = [4, 84, 119]; // azul petróleo del isologo
const BRAND_TINT: [number, number, number] = [235, 242, 246]; // fondo de filas alternadas

export function downloadExcel(filename: string, sheetName: string, rows: any[]) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, filename);
}

// Carga un asset como dataURL para embeberlo en el PDF (robusto: null si falla).
async function loadDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result as string);
      fr.onerror = () => resolve(null);
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function downloadPdf(
  filename: string,
  title: string,
  subtitle: string,
  head: string[],
  body: (string | number)[][],
  totals?: string,
) {
  const doc = new jsPDF({ orientation: "landscape" });
  const pageW = doc.internal.pageSize.getWidth();
  const logo = await loadDataUrl(logoUrl);

  // Encabezado de marca: logo + título + subtítulo, con regla en color Maycenter.
  const textX = logo ? 32 : 14;
  if (logo) {
    try {
      doc.addImage(logo, "PNG", 14, 9, 14, 14);
    } catch {
      /* si el formato no se pudo embeber, seguimos sin logo */
    }
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...BRAND);
  doc.text(title, textX, 17);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(110);
  doc.text(subtitle, textX, 23);

  // Totales arriba: en reportes largos evita tener que bajar hasta el final.
  let ruleY = 27;
  if (totals) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...BRAND);
    doc.text(totals, textX, 30);
    doc.setFont("helvetica", "normal");
    ruleY = 34;
  }
  doc.setDrawColor(...BRAND);
  doc.setLineWidth(0.6);
  doc.line(14, ruleY, pageW - 14, ruleY);
  doc.setTextColor(0);

  autoTable(doc, {
    startY: ruleY + 4,
    head: [head],
    body,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: BRAND, textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: BRAND_TINT },
    // Pie de página con marca y numeración en cada hoja.
    didDrawPage: () => {
      const pageH = doc.internal.pageSize.getHeight();
      const n = doc.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(140);
      doc.text("Maycenter · Gestión clínica", 14, pageH - 8);
      doc.text(`Página ${n}`, pageW - 14, pageH - 8, { align: "right" });
      doc.setTextColor(0);
    },
  });

  doc.save(filename);
}

// -------------------------------------------------------------------------
// Reporte de Métricas de Recepción: portada con KPIs, diagramas (charts de
// recharts serializados a PNG) y tablas, con branding Maycenter.
// -------------------------------------------------------------------------

// Serializa un <svg> del DOM a PNG dataURL (para embeberlo en el PDF). Los charts
// de recharts son SVG con estilos inline → se rasterizan sin recursos externos.
async function svgToPng(
  svg: SVGSVGElement,
  scale = 2,
): Promise<{ url: string; w: number; h: number } | null> {
  const w = svg.clientWidth || svg.viewBox?.baseVal?.width || 600;
  const h = svg.clientHeight || svg.viewBox?.baseVal?.height || 300;
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("width", String(w));
  clone.setAttribute("height", String(h));
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const xml = new XMLSerializer().serializeToString(clone);
  const src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(xml)));
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = w * scale;
      canvas.height = h * scale;
      const cx = canvas.getContext("2d");
      if (!cx) return resolve(null);
      cx.fillStyle = "#ffffff";
      cx.fillRect(0, 0, canvas.width, canvas.height);
      cx.scale(scale, scale);
      cx.drawImage(img, 0, 0, w, h);
      resolve({ url: canvas.toDataURL("image/png"), w, h });
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export type MetricsPdfInput = {
  filename: string;
  sucursalNombre: string;
  periodoLabel: string;
  kpis: { label: string; value: string | number }[];
  charts: { title: string; svg: SVGSVGElement | null }[];
  tablas: { title: string; head: string[]; body: (string | number)[][] }[];
};

export async function downloadMetricsPdf(input: MetricsPdfInput) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 14; // margen
  const logo = await loadDataUrl(logoUrl);

  const footer = () => {
    const n = doc.getNumberOfPages();
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text("Maycenter · Gestión clínica", M, pageH - 8);
    doc.text(`Página ${n}`, pageW - M, pageH - 8, { align: "right" });
    doc.setTextColor(0);
  };

  // --- Encabezado de marca ---
  const textX = logo ? 32 : M;
  if (logo) {
    try {
      doc.addImage(logo, "PNG", M, 9, 14, 14);
    } catch {
      /* sin logo si el formato falla */
    }
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...BRAND);
  doc.text("Reporte de Recepción — Métricas", textX, 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(110);
  doc.text(`${input.sucursalNombre} · ${input.periodoLabel}`, textX, 22);
  doc.setDrawColor(...BRAND);
  doc.setLineWidth(0.6);
  doc.line(M, 26, pageW - M, 26);
  doc.setTextColor(0);

  // --- KPIs ---
  let y = 32;
  const kpiW = (pageW - M * 2 - 3 * 3) / 4; // 4 por fila, gap 3
  input.kpis.slice(0, 8).forEach((k, i) => {
    const col = i % 4;
    if (i > 0 && col === 0) y += 22;
    const x = M + col * (kpiW + 3);
    doc.setDrawColor(...BRAND);
    doc.setFillColor(...BRAND_TINT);
    doc.roundedRect(x, y, kpiW, 18, 2, 2, "FD");
    doc.setFontSize(8);
    doc.setTextColor(110);
    doc.text(String(k.label), x + 3, y + 6, { maxWidth: kpiW - 6 });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(...BRAND);
    doc.text(String(k.value), x + 3, y + 14);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0);
  });
  y += 26;

  // --- Charts (2 por fila) ---
  const chartW = (pageW - M * 2 - 6) / 2;
  let chartCol = 0;
  for (const ch of input.charts) {
    const png = ch.svg ? await svgToPng(ch.svg) : null;
    const imgH = png ? Math.min((chartW * png.h) / png.w, 60) : 40;
    if (y + imgH + 10 > pageH - 14) {
      footer();
      doc.addPage();
      y = 20;
      chartCol = 0;
    }
    const x = M + chartCol * (chartW + 6);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...BRAND);
    doc.text(ch.title, x, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0);
    if (png) {
      try {
        doc.addImage(png.url, "PNG", x, y + 2, chartW, imgH);
      } catch {
        /* si falla el raster, se omite el gráfico */
      }
    } else {
      doc.setFontSize(8);
      doc.setTextColor(140);
      doc.text("(sin datos)", x, y + 10);
      doc.setTextColor(0);
    }
    chartCol++;
    if (chartCol === 2) {
      chartCol = 0;
      y += imgH + 12;
    }
  }
  if (chartCol === 1) y += 60; // cerrar fila impar

  // --- Tablas ---
  let cursorY = y + 4;
  for (const t of input.tablas) {
    if (cursorY > pageH - 40) {
      footer();
      doc.addPage();
      cursorY = 20;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...BRAND);
    doc.text(t.title, M, cursorY);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0);
    autoTable(doc, {
      startY: cursorY + 2,
      head: [t.head],
      body: t.body,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: BRAND, textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: BRAND_TINT },
      margin: { left: M, right: M },
      didDrawPage: footer,
    });
    cursorY = (doc as any).lastAutoTable.finalY + 10;
  }

  footer();
  doc.save(input.filename);
}
