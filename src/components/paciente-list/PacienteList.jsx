// Orquesta la vista principal y conecta los componentes
import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { BASE_URL } from "../../config/config";
import { authFetch } from "../../utils/apiClient";
import Swal from "sweetalert2";
import usePacientes from "./usePacientes";
import PacienteListHeader from "./PacienteListHeader";
import PacienteListFilters from "./PacienteListFilters";
import PacienteListTable from "./PacienteListTable";
import PacienteListCards from "./PacienteListCards";
import PacienteListModal from "./PacienteListModal";
import PacienteListForm from "./PacienteListForm";
import { exportarExcel, exportarPDF } from "./PacienteListExport";

function PacienteList() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Leer estado inicial desde URL
  const initialPage        = Number(searchParams.get("page")     || 1);
  const initialRows        = Number(searchParams.get("rows")     || 5);
  const initialBusqueda    = searchParams.get("q")               || "";
  const initialFechaDesde  = searchParams.get("desde")           || "";
  const initialFechaHasta  = searchParams.get("hasta")           || "";

  // Helper: actualizar URL sin añadir historial
  const syncUrl = (updates) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      Object.entries(updates).forEach(([k, v]) => {
        if (v !== "" && v !== null && v !== undefined) next.set(k, String(v));
        else next.delete(k);
      });
      return next;
    }, { replace: true });
  };
  const {
    pacientes,
    loading,
    error,
    page,
    setPage: _setPage,
    rowsPerPage,
    setRowsPerPage: _setRowsPerPage,
    totalRows,
    totalPages,
    busqueda,
    setBusqueda: _setBusqueda,
    fechaDesde,
    setFechaDesde: _setFechaDesde,
    fechaHasta,
    setFechaHasta: _setFechaHasta,
    guardarPaciente,
    eliminarPaciente,
    recargarPacientes
  } = usePacientes({
    initialPage,
    initialRowsPerPage: initialRows,
    initialBusqueda,
    initialFechaDesde,
    initialFechaHasta,
  });

  // Setters que sincronizan la URL
  const setPage = (v) => { _setPage(v); syncUrl({ page: v === 1 ? null : v }); };
  const setRowsPerPage = (v) => { _setRowsPerPage(v); syncUrl({ rows: v === 5 ? null : v, page: null }); };
  const setBusqueda = (v) => { _setBusqueda(v); syncUrl({ q: v || null, page: null }); };
  const setFechaDesde = (v) => { _setFechaDesde(v); syncUrl({ desde: v || null }); };
  const setFechaHasta = (v) => { _setFechaHasta(v); syncUrl({ hasta: v || null }); };

  // Modal y edición
  const [modalOpen, setModalOpen] = useState(false);
  const [editData, setEditData] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();

  const contextoAgendarDesdeDisponibilidad = useMemo(() => {
    const medicoId = Number(searchParams.get("agendar_medico_id") || 0);
    const fecha = String(searchParams.get("agendar_fecha") || "").trim();
    const hora = String(searchParams.get("agendar_hora") || "").trim();
    const origen = String(searchParams.get("agendar_origen") || "").trim();
    const backTo = String(searchParams.get("back_to") || "/recordatorios-citas").trim();
    const medicoNombre = String(searchParams.get("agendar_medico_nombre") || "").trim();
    const medicoEspecialidad = String(searchParams.get("agendar_medico_especialidad") || "").trim();

    const activo = medicoId > 0
      && /^\d{4}-\d{2}-\d{2}$/.test(fecha)
      && /^\d{2}:\d{2}$/.test(hora);

    return {
      activo,
      medicoId,
      fecha,
      hora,
      origen: origen || "recordatorios_disponibilidad",
      backTo: backTo.startsWith("/") ? backTo : "/recordatorios-citas",
      medicoNombre,
      medicoEspecialidad,
    };
  }, [searchParams]);

  const manejarCotizarPaciente = useCallback((paciente) => {
    const pacienteId = Number(paciente?.id || 0);
    if (pacienteId <= 0) return;

    if (contextoAgendarDesdeDisponibilidad.activo) {
      const params = new URLSearchParams({
        paciente_id: String(pacienteId),
        medico_id: String(contextoAgendarDesdeDisponibilidad.medicoId),
        fecha: contextoAgendarDesdeDisponibilidad.fecha,
        hora: contextoAgendarDesdeDisponibilidad.hora,
        origen: contextoAgendarDesdeDisponibilidad.origen,
        back_to: contextoAgendarDesdeDisponibilidad.backTo,
      });
      navigate(`/agendar-consulta?${params.toString()}`);
      return;
    }

    navigate(`/seleccionar-servicio?paciente_id=${pacienteId}`);
  }, [contextoAgendarDesdeDisponibilidad, navigate]);

  const cancelarContextoAgendarDisponibilidad = useCallback(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      [
        "agendar_medico_id",
        "agendar_fecha",
        "agendar_hora",
        "agendar_origen",
        "agendar_medico_nombre",
        "agendar_medico_especialidad",
        "back_to",
      ].forEach((key) => next.delete(key));
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  // Abrir modal con DNI pre-llenado si viene desde CotizadorRapido
  useEffect(() => {
    if (location.state?.openModal && location.state?.prefillDni) {
      setEditData({
        id: undefined,
        dni: location.state.prefillDni,
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
        grupo_sanguineo: "NO_ESPECIFICADO",
        factor_rh: "NO_ESPECIFICADO",
        acompanantes: [],
      });
      setModalOpen(true);
      // Limpiar el state para evitar re-apertura en navegación futura
      navigate("/pacientes", { replace: true, state: {} });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
      grupo_sanguineo: "NO_ESPECIFICADO",
      factor_rh: "NO_ESPECIFICADO",
      acompanantes: [],
    });
    setModalOpen(true);
  };
  const handleEditar = useCallback((paciente) => {
    setEditData({ ...paciente });
    setModalOpen(true);
  }, []);
  const handleRegistroExitoso = useCallback(() => {
    setModalOpen(false);
    setEditData(null);
    recargarPacientes(); // Recarga los datos desde el backend tras editar/crear
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recargarPacientes]);

  const handleEliminar = useCallback(async (paciente) => {
    await eliminarPaciente(paciente);
    recargarPacientes(); // Recarga los datos desde el backend tras eliminar
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eliminarPaciente, recargarPacientes]);
  const handleDescargarCaratula = useCallback(async (paciente) => {
    try {
      const url = `${BASE_URL}descargar_caratula_paciente.php?paciente_id=${paciente.id}&_ts=${Date.now()}`;
      const res = await authFetch(url);

      const contentType = res.headers.get('Content-Type') || '';
      if (!res.ok || !contentType.includes('application/pdf')) {
        let msg = 'Error al generar la carátula.';
        try {
          const json = await res.json();
          msg = json.details || json.error || msg;
        } catch {
          // no JSON
        }
        Swal.fire({ icon: 'error', title: 'Error PDF', text: msg });
        return;
      }

      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objUrl;
      link.download = `caratula_${paciente.historia_clinica}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(objUrl);
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo descargar la carátula.' });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      {contextoAgendarDesdeDisponibilidad.activo && (
        <div className="mb-4 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-900">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <span className="font-semibold">Selecciona un paciente para agendar:</span>{" "}
              {contextoAgendarDesdeDisponibilidad.medicoNombre || `Medico #${contextoAgendarDesdeDisponibilidad.medicoId}`}
              {contextoAgendarDesdeDisponibilidad.medicoEspecialidad ? ` (${contextoAgendarDesdeDisponibilidad.medicoEspecialidad})` : ""}
              {" · "}
              {contextoAgendarDesdeDisponibilidad.fecha} {contextoAgendarDesdeDisponibilidad.hora}
            </div>
            <button
              type="button"
              onClick={cancelarContextoAgendarDisponibilidad}
              className="inline-flex items-center justify-center rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-800 hover:bg-indigo-100"
            >
              Cancelar contexto
            </button>
            <button
              type="button"
              onClick={() => navigate(contextoAgendarDesdeDisponibilidad.backTo || "/recordatorios-citas")}
              className="inline-flex items-center justify-center rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-800 hover:bg-indigo-100"
            >
              Volver a Recordatorios
            </button>
          </div>
        </div>
      )}
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
        setBusqueda={setBusqueda}
        rowsPerPage={rowsPerPage}
        setRowsPerPage={setRowsPerPage}
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
            onCotizarPaciente={manejarCotizarPaciente}
            cotizarLabel={contextoAgendarDesdeDisponibilidad.activo ? "Agendar" : "Cotizar"}
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
            onCotizarPaciente={manejarCotizarPaciente}
            cotizarLabel={contextoAgendarDesdeDisponibilidad.activo ? "Agendar" : "Cotizar"}
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
