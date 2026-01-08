// Orquesta la vista principal y conecta los componentes
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { BASE_URL } from "../../config/config";
import usePacientes from "./usePacientes";
import PacienteListHeader from "./PacienteListHeader";
import PacienteListFilters from "./PacienteListFilters";
import PacienteListTable from "./PacienteListTable";
import PacienteListCards from "./PacienteListCards";
import PacienteListModal from "./PacienteListModal";
import PacienteListForm from "./PacienteListForm";
import { exportarExcel, exportarPDF } from "./PacienteListExport";

function PacienteList() {
  const {
    pacientes,
    loading,
    error,
    page,
    setPage,
    rowsPerPage,
    setRowsPerPage,
    totalRows,
    totalPages,
    busqueda,
    setBusqueda,
    fechaDesde,
    setFechaDesde,
    fechaHasta,
    setFechaHasta,
    guardarPaciente,
    eliminarPaciente,
    recargarPacientes
  } = usePacientes();

  // Modal y edición
  const [modalOpen, setModalOpen] = useState(false);
  const [editData, setEditData] = useState(null);
  const navigate = useNavigate();
  // Ordenamiento de columnas
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
    setEditData({ ...paciente });
    setModalOpen(true);
  };
  const handleRegistroExitoso = () => {
    setModalOpen(false);
    setEditData(null);
    recargarPacientes(); // Recarga los datos desde el backend tras editar/crear
  };

  const handleEliminar = async (paciente) => {
    await eliminarPaciente(paciente);
    recargarPacientes(); // Recarga los datos desde el backend tras eliminar
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

  // Exportar a Excel
  const handleExportarExcel = () => {
    exportarExcel(pacientes);
  };

  // Exportar a PDF
  const handleExportarPDF = () => {
    exportarPDF(pacientes);
  };

  return (
    <div className="p-4 bg-white rounded shadow">
      <PacienteListHeader onAgregar={handleAgregar} totalRows={totalRows} />
      <div className="flex flex-col sm:flex-row gap-2 mb-4 w-full">
        <button
          onClick={handleExportarExcel}
          className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg shadow-lg font-bold flex items-center justify-center gap-2 text-base sm:text-lg"
          style={{ minWidth: '160px' }}
        >
          <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 17l-4 4m0 0l-4-4m4 4V3" />
          </svg>
          Exportar Excel
        </button>
        <button
          onClick={handleExportarPDF}
          className="w-full sm:w-auto bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg shadow-lg font-bold flex items-center justify-center gap-2 text-base sm:text-lg"
          style={{ minWidth: '160px' }}
        >
          <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19V6m0 0l-7 7m7-7l7 7" />
          </svg>
          Exportar PDF
        </button>
      </div>
      <PacienteListFilters
        busqueda={busqueda}
        setBusqueda={value => { setBusqueda(value); setPage(1); }}
        rowsPerPage={rowsPerPage}
        setRowsPerPage={value => { setRowsPerPage(value); setPage(1); }}
        fechaDesde={fechaDesde}
        setFechaDesde={setFechaDesde}
        fechaHasta={fechaHasta}
        setFechaHasta={setFechaHasta}
      />
      {loading ? (
        <div className="flex flex-col items-center justify-center py-12">
          <svg className="animate-spin h-10 w-10 text-purple-700 mb-3" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-purple-700 font-semibold text-lg">Cargando pacientes...</span>
        </div>
      ) : error ? (
        <div className="text-red-600">{error}</div>
      ) : (
        <>
          <PacienteListTable
            pacientes={pacientes}
            onEditar={handleEditar}
            onEliminar={handleEliminar}
            onDescargarCaratula={handleDescargarCaratula}
            onNavigate={navigate}
            sortBy={sortBy}
            sortDir={sortDir}
            handleSort={handleSort}
            page={page}
            setPage={setPage}
            totalPages={totalPages}
          />
          <PacienteListCards
            pacientes={pacientes}
            onEditar={handleEditar}
            onEliminar={handleEliminar}
            onDescargarCaratula={handleDescargarCaratula}
            onNavigate={navigate}
            page={page}
            setPage={setPage}
            totalPages={totalPages}
          />
        </>
      )}
      <PacienteListModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditData(null); }}
        editData={editData}
        onRegistroExitoso={handleRegistroExitoso}
      >
        <PacienteListForm
          initialData={editData || {}}
          onRegistroExitoso={handleRegistroExitoso}
          guardarPaciente={guardarPaciente}
        />
      </PacienteListModal>
    </div>
  );
}

export default PacienteList;
