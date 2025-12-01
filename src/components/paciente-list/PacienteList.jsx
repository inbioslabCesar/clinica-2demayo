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
      <div className="flex gap-2 mb-4">
        <button onClick={handleExportarExcel} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded font-bold">Exportar Excel</button>
        <button onClick={handleExportarPDF} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-bold">Exportar PDF</button>
      </div>
      <PacienteListFilters
        busqueda={busqueda}
        setBusqueda={value => { setBusqueda(value); setPage(1); }}
        rowsPerPage={rowsPerPage}
        setRowsPerPage={value => { setRowsPerPage(value); setPage(1); }}
      />
      {loading ? (
        <div>Cargando pacientes...</div>
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
