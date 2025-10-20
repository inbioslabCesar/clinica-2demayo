import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/**
 * Exportar médicos a Excel
 * @param {Array} medicos - Lista de médicos a exportar
 */
export const exportarExcel = (medicos) => {
  try {
    // Solo exportar columnas relevantes
    const data = medicos.map(({ id, nombre, especialidad, email }) => ({ 
      ID: id, 
      Nombre: nombre, 
      Especialidad: especialidad, 
      Email: email 
    }));
    
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Médicos");
    
    // Configurar ancho de columnas
    const columnWidths = [
      { wch: 8 },  // ID
      { wch: 25 }, // Nombre
      { wch: 20 }, // Especialidad
      { wch: 30 }  // Email
    ];
    ws['!cols'] = columnWidths;
    
    const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([excelBuffer], { type: "application/octet-stream" });
    
    const fileName = `medicos_${new Date().toISOString().slice(0, 10)}.xlsx`;
    saveAs(blob, fileName);
    
    return { success: true, fileName };
  } catch (error) {
    console.error('Error exportando a Excel:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Exportar médicos a PDF
 * @param {Array} medicos - Lista de médicos a exportar
 */
export const exportarPDF = (medicos) => {
  try {
    const doc = new jsPDF();
    
    // Título del documento
    doc.setFontSize(18);
    doc.setFont(undefined, 'bold');
    doc.text("Lista de Médicos", 14, 15);
    
    // Información adicional
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.text(`Fecha de generación: ${new Date().toLocaleDateString()}`, 14, 25);
    doc.text(`Total de médicos: ${medicos.length}`, 14, 30);
    
    // Configuración de la tabla
    const columns = [
      { header: "ID", dataKey: "id" },
      { header: "Nombre", dataKey: "nombre" },
      { header: "Especialidad", dataKey: "especialidad" },
      { header: "Email", dataKey: "email" }
    ];
    
    // Datos de la tabla
    const tableData = medicos.map(medico => ({
      id: medico.id,
      nombre: `${medico.nombre} ${medico.apellido || ''}`.trim(),
      especialidad: medico.especialidad,
      email: medico.email
    }));
    
    autoTable(doc, {
      columns,
      body: tableData,
      startY: 35,
      styles: { 
        fontSize: 9,
        cellPadding: 3,
      },
      headStyles: { 
        fillColor: [59, 130, 246],
        textColor: [255, 255, 255],
        fontStyle: 'bold'
      },
      alternateRowStyles: {
        fillColor: [245, 247, 250]
      },
      tableLineColor: [209, 213, 219],
      tableLineWidth: 0.1,
      margin: { top: 35, bottom: 20, left: 14, right: 14 }
    });
    
    const fileName = `medicos_${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(fileName);
    
    return { success: true, fileName };
  } catch (error) {
    console.error('Error exportando a PDF:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Validar datos de médico
 * @param {Object} medico - Datos del médico a validar
 * @returns {Object} - Resultado de la validación
 */
export const validateMedico = (medico) => {
  const errors = {};
  
  // Validar nombre
  if (!medico.nombre || medico.nombre.trim().length < 2) {
    errors.nombre = "El nombre debe tener al menos 2 caracteres";
  }
  
  // Validar especialidad
  if (!medico.especialidad || medico.especialidad.trim().length < 2) {
    errors.especialidad = "La especialidad debe tener al menos 2 caracteres";
  }
  
  // Validar email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!medico.email || !emailRegex.test(medico.email)) {
    errors.email = "El email debe tener un formato válido";
  }
  
  // Validar contraseña (solo para creación)
  if (medico.password !== undefined) {
    if (!medico.password || medico.password.length < 6) {
      errors.password = "La contraseña debe tener al menos 6 caracteres";
    }
  }
  
  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
};