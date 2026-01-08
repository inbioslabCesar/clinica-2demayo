// Utilidades para exportar a Excel y PDF
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export function exportToExcel(data, columns, filename = 'descuentos.xlsx') {
  const wsData = [columns.map(col => col.label), ...data.map(row => columns.map(col => row[col.key]))];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Descuentos');
  XLSX.writeFile(wb, filename);
}

export function exportToPDF(data, columns, filename = 'descuentos.pdf') {
  const doc = new jsPDF();
  autoTable(doc, {
    head: [columns.map(col => col.label)],
    body: data.map(row => columns.map(col => row[col.key])),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [255, 140, 0] }
  });
  doc.save(filename);
}
