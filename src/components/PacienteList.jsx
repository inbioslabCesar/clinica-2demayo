import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Spinner from "./Spinner";
import Swal from 'sweetalert2';
import PacienteForm from "./PacienteForm";
import PacienteModal from "./PacienteModal";
import { BASE_URL } from "../config/config";
import PacienteFilters from "./PacienteFilters";
import PacienteTable from "./PacienteTable";
import PacienteCards from "./PacienteCards";
import ExportButtons from "./ExportButtons";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";


  // ...existing code...

function PacienteList() {
  const navigate = useNavigate();
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
  const [totalRows, setTotalRows] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  // Filtro de fechas
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  // Buscador dinámico
  const [busqueda, setBusqueda] = useState("");

  // Consumir paginación del backend
  useEffect(() => {
    setLoading(true);
    fetch(`${BASE_URL}api_pacientes.php?page=${page}&limit=${rowsPerPage}`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setPacientes(data.pacientes);
          setTotalRows(data.total || 0);
          setTotalPages(data.totalPages || 1);
        } else {
          setError(data.error || "Error al cargar pacientes");
        }
        setLoading(false);
      })
      .catch(() => {
        setError("Error de conexión con el servidor");
        setLoading(false);
      });
  }, [page, rowsPerPage]);

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


  const handleRegistroExitoso = () => {
    setModalOpen(false);
    setEditData(null);
    setPage(1); // Volver a la primera página tras crear paciente
    setLoading(true);
    fetch(`${BASE_URL}api_pacientes.php?page=1&limit=${rowsPerPage}`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setPacientes(data.pacientes);
          setTotalRows(data.total || 0);
          setTotalPages(data.totalPages || 1);
        } else {
          setError(data.error || "Error al cargar pacientes");
        }
        setLoading(false);
      })
      .catch(() => {
        setError("Error de conexión con el servidor");
        setLoading(false);
      });
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
              Swal.fire('Eliminado', 'Paciente eliminado correctamente', 'success');
              // Recargar la página actual
              setLoading(true);
              fetch(`${BASE_URL}api_pacientes.php?page=${page}&limit=${rowsPerPage}`)
                .then(res => res.json())
                .then(data => {
                  if (data.success) {
                    setPacientes(data.pacientes);
                    setTotalRows(data.total || 0);
                    setTotalPages(data.totalPages || 1);
                  } else {
                    setError(data.error || "Error al cargar pacientes");
                  }
                  setLoading(false);
                })
                .catch(() => {
                  setError("Error de conexión con el servidor");
                  setLoading(false);
                });
            } else {
              Swal.fire('Error', data.error || 'Error al eliminar paciente', 'error');
            }
          })
          .catch(() => Swal.fire('Error', 'Error de conexión con el servidor', 'error'));
      }
    });
  };

  const handleDescargarCaratula = (paciente) => {
    const url = `${BASE_URL}descargar_caratula_paciente.php?paciente_id=${paciente.id}`;
    const link = document.createElement('a');
    link.href = url;
    link.download = `caratula_${paciente.historia_clinica}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };


  // Filtrar por búsqueda y fechas (creado_en)
  // Los pacientes ya vienen paginados del backend
  const pacientesPagina = pacientes;

  // Exportar a Excel
  const exportarExcel = () => {
    const ws = XLSX.utils.json_to_sheet(pacientes);
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
      body: pacientes,
      startY: 18,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [59, 130, 246] }
    });
    doc.save(`pacientes_${new Date().toISOString().slice(0,10)}.pdf`);
  };

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) setPage(newPage);
  };

  return (
    <div className="p-4 bg-white rounded shadow">
      {/* Header con título y botones principales */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4 gap-3">
        <h2 className="text-xl font-bold text-purple-800 flex items-center gap-2">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          Pacientes
        </h2>
        <div className="hidden sm:flex flex-wrap items-center gap-2">
          <button onClick={handleAgregar} className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg font-bold transition-colors flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Agregar Paciente
          </button>
            <ExportButtons onExcel={exportarExcel} onPDF={exportarPDF} />
        </div>
      </div>
      {/* Botones para móvil */}
      <div className="sm:hidden mb-4">
        <div className="flex gap-2 mb-3">
          <button onClick={handleAgregar} className="flex-1 bg-blue-500 hover:bg-blue-600 text-white px-4 py-3 rounded-lg font-bold transition-colors flex items-center justify-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Agregar Paciente
          </button>
        </div>
        <div className="flex gap-2">
            <ExportButtons onExcel={exportarExcel} onPDF={exportarPDF} className="flex-1 justify-center gap-1 text-sm" />
        </div>
      </div>
      {/* Filtros y búsqueda como componente */}
      <PacienteFilters
        busqueda={busqueda}
        setBusqueda={value => { setBusqueda(value); setPage(1); }}
        fechaDesde={fechaDesde}
        setFechaDesde={setFechaDesde}
        fechaHasta={fechaHasta}
        setFechaHasta={setFechaHasta}
        rowsPerPage={rowsPerPage}
        setRowsPerPage={value => { setRowsPerPage(value); setPage(1); }}
      />
      {loading ? (
        <Spinner message="Cargando pacientes..." />
      ) : error ? (
        <div className="text-red-600">{error}</div>
      ) : (
        <>
          {/* Vista de tabla para pantallas grandes como componente */}
          <PacienteTable
            pacientes={pacientesPagina}
            onEditar={handleEditar}
            onEliminar={handleEliminar}
            onDescargarCaratula={handleDescargarCaratula}
            onNavigate={navigate}
            sortBy={sortBy}
            sortDir={sortDir}
            handleSort={handleSort}
          />
          {/* Vista de tarjetas para móviles y tablets como componente */}
          <PacienteCards
            pacientes={pacientesPagina}
            onEditar={handleEditar}
            onEliminar={handleEliminar}
            onDescargarCaratula={handleDescargarCaratula}
            onNavigate={navigate}
          />
          {/* Controles de paginación mejorados */}
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mt-6 pt-4 border-t border-gray-200">
            <div className="text-sm text-gray-600 order-2 sm:order-1">
              Mostrando {pacientesPagina.length} de {totalRows} registros
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
      <PacienteModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditData(null); }}
      >
        <PacienteForm initialData={editData || {}} onRegistroExitoso={handleRegistroExitoso} />
      </PacienteModal>
    </div>
  );
}
export default PacienteList;
