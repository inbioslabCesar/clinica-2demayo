import { useEffect, useState } from "react";
import { BASE_URL } from "../config/config";
import { useNavigate } from "react-router-dom";

const STORAGE_PAGE_KEY = "lab_ordenes_page";
const STORAGE_ROWS_KEY = "lab_ordenes_rows";
const STORAGE_VIEW_KEY = "lab_ordenes_view";
const STORAGE_FECHA_INICIO_KEY = "lab_ordenes_fecha_inicio";
const STORAGE_FECHA_FIN_KEY = "lab_ordenes_fecha_fin";
const STORAGE_BUSQUEDA_KEY = "lab_ordenes_busqueda";
const STORAGE_ESTADO_KEY = "lab_ordenes_estado";
const STORAGE_ALERTA_KEY = "lab_ordenes_alerta";

function OrdenesLaboratorioList({ onSeleccionarOrden }) {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState(() => {
    const saved = sessionStorage.getItem(STORAGE_VIEW_KEY);
    return saved === 'cards' ? 'cards' : 'table';
  });
  const [rowsPerPage, setRowsPerPage] = useState(() => {
    const saved = Number(sessionStorage.getItem(STORAGE_ROWS_KEY));
    return [3, 5, 10, 25, 50].includes(saved) ? saved : 3;
  });
  const [page, setPage] = useState(() => {
    const saved = Number(sessionStorage.getItem(STORAGE_PAGE_KEY));
    return Number.isInteger(saved) && saved >= 0 ? saved : 0;
  });
  const [ordenes, setOrdenes] = useState([]);
  const [totalOrdenes, setTotalOrdenes] = useState(0);
  const [loading, setLoading] = useState(true);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [error, setError] = useState("");
  const [examenesDisponibles, setExamenesDisponibles] = useState([]);
  const [fechaInicio, setFechaInicio] = useState(() => sessionStorage.getItem(STORAGE_FECHA_INICIO_KEY) || "");
  const [fechaFin, setFechaFin] = useState(() => sessionStorage.getItem(STORAGE_FECHA_FIN_KEY) || "");
  const [busqueda, setBusqueda] = useState(() => sessionStorage.getItem(STORAGE_BUSQUEDA_KEY) || "");
  const [busquedaDebounced, setBusquedaDebounced] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState(() => sessionStorage.getItem(STORAGE_ESTADO_KEY) || "");
  const [filtroAlertaEstado, setFiltroAlertaEstado] = useState(() => sessionStorage.getItem(STORAGE_ALERTA_KEY) || "");
  const [resumenAlertas, setResumenAlertas] = useState({ vencido: 0, por_vencer: 0, en_tiempo: 0 });

  useEffect(() => {
    const timer = setTimeout(() => {
      setBusquedaDebounced(busqueda);
    }, 300);
    return () => clearTimeout(timer);
  }, [busqueda]);

  useEffect(() => {
    sessionStorage.setItem(STORAGE_VIEW_KEY, viewMode);
  }, [viewMode]);

  useEffect(() => {
    sessionStorage.setItem(STORAGE_FECHA_INICIO_KEY, fechaInicio);
  }, [fechaInicio]);

  useEffect(() => {
    sessionStorage.setItem(STORAGE_FECHA_FIN_KEY, fechaFin);
  }, [fechaFin]);

  useEffect(() => {
    sessionStorage.setItem(STORAGE_BUSQUEDA_KEY, busqueda);
  }, [busqueda]);

  useEffect(() => {
    sessionStorage.setItem(STORAGE_ESTADO_KEY, estadoFiltro);
  }, [estadoFiltro]);

  useEffect(() => {
    sessionStorage.setItem(STORAGE_ALERTA_KEY, filtroAlertaEstado);
  }, [filtroAlertaEstado]);

  useEffect(() => {
    // Cargar lista de exámenes disponibles para mapear IDs a nombres
    fetch(BASE_URL + "api_examenes_laboratorio.php", {
      credentials: 'include'
    })
      .then(res => res.json())
      .then(data => {
        setExamenesDisponibles(data.examenes || []);
      });
  }, []);

  useEffect(() => {
    setLoading(true);
    setError("");

    const params = new URLSearchParams();
    params.set('solo_visibles_panel', '1');
    params.set('paginated', '1');
    params.set('page', String(page + 1));
    params.set('limit', String(rowsPerPage));
    if (fechaInicio) params.set('filtro_fecha_desde', fechaInicio);
    if (fechaFin) params.set('filtro_fecha_hasta', fechaFin);
    if (busquedaDebounced.trim()) params.set('filtro_busqueda', busquedaDebounced.trim());
    if (estadoFiltro) params.set('estado', estadoFiltro);
    if (filtroAlertaEstado) params.set('filtro_alerta', filtroAlertaEstado);

    fetch(BASE_URL + 'api_ordenes_laboratorio.php?' + params.toString(), {
      credentials: 'include'
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setOrdenes(data.ordenes || []);
          setTotalOrdenes(Number(data.total || 0));
        } else {
          setError(data.error || "Error al cargar órdenes");
          setOrdenes([]);
          setTotalOrdenes(0);
        }
        setLoading(false);
        setInitialLoaded(true);
      })
      .catch((err) => {
        setError("Error de conexión con el servidor");
        setOrdenes([]);
        setTotalOrdenes(0);
        setLoading(false);
        setInitialLoaded(true);
        console.error('Error al cargar órdenes:', err);
      });
  }, [fechaInicio, fechaFin, busquedaDebounced, estadoFiltro, filtroAlertaEstado, page, rowsPerPage]);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set('solo_visibles_panel', '1');
    params.set('resumen_alertas', '1');
    if (fechaInicio) params.set('filtro_fecha_desde', fechaInicio);
    if (fechaFin) params.set('filtro_fecha_hasta', fechaFin);
    if (busquedaDebounced.trim()) params.set('filtro_busqueda', busquedaDebounced.trim());
    if (estadoFiltro) params.set('estado', estadoFiltro);

    fetch(BASE_URL + 'api_ordenes_laboratorio.php?' + params.toString(), {
      credentials: 'include'
    })
      .then(res => res.json())
      .then(data => {
        setResumenAlertas({
          vencido: Number(data.vencido || 0),
          por_vencer: Number(data.por_vencer || 0),
          en_tiempo: Number(data.en_tiempo || 0),
        });
      })
      .catch(() => {
        setResumenAlertas({ vencido: 0, por_vencer: 0, en_tiempo: 0 });
      });
  }, [fechaInicio, fechaFin, busquedaDebounced, estadoFiltro]);

  // Ya viene paginado y ordenado desde el backend.
  const ordenesFiltradas = ordenes;

  // Paginación
  const totalPages = Math.ceil(totalOrdenes / rowsPerPage);
  const totalPagesSafe = Math.max(1, totalPages);
  const canClampPage = initialLoaded && totalOrdenes > 0;
  const pageSafe = canClampPage
    ? Math.min(Math.max(0, page), totalPagesSafe - 1)
    : Math.max(0, page);

  useEffect(() => {
    if (canClampPage && page !== pageSafe) {
      setPage(pageSafe);
    }
  }, [canClampPage, page, pageSafe]);

  useEffect(() => {
    if (canClampPage) {
      sessionStorage.setItem(STORAGE_PAGE_KEY, String(pageSafe));
    }
  }, [canClampPage, pageSafe]);

  useEffect(() => {
    sessionStorage.setItem(STORAGE_ROWS_KEY, String(rowsPerPage));
  }, [rowsPerPage]);

  const getPageWindow = () => {
    const windowSize = 5;
    let start = Math.max(0, pageSafe - Math.floor(windowSize / 2));
    let end = Math.min(totalPagesSafe - 1, start + windowSize - 1);
    if (end - start + 1 < windowSize) {
      start = Math.max(0, end - windowSize + 1);
    }
    const pages = [];
    for (let index = start; index <= end; index += 1) {
      pages.push(index);
    }
    return pages;
  };

  const pageWindow = getPageWindow();
  const paginated = ordenesFiltradas;

  const getExamenesNombres = (examenes) => {
    if (!Array.isArray(examenes)) return "";
    return examenes.map(ex => {
      // ex puede ser un objeto {id, nombre} o un ID numérico/string
      if (ex && typeof ex === 'object') {
        return ex.nombre || ex.descripcion || `#${ex.id}`;
      }
      const exObj = examenesDisponibles.find(e => e.id == ex);
      return exObj ? exObj.nombre : String(ex);
    }).join(", ");
  };

  const formatFecha = (fecha) => {
    if (!fecha) return "N/A";
    return new Date(fecha).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit', 
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleCompararResultados = (orden) => {
    const pacienteId = Number(orden?.paciente_id_ref || orden?.paciente_id || 0);
    if (!pacienteId) return;
    navigate(`/laboratorio/comparar-resultados/${pacienteId}`);
  };

  const handleResetFiltros = () => {
    setFechaInicio("");
    setFechaFin("");
    setBusqueda("");
    setEstadoFiltro("");
    setFiltroAlertaEstado("");
    setRowsPerPage(3);
    setPage(0);
    setViewMode('table');

    sessionStorage.removeItem(STORAGE_PAGE_KEY);
    sessionStorage.removeItem(STORAGE_ROWS_KEY);
    sessionStorage.removeItem(STORAGE_VIEW_KEY);
    sessionStorage.removeItem(STORAGE_FECHA_INICIO_KEY);
    sessionStorage.removeItem(STORAGE_FECHA_FIN_KEY);
    sessionStorage.removeItem(STORAGE_BUSQUEDA_KEY);
    sessionStorage.removeItem(STORAGE_ESTADO_KEY);
    sessionStorage.removeItem(STORAGE_ALERTA_KEY);
  };

  // Nota: la descarga de PDFs desde el panel de laboratorio se ha deshabilitado
  // porque la generación devolvía datos inconsistentes en algunos casos. Las
  // descargas deben realizarse desde los módulos de Administración/Recepción.

  if ((!initialLoaded && loading) || examenesDisponibles.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="flex items-center gap-3 text-purple-600">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
          <span>Cargando órdenes de laboratorio...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return <div className="p-4 text-red-600 bg-red-50 rounded-lg border border-red-200">{error}</div>;
  }

  return (
    <div className="p-4">
      {/* Filtros avanzados */}
      <div className={`mb-3 flex flex-wrap items-start justify-center gap-4 rounded-xl border p-2.5 ${resumenAlertas.vencido > 0 ? 'border-red-200 bg-red-50/70' : 'border-white/20 bg-white/70'}`}>
        <div className="text-center">
          <button
            type="button"
            title="Filtrar vencidos"
            onClick={() => { setFiltroAlertaEstado(prev => prev === 'vencido' ? '' : 'vencido'); setPage(0); }}
            className={`h-10 w-10 rounded-full text-white text-sm font-bold shadow transition-transform hover:-translate-y-0.5 ${filtroAlertaEstado === 'vencido' ? 'ring-4 ring-blue-200' : ''} ${resumenAlertas.vencido > 0 ? 'animate-pulse' : ''} bg-red-500`}
          >
            {resumenAlertas.vencido}
          </button>
          <div className="mt-1 text-xs text-gray-600">Vencidos</div>
        </div>

        <div className="text-center">
          <button
            type="button"
            title="Filtrar por vencer"
            onClick={() => { setFiltroAlertaEstado(prev => prev === 'por_vencer' ? '' : 'por_vencer'); setPage(0); }}
            className={`h-10 w-10 rounded-full text-white text-sm font-bold shadow transition-transform hover:-translate-y-0.5 ${filtroAlertaEstado === 'por_vencer' ? 'ring-4 ring-blue-200' : ''} bg-orange-500`}
          >
            {resumenAlertas.por_vencer}
          </button>
          <div className="mt-1 text-xs text-gray-600">Por vencer</div>
        </div>

        <div className="text-center">
          <button
            type="button"
            title="Filtrar en tiempo"
            onClick={() => { setFiltroAlertaEstado(prev => prev === 'en_tiempo' ? '' : 'en_tiempo'); setPage(0); }}
            className={`h-10 w-10 rounded-full text-white text-sm font-bold shadow transition-transform hover:-translate-y-0.5 ${filtroAlertaEstado === 'en_tiempo' ? 'ring-4 ring-blue-200' : ''} bg-emerald-600`}
          >
            {resumenAlertas.en_tiempo}
          </button>
          <div className="mt-1 text-xs text-gray-600">En tiempo</div>
        </div>
      </div>

      <div className="bg-white/80 backdrop-blur-sm rounded-xl shadow-lg border border-white/20 p-3 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Desde</label>
            <input
              type="date"
              value={fechaInicio}
              onChange={e => { setFechaInicio(e.target.value); setPage(0); }}
              className="w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Hasta</label>
            <input
              type="date"
              value={fechaFin}
              onChange={e => { setFechaFin(e.target.value); setPage(0); }}
              className="w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Buscar</label>
            <input
              type="text"
              value={busqueda}
              onChange={e => { setBusqueda(e.target.value); setPage(0); }}
              placeholder="Paciente o médico..."
              className="w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
            {(busqueda !== busquedaDebounced || (loading && initialLoaded)) && (
              <p className="mt-1 text-xs text-purple-600">Buscando...</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
            <select
              value={estadoFiltro}
              onChange={e => { setEstadoFiltro(e.target.value); setPage(0); }}
              className="w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              <option value="">Todos</option>
              <option value="pendiente">Pendiente</option>
              <option value="completado">Completado</option>
              <option value="cancelada">Cancelada</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Por página</label>
            <select
              value={rowsPerPage}
              onChange={e => { setRowsPerPage(Number(e.target.value)); setPage(0); }}
              className="w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              <option value={3}>3</option>
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>
        {(filtroAlertaEstado || fechaInicio || fechaFin || busqueda.trim() || estadoFiltro || rowsPerPage !== 3 || pageSafe > 0 || viewMode !== 'table') && (
          <div className="mt-3 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleResetFiltros}
              className="text-xs px-3 py-1.5 rounded-lg border border-purple-300 text-purple-700 hover:bg-purple-50"
            >
              Restablecer filtros
            </button>

            <button
              type="button"
              onClick={() => { setFiltroAlertaEstado(''); setPage(0); }}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100"
            >
              Limpiar filtro de alarma
            </button>
          </div>
        )}
      </div>

      {/* Controles de vista y paginación */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">Vista:</span>
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-1 rounded-md text-sm transition-colors ${
                viewMode === 'table' 
                  ? 'bg-white text-purple-600 shadow-sm' 
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              📊 Tabla
            </button>
            <button
              onClick={() => setViewMode('cards')}
              className={`px-3 py-1 rounded-md text-sm transition-colors ${
                viewMode === 'cards' 
                  ? 'bg-white text-purple-600 shadow-sm' 
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              🗃️ Tarjetas
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">
            Mostrando {paginated.length} de {totalOrdenes} órdenes
          </span>
          <div className="flex items-center gap-1 flex-wrap justify-end">
            <button
              disabled={pageSafe === 0}
              onClick={() => setPage(p => Math.max(0, p - 1))}
              className="px-3 py-1 rounded-lg bg-gray-100 disabled:opacity-50 hover:bg-gray-200 transition-colors"
              title="Página anterior"
            >
              ←
            </button>

            {pageWindow[0] > 0 && (
              <>
                <button
                  onClick={() => setPage(0)}
                  className="px-3 py-1 rounded-lg text-sm bg-gray-100 hover:bg-gray-200 transition-colors"
                >
                  1
                </button>
                {pageWindow[0] > 1 && <span className="px-1 text-gray-500">…</span>}
              </>
            )}

            {pageWindow.map((pageIndex) => (
              <button
                key={pageIndex}
                onClick={() => setPage(pageIndex)}
                className={`px-3 py-1 rounded-lg text-sm transition-colors ${
                  pageIndex === pageSafe
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                }`}
              >
                {pageIndex + 1}
              </button>
            ))}

            {pageWindow[pageWindow.length - 1] < totalPagesSafe - 1 && (
              <>
                {pageWindow[pageWindow.length - 1] < totalPagesSafe - 2 && <span className="px-1 text-gray-500">…</span>}
                <button
                  onClick={() => setPage(totalPagesSafe - 1)}
                  className="px-3 py-1 rounded-lg text-sm bg-gray-100 hover:bg-gray-200 transition-colors"
                >
                  {totalPagesSafe}
                </button>
              </>
            )}

            <span className="px-2 py-1 text-sm text-gray-600">
              {pageSafe + 1} / {totalPagesSafe}
            </span>

            <button
              disabled={pageSafe >= totalPagesSafe - 1}
              onClick={() => setPage(p => Math.min(totalPagesSafe - 1, p + 1))}
              className="px-3 py-1 rounded-lg bg-gray-100 disabled:opacity-50 hover:bg-gray-200 transition-colors"
              title="Página siguiente"
            >
              →
            </button>
          </div>
        </div>
      </div>
      {/* Contenido principal */}
      {totalOrdenes === 0 ? (
        <div className="bg-white/80 backdrop-blur-sm rounded-xl shadow-lg border border-white/20 p-8 text-center">
          <div className="text-6xl mb-4">🔍</div>
          <p className="text-gray-600 text-lg">No se encontraron órdenes con los filtros aplicados</p>
        </div>
      ) : (
        <>
          {/* Vista de tabla */}
          {viewMode === 'table' && (
            <div className="bg-white/80 backdrop-blur-sm rounded-xl shadow-lg border border-white/20 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gradient-to-r from-purple-500 to-indigo-500 text-white">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium">ID</th>
                      <th className="px-4 py-3 text-left text-sm font-medium">Paciente</th>
                      <th className="px-4 py-3 text-left text-sm font-medium">Tipo de Cotización</th>
                      <th className="px-4 py-3 text-left text-sm font-medium hidden md:table-cell">Médico</th>
                      <th className="px-4 py-3 text-left text-sm font-medium hidden lg:table-cell">Consulta</th>
                      <th className="px-4 py-3 text-left text-sm font-medium hidden lg:table-cell">Fecha</th>
                      <th className="px-4 py-3 text-left text-sm font-medium">Estado</th>
                      <th className="px-4 py-3 text-left text-sm font-medium">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.map(orden => (
                      (() => {
                        const consultaIdVisual = Number(orden.consulta_id || orden.consulta_id_ref || 0);
                        const medicoNombre = String(orden.medico_nombre || '').trim();
                        const medicoApellido = String(orden.medico_apellido || '').trim();
                        const medicoTexto = `${medicoNombre} ${medicoApellido}`.trim() || '-';
                        return (
                      <tr key={orden.id} className="border-b border-gray-100 hover:bg-purple-50/50 transition-colors">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">#{orden.id}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          <div className="font-medium">{orden.paciente_nombre} {orden.paciente_apellido}</div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {consultaIdVisual > 0 ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">
                              Médico
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-pink-100 text-pink-800 border border-pink-200">
                              Particular
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 hidden md:table-cell">{medicoTexto}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 hidden lg:table-cell">{consultaIdVisual > 0 ? consultaIdVisual : '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 hidden lg:table-cell">{formatFecha(orden.fecha)}</td>
                        <td className="px-4 py-3">
                          {(() => {
                            const estadoVisual = orden.estado_visual || orden.estado;
                            const porcentaje = Number(orden.progreso_porcentaje || 0);
                            const analisisTotales = Number(orden.analisis_totales || 0);
                            const analisisCompletos = Number(orden.analisis_completos || 0);
                            return (
                          <div className="flex flex-col gap-1">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            estadoVisual === 'completado'
                              ? 'bg-green-100 text-green-800'
                              : estadoVisual === 'cancelada'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}>
                            {estadoVisual === 'completado' ? '✅ Completado' : estadoVisual === 'cancelada' ? '⛔ Cancelada' : `⏳ Pendiente (${porcentaje}%)`}
                            </span>
                            {estadoVisual !== 'cancelada' && analisisTotales > 0 && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border border-purple-200 bg-purple-50 text-purple-700">
                                📊 {analisisCompletos}/{analisisTotales} parámetros
                              </span>
                            )}
                            {Number(orden.alerta_total || 0) > 0 && (
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                                orden.alerta_estado === 'vencido'
                                  ? 'bg-red-100 text-red-800 border-red-200'
                                  : orden.alerta_estado === 'por_vencer'
                                  ? 'bg-orange-100 text-orange-800 border-orange-200'
                                  : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                              }`}>
                                {orden.alerta_estado === 'vencido'
                                  ? `🚨 Vencido (${Number(orden.alerta_vencido || 0)})`
                                  : orden.alerta_estado === 'por_vencer'
                                  ? `🔔 Por vencer (${Number(orden.alerta_por_vencer || 0)})`
                                  : `✅ En tiempo (${Number(orden.alerta_en_tiempo || 0)})`}
                              </span>
                            )}
                          </div>
                            );
                          })()}
                        </td>
                        <td className="px-4 py-3">
                          {(() => {
                            const estadoVisual = orden.estado_visual || orden.estado;
                            const porcentaje = Number(orden.progreso_porcentaje || 0);
                            const enProceso = estadoVisual !== 'cancelada' && porcentaje > 0 && porcentaje < 100;
                            return (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => onSeleccionarOrden(orden)}
                              className="inline-flex items-center px-3 py-1.5 text-white text-xs font-medium rounded-lg transition-all shadow-md bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 transform hover:scale-105"
                              title={estadoVisual === 'completado' ? 'Editar resultado' : enProceso ? 'Continuar llenado' : 'Llenar resultados'}
                            >
                              {estadoVisual === 'completado' ? '✏️ Editar' : enProceso ? '🧩 Continuar' : '📝 Procesar'}
                            </button>
                            <button
                              onClick={() => handleCompararResultados(orden)}
                              disabled={!Number(orden?.paciente_id_ref || orden?.paciente_id || 0)}
                              className={`inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                                Number(orden?.paciente_id_ref || orden?.paciente_id || 0)
                                  ? 'bg-white text-indigo-700 border-indigo-200 hover:bg-indigo-50'
                                  : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                              }`}
                              title="Comparar resultados anteriores"
                            >
                              📈 Comparar
                            </button>
                          </div>
                            );
                          })()}
                        </td>
                      </tr>
                        );
                      })()
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Vista de tarjetas */}
          {viewMode === 'cards' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {paginated.map(orden => (
                (() => {
                  const consultaIdVisual = Number(orden.consulta_id || orden.consulta_id_ref || 0);
                  const medicoNombre = String(orden.medico_nombre || '').trim();
                  const medicoApellido = String(orden.medico_apellido || '').trim();
                  const medicoTexto = `${medicoNombre} ${medicoApellido}`.trim() || '-';
                  return (
                <div key={orden.id} className="bg-white/80 backdrop-blur-sm rounded-xl shadow-lg border border-white/20 p-6 hover:shadow-xl transition-all transform hover:scale-105">
                  {(() => {
                    const estadoVisual = orden.estado_visual || orden.estado;
                    const porcentaje = Number(orden.progreso_porcentaje || 0);
                    const analisisTotales = Number(orden.analisis_totales || 0);
                    const analisisCompletos = Number(orden.analisis_completos || 0);
                    const enProceso = estadoVisual !== 'cancelada' && porcentaje > 0 && porcentaje < 100;
                    return (
                  <>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center text-purple-600">
                        🧪
                      </div>
                      <span className="font-bold text-gray-900">#{orden.id}</span>
                    </div>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      estadoVisual === 'completado'
                        ? 'bg-green-100 text-green-800'
                        : estadoVisual === 'cancelada'
                        ? 'bg-red-100 text-red-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}>
                      {estadoVisual === 'completado' ? '✅' : estadoVisual === 'cancelada' ? '⛔' : `${porcentaje}%`}
                    </span>
                  </div>

                  {estadoVisual !== 'cancelada' && analisisTotales > 0 && (
                    <div className="mb-3 text-xs text-purple-700 bg-purple-50 border border-purple-200 rounded-lg px-2.5 py-1.5 font-medium">
                      📊 Avance: {analisisCompletos}/{analisisTotales} parámetros ({porcentaje}%)
                    </div>
                  )}

                  {Number(orden.alerta_total || 0) > 0 && (
                    <div className="mb-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                        orden.alerta_estado === 'vencido'
                          ? 'bg-red-100 text-red-800 border-red-200'
                          : orden.alerta_estado === 'por_vencer'
                          ? 'bg-orange-100 text-orange-800 border-orange-200'
                          : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                      }`}>
                        {orden.alerta_estado === 'vencido'
                          ? `🚨 Vencido (${Number(orden.alerta_vencido || 0)})`
                          : orden.alerta_estado === 'por_vencer'
                          ? `🔔 Por vencer (${Number(orden.alerta_por_vencer || 0)})`
                          : `✅ En tiempo (${Number(orden.alerta_en_tiempo || 0)})`}
                      </span>
                    </div>
                  )}

                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Paciente</p>
                      <p className="font-semibold text-gray-900">{orden.paciente_nombre} {orden.paciente_apellido}</p>
                    </div>
                    
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Médico</p>
                      <p className="text-sm text-gray-700">{medicoTexto}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide">Consulta</p>
                        <p className="text-sm text-gray-700">{consultaIdVisual > 0 ? consultaIdVisual : '-'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide">Fecha</p>
                        <p className="text-sm text-gray-700">{formatFecha(orden.fecha)}</p>
                      </div>
                    </div>

                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Exámenes</p>
                      <p className="text-sm text-gray-700 line-clamp-2">{getExamenesNombres(orden.examenes)}</p>
                    </div>
                  </div>

                  <div className="mt-6 pt-4 border-t border-gray-200">
                    <div className="flex gap-3">
                      <button
                        onClick={() => onSeleccionarOrden(orden)}
                        className="flex-1 text-white py-2.5 px-4 rounded-lg transition-all font-medium text-sm shadow-md bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 hover:shadow-lg transform hover:scale-105"
                      >
                        {estadoVisual === 'completado' ? '✏️ Editar Resultado' : enProceso ? '🧩 Continuar Orden' : '📝 Procesar Orden'}
                      </button>
                      <button
                        onClick={() => handleCompararResultados(orden)}
                        disabled={!Number(orden?.paciente_id_ref || orden?.paciente_id || 0)}
                        className={`text-xs font-medium px-3 rounded-lg border ${
                          Number(orden?.paciente_id_ref || orden?.paciente_id || 0)
                            ? 'bg-white text-indigo-700 border-indigo-200 hover:bg-indigo-50'
                            : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                        }`}
                        title="Comparar resultados anteriores"
                      >
                        📈 Comparar
                      </button>
                    </div>
                  </div>
                  </>
                    );
                  })()}
                </div>
                  );
                })()
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default OrdenesLaboratorioList;
