
import React, { useEffect, useState } from "react";
import Spinner from "./Spinner";
import Swal from 'sweetalert2';
import PacienteForm from "./PacienteForm";
import { BASE_URL } from "../config/config";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";


// ...existing code...

function PacienteList() {
  // Ordenamiento de columnas
  const [sortBy, setSortBy] = useState("historia_clinica");
  const [sortDir, setSortDir] = useState("asc");

  const handleSort = (col) => {
    if (sortBy === col) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortBy(col);
      setSortDir("asc");
    }
    setPage(1);
  };
  const [pacientes, setPacientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editData, setEditData] = useState(null);
  // Paginación
  const [rowsPerPage, setRowsPerPage] = useState(5);
  const [page, setPage] = useState(1);
  // Filtro de fechas
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  // Buscador dinámico
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    fetch(BASE_URL + "api_pacientes.php")
      .then(res => res.json())
      .then(data => {
        if (data.success) setPacientes(data.pacientes);
        else setError(data.error || "Error al cargar pacientes");
        setLoading(false);
      })
      .catch(() => {
        setError("Error de conexión con el servidor");
        setLoading(false);
      });
  }, []);

  const handleAgregar = () => {
    setEditData({
      id: undefined,
      dni: "",
      nombre: "",
      apellido: "",
      historia_clinica: "",
      fecha_nacimiento: "",
      edad: "",
      edad_unidad: "años",
      procedencia: "",
      tipo_seguro: "",
      sexo: "M",
      direccion: "",
      telefono: "",
      email: "",
    });
    setModalOpen(true);
  };

  const handleEditar = (paciente) => {
    setEditData({
      id: paciente.id,
      dni: paciente.dni || "",
      nombre: paciente.nombre || "",
      apellido: paciente.apellido || "",
      historia_clinica: paciente.historia_clinica || "",
      fecha_nacimiento: paciente.fecha_nacimiento || "",
      edad: paciente.edad || "",
      edad_unidad: paciente.edad_unidad || "años",
      procedencia: paciente.procedencia || "",
      tipo_seguro: paciente.tipo_seguro || "",
      sexo: paciente.sexo || "M",
      direccion: paciente.direccion || "",
      telefono: paciente.telefono || "",
      email: paciente.email || "",
    });
    setModalOpen(true);
  };


  const handleRegistroExitoso = (nuevoPaciente) => {
    // Si es edición, reemplazar el paciente en la lista
    if (editData) {
      setPacientes(prev => prev.map(p => p.id === nuevoPaciente.id ? nuevoPaciente : p));
    } else {
      setPacientes(prev => [...prev, nuevoPaciente]);
    }
    setModalOpen(false);
    setEditData(null);
  };

  const handleEliminar = (paciente) => {
    Swal.fire({
      title: '¿Eliminar paciente?',
      text: 'Esta acción no se puede deshacer',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    }).then((result) => {
      if (result.isConfirmed) {
        fetch(BASE_URL + "api_pacientes.php", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: paciente.id })
        })
          .then(res => res.json())
          .then(data => {
            if (data.success) {
              setPacientes(prev => prev.filter(p => p.id !== paciente.id));
              Swal.fire('Eliminado', 'Paciente eliminado correctamente', 'success');
            } else {
              Swal.fire('Error', data.error || 'Error al eliminar paciente', 'error');
            }
          })
          .catch(() => Swal.fire('Error', 'Error de conexión con el servidor', 'error'));
      }
    });
  };


  // Filtrar por búsqueda y fechas (creado_en)
  let pacientesFiltrados = pacientes.filter(p => {
    // Filtro de búsqueda (historia_clinica, nombre, apellido, dni)
    const texto = busqueda.trim().toLowerCase();
    if (texto) {
      const match = (p.historia_clinica && p.historia_clinica.toLowerCase().includes(texto)) ||
                   (p.nombre && p.nombre.toLowerCase().includes(texto)) ||
                   (p.apellido && p.apellido.toLowerCase().includes(texto)) ||
                   (p.dni && p.dni.toLowerCase().includes(texto));
      if (!match) return false;
    }
    // Filtro de fechas
    if (!fechaDesde && !fechaHasta) return true;
    if (!p.creado_en) return false;
    const fecha = p.creado_en.split(" ")[0];
    if (fechaDesde && fecha < fechaDesde) return false;
    if (fechaHasta && fecha > fechaHasta) return false;
    return true;
  });
  // Ordenar
  pacientesFiltrados = pacientesFiltrados.sort((a, b) => {
    let vA = a[sortBy], vB = b[sortBy];
    if (typeof vA === "string") vA = vA.toLowerCase();
    if (typeof vB === "string") vB = vB.toLowerCase();
    if (vA === undefined || vA === null) return 1;
    if (vB === undefined || vB === null) return -1;
    if (vA < vB) return sortDir === "asc" ? -1 : 1;
    if (vA > vB) return sortDir === "asc" ? 1 : -1;
    return 0;
  });
  // Calcular paginación
  const totalRows = pacientesFiltrados.length;
  const totalPages = Math.ceil(totalRows / rowsPerPage);
  const startIdx = (page - 1) * rowsPerPage;
  const endIdx = startIdx + rowsPerPage;
  const pacientesPagina = pacientesFiltrados.slice(startIdx, endIdx);

  // Exportar a Excel
  const exportarExcel = () => {
    const ws = XLSX.utils.json_to_sheet(pacientesFiltrados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pacientes");
    const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([excelBuffer], { type: "application/octet-stream" });
    saveAs(blob, `pacientes_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  // Exportar a PDF
  const exportarPDF = () => {
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
      body: pacientesFiltrados,
      startY: 18,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [59, 130, 246] }
    });
    doc.save(`pacientes_${new Date().toISOString().slice(0,10)}.pdf`);
  };

  const handleRowsPerPageChange = (e) => {
    setRowsPerPage(Number(e.target.value));
    setPage(1);
  };
  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) setPage(newPage);
  };

  return (
    <div className="p-4 bg-white rounded shadow">
      <div className="flex flex-col md:flex-row md:justify-between md:items-center mb-4 gap-2">
        <h2 className="text-xl font-bold text-purple-800">Pacientes</h2>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={busqueda}
            onChange={e => { setBusqueda(e.target.value); setPage(1); }}
            placeholder="Buscar por historia clínica, nombre, apellido o DNI"
            className="border rounded px-2 py-1 min-w-[140px] md:min-w-[220px]"
          />
          <label className="text-sm font-medium">Filas por página:</label>
          <select value={rowsPerPage} onChange={handleRowsPerPageChange} className="border rounded px-1 py-0.5 md:px-2 md:py-1">
            <option value={5}>5</option>
            <option value={10}>10</option>
            <option value={25}>25</option>
          </select>
          <button onClick={handleAgregar} className="bg-blue-500 text-white px-2 py-1 md:px-4 md:py-2 rounded font-bold ml-2 text-xs md:text-base">Agregar paciente</button>
          <button onClick={exportarExcel} className="bg-green-600 text-white px-2 py-1 md:px-3 md:py-2 rounded font-bold ml-2 text-xs md:text-base">Exportar Excel</button>
          <button onClick={exportarPDF} className="bg-red-600 text-white px-2 py-1 md:px-3 md:py-2 rounded font-bold text-xs md:text-base">Exportar PDF</button>
        </div>
      </div>
      {/* Filtro de fechas */}
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <label className="text-sm">Desde:</label>
        <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} className="border rounded px-2 py-1" />
        <label className="text-sm">Hasta:</label>
        <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} className="border rounded px-2 py-1" />
        {(fechaDesde || fechaHasta) && (
          <button onClick={() => { setFechaDesde(""); setFechaHasta(""); }} className="text-blue-600 underline ml-2">Limpiar filtro</button>
        )}
      </div>
      {loading ? (
        <Spinner message="Cargando pacientes..." />
      ) : error ? (
        <div className="text-red-600">{error}</div>
      ) : (
        <>
        <div className="overflow-x-auto w-full">
          <table className="min-w-full text-xs md:text-sm border">
            <thead>
              <tr className="bg-blue-100">
                <th className="px-1 py-0.5 md:px-2 md:py-1 border cursor-pointer" onClick={() => handleSort("historia_clinica")}>HC {sortBy === "historia_clinica" ? (sortDir === "asc" ? "▲" : "▼") : ""}</th>
                <th className="px-1 py-0.5 md:px-2 md:py-1 border cursor-pointer" onClick={() => handleSort("nombre")}>Nombre {sortBy === "nombre" ? (sortDir === "asc" ? "▲" : "▼") : ""}</th>
                <th className="px-1 py-0.5 md:px-2 md:py-1 border hidden md:table-cell cursor-pointer" onClick={() => handleSort("apellido")}>Apellido {sortBy === "apellido" ? (sortDir === "asc" ? "▲" : "▼") : ""}</th>
                <th className="px-1 py-0.5 md:px-2 md:py-1 border hidden md:table-cell cursor-pointer" onClick={() => handleSort("edad")}>Edad {sortBy === "edad" ? (sortDir === "asc" ? "▲" : "▼") : ""}</th>
                <th className="px-1 py-0.5 md:px-2 md:py-1 border cursor-pointer" onClick={() => handleSort("dni")}>DNI {sortBy === "dni" ? (sortDir === "asc" ? "▲" : "▼") : ""}</th>
                <th className="px-1 py-0.5 md:px-2 md:py-1 border cursor-pointer hidden md:table-cell" onClick={() => handleSort("tipo_seguro")}>Tipo de seguro {sortBy === "tipo_seguro" ? (sortDir === "asc" ? "▲" : "▼") : ""}</th>
                <th className="px-1 py-0.5 md:px-2 md:py-1 border">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {pacientesPagina.map(p => (
                <tr key={p.id} className="hover:bg-blue-50">
                  <td className="border px-1 py-0.5 md:px-2 md:py-1">{p.historia_clinica}</td>
                  <td className="border px-1 py-0.5 md:px-2 md:py-1">{p.nombre}</td>
                  <td className="border px-1 py-0.5 md:px-2 md:py-1 hidden md:table-cell">{p.apellido}</td>
                  <td className="border px-1 py-0.5 md:px-2 md:py-1 hidden md:table-cell">{p.edad !== null ? p.edad : '-'} </td>
                  <td className="border px-1 py-0.5 md:px-2 md:py-1">{p.dni}</td>
                  <td className="border px-1 py-0.5 md:px-2 md:py-1 hidden md:table-cell">{p.tipo_seguro || '-'}</td>
                  <td className="border px-1 py-0.5 md:px-2 md:py-1 flex gap-1 md:gap-2">
                    <button onClick={() => handleEditar(p)} className="bg-yellow-400 text-white px-1 py-0.5 md:px-2 md:py-1 rounded text-xs md:text-sm">Editar</button>
                    <button onClick={() => handleEliminar(p)} className="bg-red-500 text-white px-1 py-0.5 md:px-2 md:py-1 rounded text-xs md:text-sm">Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Controles de paginación */}
        <div className="flex justify-end items-center gap-2 mt-2">
          <button onClick={() => handlePageChange(page - 1)} disabled={page === 1} className="px-2 py-1 rounded bg-gray-200 disabled:opacity-50">Anterior</button>
          <span className="text-sm">Página {page} de {totalPages}</span>
          <button onClick={() => handlePageChange(page + 1)} disabled={page === totalPages} className="px-2 py-1 rounded bg-gray-200 disabled:opacity-50">Siguiente</button>
        </div>
        </>
      )}
      {/* Modal para agregar/editar paciente */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-lg shadow-lg p-6 min-w-[320px] max-w-lg relative">
            <button
              onClick={() => { setModalOpen(false); setEditData(null); }}
              className="absolute top-2 right-2 text-gray-500 hover:text-red-500 text-xl font-bold"
              aria-label="Cerrar"
            >
              ×
            </button>
            <PacienteForm initialData={editData || {}} onRegistroExitoso={handleRegistroExitoso} />
          </div>
        </div>
      )}
    </div>
  );
}
export default PacienteList;
