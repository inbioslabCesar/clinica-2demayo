

import Spinner from "../comunes/Spinner";
import { BASE_URL } from "../../config/config";
import useTriageConsultas from "./useTriageConsultas";
import TriageStats from "./TriageStats";
import TriageFilters from "./TriageFilters";
import TriageTable from "./TriageTable";
import TriageCards from "./TriageCards";
import TriagePagination from "./TriagePagination";
import TriageFormModal from "./TriageFormModal";


function TriageList() {
  const {
    triajeStatus,
    loading,
    error,
    triajeActual,
    setTriajeActual,
    triajeData,
    setTriajeData,
    guardando,
    setGuardando,
    cargandoTriaje,
    setCargandoTriaje,
    rowsPerPage,
    setRowsPerPage,
    page,
    setPage,
    busqueda,
    setBusqueda,
    fechaDesde,
    setFechaDesde,
    fechaHasta,
    setFechaHasta,
    recargarConsultas,
    consultasFiltradas,
    consultasPagina,
    totalRows,
    totalPages,
    startIdx,
    endIdx
  } = useTriageConsultas();

  // Handler para abrir el triaje de un paciente
  const handleRealizarTriaje = async (c) => {
    setTriajeActual(c);
    setCargandoTriaje(true);
    setTriajeData(null);
    try {
      const res = await fetch(BASE_URL + `api_triaje.php?consulta_id=${c.id}`);
      const data = await res.json();
      if (data.success && data.triaje && data.triaje.datos) {
        setTriajeData(data.triaje.datos);
      } else {
        setTriajeData(null);
      }
    } catch {
      setTriajeData(null);
    }
    setCargandoTriaje(false);
  };

  // Handler para guardar triaje
  const handleGuardarTriaje = async (datos) => {
    setGuardando(true);
    const payload = {
      consulta_id: triajeActual.id,
      datos: {
        ...datos,
        paciente_id: triajeActual.paciente_id
      }
    };
    try {
      const response = await fetch(BASE_URL + "api_triaje.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!result.success) {
        alert('Error al guardar triaje: ' + (result.error || 'Error desconocido'));
      }
    } catch {
      alert('Error de red al guardar triaje');
    }
    setGuardando(false);
    setTriajeActual(null);
    setTriajeData(null);
    recargarConsultas();
  };

  // Handler para cancelar triaje
  const handleCancelarTriaje = () => {
    setTriajeActual(null);
    setTriajeData(null);
  };

  if (loading) return <Spinner message="Cargando pacientes en triaje..." />;
  if (error) return <div className="text-red-600">{error}</div>;

  return (
    <div className="space-y-6">
      <TriageStats totalRows={totalRows} triajeStatus={triajeStatus} />
      <TriageFilters
        busqueda={busqueda}
        setBusqueda={setBusqueda}
        fechaDesde={fechaDesde}
        setFechaDesde={setFechaDesde}
        fechaHasta={fechaHasta}
        setFechaHasta={setFechaHasta}
        rowsPerPage={rowsPerPage}
        setRowsPerPage={setRowsPerPage}
        setPage={setPage}
      />
      <TriageFormModal
        triajeActual={triajeActual}
        triajeData={triajeData}
        cargandoTriaje={cargandoTriaje}
        guardando={guardando}
        onGuardar={handleGuardarTriaje}
        onCancelar={handleCancelarTriaje}
      />
      {!triajeActual && (
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
          <div className="bg-gradient-to-r from-gray-50 to-gray-100 p-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-xl text-gray-600">
                  <i className="ms-Icon ms-Icon--Table" />
                </span>
                <h3 className="text-lg font-semibold text-gray-800">
                  Lista de Pacientes para Triaje
                </h3>
              </div>
              <div className="text-sm text-gray-600">
                {consultasFiltradas.length > 0
                  ? `Mostrando ${consultasPagina.length} de ${consultasFiltradas.length} pacientes`
                  : 'No hay pacientes'}
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            {consultasFiltradas.length === 0 ? (
              <div className="text-center py-12">
                <div className="flex items-center justify-center w-20 h-20 bg-gray-100 rounded-full mx-auto mb-4">
                  <i className="ms-Icon ms-Icon--Health text-4xl text-gray-400" />
                </div>
                <h3 className="text-xl font-semibold text-gray-600 mb-2">No hay pacientes</h3>
                <p className="text-gray-500">No se encontraron pacientes pendientes de triaje</p>
              </div>
            ) : (
              <>
                <TriageTable
                  consultasPagina={consultasPagina}
                  triajeStatus={triajeStatus}
                  onRealizarTriaje={handleRealizarTriaje}
                />
                <TriageCards
                  consultasPagina={consultasPagina}
                  triajeStatus={triajeStatus}
                  onRealizarTriaje={handleRealizarTriaje}
                />
              </>
            )}
          </div>
        </div>
      )}
      {!triajeActual && (
        <TriagePagination
          totalRows={totalRows}
          totalPages={totalPages}
          startIdx={startIdx}
          endIdx={endIdx}
          page={page}
          setPage={setPage}
        />
      )}
    </div>
  );
}

export default TriageList;
