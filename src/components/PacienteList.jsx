
import { useEffect, useState } from "react";
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
  // Orden inicial: por id descendente (más reciente primero)
  const [sortBy, setSortBy] = useState("id");
  const [sortDir, setSortDir] = useState("desc");

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
      setPacientes(prev => [nuevoPaciente, ...prev]);
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
      {/* Header con título */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4 gap-3">
        <h2 className="text-xl font-bold text-purple-800 flex items-center gap-2">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          Pacientes
        </h2>
        
        {/* Botones principales para desktop */}
        <div className="hidden sm:flex flex-wrap items-center gap-2">
          <button 
            onClick={handleAgregar} 
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg font-bold transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Agregar Paciente
          </button>
          <button 
            onClick={exportarExcel} 
            className="bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Excel
          </button>
          <button 
            onClick={exportarPDF} 
            className="bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            PDF
          </button>
        </div>
      </div>

      {/* Botones para móvil */}
      <div className="sm:hidden mb-4">
        <div className="flex gap-2 mb-3">
          <button 
            onClick={handleAgregar} 
            className="flex-1 bg-blue-500 hover:bg-blue-600 text-white px-4 py-3 rounded-lg font-bold transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Agregar Paciente
          </button>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={exportarExcel} 
            className="flex-1 bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-1 text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Excel
          </button>
          <button 
            onClick={exportarPDF} 
            className="flex-1 bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-1 text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            PDF
          </button>
        </div>
      </div>

      {/* Búsqueda y controles */}
      <div className="bg-gray-50 rounded-lg p-4 mb-4 space-y-4">
        {/* Buscador */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            type="text"
            value={busqueda}
            onChange={e => { setBusqueda(e.target.value); setPage(1); }}
            placeholder="Buscar por historia clínica, nombre, apellido o DNI"
            className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          />
          {busqueda && (
            <button
              onClick={() => { setBusqueda(""); setPage(1); }}
              className="absolute inset-y-0 right-0 pr-3 flex items-center"
            >
              <svg className="h-5 w-5 text-gray-400 hover:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Filtros de fecha y paginación */}
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Filtro de fechas */}
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">Filtrar por fecha de registro:</label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Desde</label>
                <input 
                  type="date" 
                  value={fechaDesde} 
                  onChange={e => setFechaDesde(e.target.value)} 
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500" 
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Hasta</label>
                <input 
                  type="date" 
                  value={fechaHasta} 
                  onChange={e => setFechaHasta(e.target.value)} 
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500" 
                />
              </div>
            </div>
            {(fechaDesde || fechaHasta) && (
              <button 
                onClick={() => { setFechaDesde(""); setFechaHasta(""); }} 
                className="mt-2 text-blue-600 hover:text-blue-800 text-sm font-medium"
              >
                Limpiar filtros de fecha
              </button>
            )}
          </div>

          {/* Control de filas por página */}
          <div className="sm:w-48">
            <label className="block text-sm font-medium text-gray-700 mb-2">Registros por página:</label>
            <select 
              value={rowsPerPage} 
              onChange={handleRowsPerPageChange} 
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value={5}>5 registros</option>
              <option value={10}>10 registros</option>
              <option value={25}>25 registros</option>
            </select>
          </div>
        </div>

        {/* Contador de resultados */}
        {pacientesFiltrados.length > 0 && (
          <div className="text-sm text-gray-600 bg-white px-3 py-2 rounded-lg border border-gray-200">
            <span className="font-medium">
              {busqueda || fechaDesde || fechaHasta 
                ? `${pacientesFiltrados.length} resultado${pacientesFiltrados.length !== 1 ? 's' : ''} encontrado${pacientesFiltrados.length !== 1 ? 's' : ''}`
                : `${pacientesFiltrados.length} paciente${pacientesFiltrados.length !== 1 ? 's' : ''} registrado${pacientesFiltrados.length !== 1 ? 's' : ''}`
              }
            </span>
          </div>
        )}
      </div>
      {loading ? (
        <Spinner message="Cargando pacientes..." />
      ) : error ? (
        <div className="text-red-600">{error}</div>
      ) : (
        <>
        {/* Vista de tabla para pantallas grandes */}
        <div className="hidden lg:block overflow-x-auto w-full">
          <table className="min-w-full text-sm border">
            <thead>
              <tr className="bg-blue-100">
                <th className="px-2 py-1 border cursor-pointer" onClick={() => handleSort("historia_clinica")}>HC {sortBy === "historia_clinica" ? (sortDir === "asc" ? "▲" : "▼") : ""}</th>
                <th className="px-2 py-1 border cursor-pointer" onClick={() => handleSort("nombre")}>Nombre {sortBy === "nombre" ? (sortDir === "asc" ? "▲" : "▼") : ""}</th>
                <th className="px-2 py-1 border cursor-pointer" onClick={() => handleSort("apellido")}>Apellido {sortBy === "apellido" ? (sortDir === "asc" ? "▲" : "▼") : ""}</th>
                <th className="px-2 py-1 border cursor-pointer" onClick={() => handleSort("edad")}>Edad {sortBy === "edad" ? (sortDir === "asc" ? "▲" : "▼") : ""}</th>
                <th className="px-2 py-1 border cursor-pointer" onClick={() => handleSort("dni")}>DNI {sortBy === "dni" ? (sortDir === "asc" ? "▲" : "▼") : ""}</th>
                <th className="px-2 py-1 border cursor-pointer" onClick={() => handleSort("tipo_seguro")}>Tipo de seguro {sortBy === "tipo_seguro" ? (sortDir === "asc" ? "▲" : "▼") : ""}</th>
                <th className="px-2 py-1 border">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {pacientesPagina.map(p => (
                <tr key={p.id} className="hover:bg-blue-50">
                  <td className="border px-2 py-1">{p.historia_clinica}</td>
                  <td className="border px-2 py-1">{p.nombre}</td>
                  <td className="border px-2 py-1">{p.apellido}</td>
                  <td className="border px-2 py-1">{p.edad !== null ? p.edad : '-'} </td>
                  <td className="border px-2 py-1">{p.dni}</td>
                  <td className="border px-2 py-1">{p.tipo_seguro || '-'}</td>
                  <td className="border px-2 py-1">
                    <div className="flex gap-2">
                      <button onClick={() => handleEditar(p)} className="bg-yellow-400 text-white px-2 py-1 rounded text-sm hover:bg-yellow-500">Editar</button>
                      <button onClick={() => handleEliminar(p)} className="bg-red-500 text-white px-2 py-1 rounded text-sm hover:bg-red-600">Eliminar</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Vista de tarjetas para móviles y tablets */}
        <div className="lg:hidden grid grid-cols-1 md:grid-cols-2 gap-4">
          {pacientesPagina.map(p => (
            <div key={p.id} className="bg-gradient-to-br from-blue-50 to-purple-50 border border-blue-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
              {/* Header con HC y acciones */}
              <div className="flex justify-between items-start mb-3">
                <div>
                  <div className="text-lg font-bold text-purple-800">HC: {p.historia_clinica}</div>
                  <div className="text-sm text-gray-600">DNI: {p.dni}</div>
                </div>
                <div className="flex gap-1">
                  <button 
                    onClick={() => handleEditar(p)} 
                    className="bg-yellow-400 hover:bg-yellow-500 text-white p-2 rounded-full transition-colors"
                    title="Editar paciente"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button 
                    onClick={() => handleEliminar(p)} 
                    className="bg-red-500 hover:bg-red-600 text-white p-2 rounded-full transition-colors"
                    title="Eliminar paciente"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Información del paciente */}
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="font-medium text-blue-800">{p.nombre} {p.apellido}</span>
                  <span className="text-sm bg-blue-100 px-2 py-1 rounded">
                    {p.edad !== null ? `${p.edad} años` : 'Edad no registrada'}
                  </span>
                </div>
                
                {p.tipo_seguro && (
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                    <span className="text-sm text-green-700 font-medium">{p.tipo_seguro}</span>
                  </div>
                )}

                {(p.telefono || p.email) && (
                  <div className="pt-2 border-t border-blue-200">
                    {p.telefono && (
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                        </svg>
                        {p.telefono}
                      </div>
                    )}
                    {p.email && (
                      <div className="flex items-center gap-2 text-sm text-gray-600 mt-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        {p.email}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        {/* Controles de paginación mejorados */}
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mt-6 pt-4 border-t border-gray-200">
          <div className="text-sm text-gray-600 order-2 sm:order-1">
            Mostrando {pacientesPagina.length} de {pacientesFiltrados.length} registros
          </div>
          
          <div className="flex items-center gap-2 order-1 sm:order-2">
            <button 
              onClick={() => handlePageChange(page - 1)} 
              disabled={page === 1} 
              className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span className="hidden sm:inline">Anterior</span>
            </button>
            
            <div className="flex items-center gap-1">
              <span className="px-3 py-2 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-lg">
                {page}
              </span>
              <span className="px-2 text-sm text-gray-500">de</span>
              <span className="px-3 py-2 text-sm font-medium text-gray-600 bg-gray-50 border border-gray-200 rounded-lg">
                {totalPages}
              </span>
            </div>
            
            <button 
              onClick={() => handlePageChange(page + 1)} 
              disabled={page === totalPages} 
              className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <span className="hidden sm:inline">Siguiente</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
        </>
      )}
      {/* Modal responsivo para agregar/editar paciente */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            {/* Fondo oscuro */}
            <div 
              className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" 
              onClick={() => { setModalOpen(false); setEditData(null); }}
            ></div>

            {/* Centrar modal */}
            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

            {/* Modal */}
            <div className="inline-block align-bottom bg-white rounded-t-2xl sm:rounded-2xl text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full w-full max-h-full">
              {/* Header del modal para móvil */}
              <div className="bg-purple-800 px-4 py-3 sm:px-6 sm:py-4 flex items-center justify-between">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  {editData ? "Editar Paciente" : "Nuevo Paciente"}
                </h3>
                <button
                  onClick={() => { setModalOpen(false); setEditData(null); }}
                  className="bg-purple-700 hover:bg-purple-600 text-white p-2 rounded-full transition-colors"
                  aria-label="Cerrar"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Contenido del modal */}
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4 max-h-[calc(100vh-120px)] sm:max-h-[80vh] overflow-y-auto">
                <PacienteForm initialData={editData || {}} onRegistroExitoso={handleRegistroExitoso} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
export default PacienteList;
