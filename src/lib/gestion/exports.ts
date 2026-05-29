import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export function downloadExcel(filename: string, sheetName: string, rows: any[]) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, filename);
}

export function downloadPdf(
  filename: string,
  title: string,
  subtitle: string,
  head: string[],
  body: (string | number)[][],
  totals?: string,
) {
  const doc = new jsPDF({ orientation: "landscape" });
  doc.setFontSize(16);
  doc.text(title, 14, 16);
  doc.setFontSize(10);
  doc.setTextColor(110);
  doc.text(subtitle, 14, 22);
  doc.setTextColor(0);
  autoTable(doc, {
    startY: 28,
    head: [head],
    body,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [37, 99, 235] },
  });
  if (totals) {
    const y = (doc as any).lastAutoTable.finalY + 8;
    doc.setFontSize(11);
    doc.text(totals, 14, y);
  }
  doc.save(filename);
}