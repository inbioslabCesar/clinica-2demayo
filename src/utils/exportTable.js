// Utilidad para exportar datos a Excel y PDF
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export function exportToExcel(data, filename = 'servicios_mas_vendidos.xlsx') {
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Servicios');
  XLSX.writeFile(wb, filename);
}

export function exportToPDF(data, filename = 'servicios_mas_vendidos.pdf') {
  const doc = new jsPDF();
  doc.text('Servicios más vendidos', 14, 16);
  autoTable(doc, {
    startY: 22,
    head: [['Servicio', 'Tipo', 'Cantidad', 'Total vendido']],
    body: data.map(s => [s.nombre, s.tipo, s.cantidad, `S/ ${s.total}`]),
    styles: { fontSize: 10 },
    headStyles: { fillColor: [41, 128, 185] },
  });
  doc.save(filename);
}
