import { saveAs } from "file-saver";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export function exportarExcel(pacientes) {
  if (!Array.isArray(pacientes) || pacientes.length === 0) return;
  const ws = XLSX.utils.json_to_sheet(pacientes);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Pacientes");
  const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([excelBuffer], { type: "application/octet-stream" });
  saveAs(blob, `pacientes_${new Date().toISOString().slice(0,10)}.xlsx`);
}

export function exportarPDF(pacientes) {
  if (!Array.isArray(pacientes) || pacientes.length === 0) return;
  const doc = new jsPDF();
  doc.text("Pacientes", 14, 10);
  const columns = [
    { header: "Historia Clínica", dataKey: "historia_clinica" },
    { header: "Nombres", dataKey: "nombre" },
    { header: "Apellidos", dataKey: "apellido" },
    { header: "Edad", dataKey: "edad" },
    { header: "DNI", dataKey: "dni" }
  ];
  autoTable(doc, {
    columns,
    body: pacientes,
    startY: 18,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [59, 130, 246] }
  });
  doc.save(`pacientes_${new Date().toISOString().slice(0,10)}.pdf`);
}
