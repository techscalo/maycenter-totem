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