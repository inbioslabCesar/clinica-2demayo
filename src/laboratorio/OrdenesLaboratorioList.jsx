import { useEffect, useState } from "react";
import { BASE_URL } from "../config/config";

function OrdenesLaboratorioList({ onSeleccionarOrden }) {
  const [viewMode, setViewMode] = useState('table');
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [page, setPage] = useState(0);
  const [ordenes, setOrdenes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [examenesDisponibles, setExamenesDisponibles] = useState([]);
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState("");

  useEffect(() => {
    setLoading(true);
    fetch(BASE_URL + "api_ordenes_laboratorio.php", {
      credentials: 'include'
    })
      .then(res => res.json())
      .then(data => {
        console.log('Órdenes recibidas:', data);
        if (data.success) setOrdenes(data.ordenes);
        else setError(data.error || "Error al cargar órdenes");
        setLoading(false);
      })
      .catch((err) => {
        setError("Error de conexión con el servidor");
        setLoading(false);
        console.error('Error al cargar órdenes:', err);
      });
    
    // Cargar lista de exámenes disponibles para mapear IDs a nombres
    fetch(BASE_URL + "api_examenes_laboratorio.php", {
      credentials: 'include'
    })
      .then(res => res.json())
      .then(data => {
        setExamenesDisponibles(data.examenes || []);
        console.log('Exámenes disponibles:', data.examenes);
      });
  }, []);

  if (loading || examenesDisponibles.length === 0) return (
    <div className="flex items-center justify-center p-8">
      <div className="flex items-center gap-3 text-purple-600">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
        <span>Cargando órdenes de laboratorio...</span>
      </div>
    </div>
  );
  if (error) return <div className="p-4 text-red-600 bg-red-50 rounded-lg border border-red-200">{error}</div>;

  // Filtrado avanzado
  const filtrarOrdenes = (lista) => {
    return lista.filter(orden => {
      // Filtrar por fecha
      if ((fechaInicio || fechaFin) && orden.fecha) {
        const fechaOrden = new Date(orden.fecha);
        const desde = fechaInicio ? new Date(fechaInicio) : null;
        const hasta = fechaFin ? new Date(fechaFin) : null;
        if (desde && fechaOrden < desde) return false;
        if (hasta && fechaOrden > new Date(hasta + 'T23:59:59')) return false;
      }
      // Filtrar por búsqueda general
      if (busqueda.trim() !== "") {
        const texto = busqueda.toLowerCase();
        const paciente = (orden.paciente_nombre + ' ' + orden.paciente_apellido).toLowerCase();
        const medico = (orden.medico_nombre || '').toLowerCase();
        if (!paciente.includes(texto) && !medico.includes(texto)) return false;
      }
      // Filtrar por estado
      if (estadoFiltro && orden.estado !== estadoFiltro) return false;
      return true;
    });
  };

  const ordenesFiltradas = filtrarOrdenes(ordenes);
  
  // Calcular estadísticas
  const stats = {
    total: ordenes.length,
    pendientes: ordenes.filter(o => o.estado === 'pendiente').length,
    completadas: ordenes.filter(o => o.estado === 'completado').length,
    hoy: ordenes.filter(o => {
      if (!o.fecha) return false;
      const fechaOrden = new Date(o.fecha).toDateString();
      const hoy = new Date().toDateString();
      return fechaOrden === hoy;
    }).length
  };

  // Paginación
  const totalPages = Math.ceil(ordenesFiltradas.length / rowsPerPage);
  const paginated = ordenesFiltradas.slice(page * rowsPerPage, (page + 1) * rowsPerPage);

  const getExamenesNombres = (examenes) => {
    if (!Array.isArray(examenes)) return "";
    return examenes.map(ex => {
      const exObj = examenesDisponibles.find(e => e.id == ex);
      return exObj ? exObj.nombre : ex;
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

  // Nota: la descarga de PDFs desde el panel de laboratorio se ha deshabilitado
  // porque la generación devolvía datos inconsistentes en algunos casos. Las
  // descargas deben realizarse desde los módulos de Administración/Recepción.

  return (
    <div className="p-6">
      {/* Estadísticas Dashboard */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-gradient-to-r from-purple-500 to-indigo-500 rounded-xl p-4 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-purple-100 text-sm">Total Órdenes</p>
              <p className="text-2xl font-bold">{stats.total}</p>
            </div>
            <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center text-xl">
              📋
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-r from-amber-500 to-orange-500 rounded-xl p-4 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-amber-100 text-sm">Pendientes</p>
              <p className="text-2xl font-bold">{stats.pendientes}</p>
            </div>
            <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center text-xl">
              ⏳
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-r from-emerald-500 to-green-500 rounded-xl p-4 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-emerald-100 text-sm">Completadas</p>
              <p className="text-2xl font-bold">{stats.completadas}</p>
            </div>
            <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center text-xl">
              ✅
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl p-4 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100 text-sm">Hoy</p>
              <p className="text-2xl font-bold">{stats.hoy}</p>
            </div>
            <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center text-xl">
              📅
            </div>
          </div>
        </div>
      </div>

      {/* Filtros avanzados */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl shadow-lg border border-white/20 p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Desde</label>
            <input
              type="date"
              value={fechaInicio}
              onChange={e => { setFechaInicio(e.target.value); setPage(0); }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Hasta</label>
            <input
              type="date"
              value={fechaFin}
              onChange={e => { setFechaFin(e.target.value); setPage(0); }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Buscar</label>
            <input
              type="text"
              value={busqueda}
              onChange={e => { setBusqueda(e.target.value); setPage(0); }}
              placeholder="Paciente o médico..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
            <select
              value={estadoFiltro}
              onChange={e => { setEstadoFiltro(e.target.value); setPage(0); }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              <option value="">Todos</option>
              <option value="pendiente">Pendiente</option>
              <option value="completado">Completado</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Por página</label>
            <select
              value={rowsPerPage}
              onChange={e => { setRowsPerPage(Number(e.target.value)); setPage(0); }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>
      </div>

      {/* Controles de vista y paginación */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-4">
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
            Mostrando {paginated.length} de {ordenesFiltradas.length} órdenes
          </span>
          <div className="flex items-center gap-1">
            <button
              disabled={page === 0}
              onClick={() => setPage(p => Math.max(0, p - 1))}
              className="px-3 py-1 rounded-lg bg-gray-100 disabled:opacity-50 hover:bg-gray-200 transition-colors"
            >
              ←
            </button>
            <span className="px-3 py-1 text-sm">
              {page + 1} / {totalPages || 1}
            </span>
            <button
              disabled={page >= totalPages - 1}
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              className="px-3 py-1 rounded-lg bg-gray-100 disabled:opacity-50 hover:bg-gray-200 transition-colors"
            >
              →
            </button>
          </div>
        </div>
      </div>
      {/* Contenido principal */}
      {ordenesFiltradas.length === 0 ? (
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
                      <tr key={orden.id} className="border-b border-gray-100 hover:bg-purple-50/50 transition-colors">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">#{orden.id}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          <div className="font-medium">{orden.paciente_nombre} {orden.paciente_apellido}</div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {orden.consulta_id ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">
                              Médico
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-pink-100 text-pink-800 border border-pink-200">
                              Particular
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 hidden md:table-cell">{orden.medico_nombre}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 hidden lg:table-cell">{orden.consulta_id}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 hidden lg:table-cell">{formatFecha(orden.fecha)}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            orden.estado === 'completado'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}>
                            {orden.estado === 'completado' ? '✅ Completado' : '⏳ Pendiente'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => onSeleccionarOrden(orden)}
                              className="inline-flex items-center px-3 py-1.5 bg-gradient-to-r from-purple-500 to-indigo-500 text-white text-xs font-medium rounded-lg hover:from-purple-600 hover:to-indigo-600 transition-all transform hover:scale-105 shadow-md"
                              title={orden.estado === 'completado' ? 'Editar resultado' : 'Llenar resultados'}
                            >
                              {orden.estado === 'completado' ? '✏️ Editar' : '📝 Procesar'}
                            </button>
                            {/* PDF eliminado desde la vista de laboratorio */}
                          </div>
                        </td>
                      </tr>
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
                <div key={orden.id} className="bg-white/80 backdrop-blur-sm rounded-xl shadow-lg border border-white/20 p-6 hover:shadow-xl transition-all transform hover:scale-105">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center text-purple-600">
                        🧪
                      </div>
                      <span className="font-bold text-gray-900">#{orden.id}</span>
                    </div>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      orden.estado === 'completado'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}>
                      {orden.estado === 'completado' ? '✅' : '⏳'}
                    </span>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Paciente</p>
                      <p className="font-semibold text-gray-900">{orden.paciente_nombre} {orden.paciente_apellido}</p>
                    </div>
                    
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Médico</p>
                      <p className="text-sm text-gray-700">{orden.medico_nombre || 'N/A'}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide">Consulta</p>
                        <p className="text-sm text-gray-700">{orden.consulta_id}</p>
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
                        className="flex-1 bg-gradient-to-r from-purple-500 to-indigo-500 text-white py-2.5 px-4 rounded-lg hover:from-purple-600 hover:to-indigo-600 transition-all font-medium text-sm shadow-md hover:shadow-lg transform hover:scale-105"
                      >
                        {orden.estado === 'completado' ? '✏️ Editar Resultado' : '📝 Procesar Orden'}
                      </button>
                      {/* Botón de descarga eliminado en panel de laboratorio */}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default OrdenesLaboratorioList;
