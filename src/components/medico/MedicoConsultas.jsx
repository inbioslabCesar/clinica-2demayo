import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BASE_URL } from "../../config/config";

function MedicoConsultas({ medicoId, onIniciarConsulta, onVerDetalle }) {
  const navigate = useNavigate();
  const [consultas, setConsultas] = useState([]);
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(5);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  
  // Buscador dinámico
  const [busqueda, setBusqueda] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");

  useEffect(() => {
    if (!medicoId) return;
    setLoading(true);
    fetch(`${BASE_URL}api_consultas.php?medico_id=${medicoId}`, { credentials: "include" })
      .then(r => r.json())
      .then(data => { 
        setConsultas(data.consultas || []);
        setLoading(false);
      })
      .catch(error => {
        console.error("Error cargando consultas:", error);
        setLoading(false);
      });
  }, [medicoId]);

  const actualizarEstado = async (id, estado) => {
    setMsg("");
    setLoading(true);
    try {
      await fetch(BASE_URL + "api_consultas.php", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id, estado })
      });
      
      // Refrescar lista
      const response = await fetch(`${BASE_URL}api_consultas.php?medico_id=${medicoId}`, { credentials: "include" });
      const data = await response.json();
      setConsultas(data.consultas || []);
      setMsg(`Consulta ${estado} correctamente`);
    } catch (error) {
      console.error("Error actualizando estado:", error);
      setMsg("Error al actualizar el estado");
    } finally {
      setLoading(false);
    }
  };


  // Filtrar por búsqueda y fechas
  const consultasFiltradas = consultas.filter(c => {
    // Filtro de búsqueda
    const texto = busqueda.trim().toLowerCase();
    if (texto) {
      const match = (c.paciente_nombre && c.paciente_nombre.toLowerCase().includes(texto)) ||
                   (c.paciente_apellido && c.paciente_apellido.toLowerCase().includes(texto)) ||
                   (c.historia_clinica && c.historia_clinica.toLowerCase().includes(texto)) ||
                   (c.dni && c.dni.toLowerCase().includes(texto));
      if (!match) return false;
    }
    // Filtro de fechas
    if (!fechaDesde && !fechaHasta) return true;
    if (!c.fecha) return false;
    if (fechaDesde && c.fecha < fechaDesde) return false;
    if (fechaHasta && c.fecha > fechaHasta) return false;
    return true;
  })
  // Ordenar por fecha y hora descendente (última consulta primero)
  .sort((a, b) => {
    // Combinar fecha y hora para comparar
    const fechaA = a.fecha ? new Date(a.fecha + 'T' + (a.hora || '00:00')) : new Date(0);
    const fechaB = b.fecha ? new Date(b.fecha + 'T' + (b.hora || '00:00')) : new Date(0);
    return fechaB - fechaA;
  });

  // Calcular datos paginados
  const totalRows = consultasFiltradas.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage));
  const consultasPaginadas = consultasFiltradas.slice((page - 1) * rowsPerPage, page * rowsPerPage);

  // Funciones de paginación
  const handleRowsPerPage = (e) => {
    setRowsPerPage(Number(e.target.value));
    setPage(1);
  };
  const handlePrev = () => setPage((p) => Math.max(1, p - 1));
  const handleNext = () => setPage((p) => Math.min(totalPages, p + 1));

  // Función para formatear fecha
  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    try {
      return new Date(dateStr).toLocaleDateString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  // Funciones para colores y iconos de estado
  const getEstadoColor = (estado) => {
    switch (estado?.toLowerCase()) {
      case 'pendiente':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'completada':
      case 'completado':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'cancelada':
      case 'cancelado':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'en_proceso':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getEstadoIcon = (estado) => {
    switch (estado?.toLowerCase()) {
      case 'pendiente':
        return '⏳ ';
      case 'completada':
      case 'completado':
        return '✅ ';
      case 'cancelada':
      case 'cancelado':
        return '❌ ';
      case 'en_proceso':
        return '🔄 ';
      default:
        return '📋 ';
    }
  };

  const getClasificacionColor = (clasificacion) => {
    switch (clasificacion?.toLowerCase()) {
      case 'emergencia':
        return 'bg-red-100 text-red-800 border-red-200 animate-pulse';
      case 'urgente':
      case 'urgencia':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'no urgente':
      case 'normal':
        return 'bg-green-100 text-green-800 border-green-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getClasificacionIcon = (clasificacion) => {
    switch (clasificacion?.toLowerCase()) {
      case 'emergencia':
        return '🚨 ';
      case 'urgente':
      case 'urgencia':
        return '⚠️ ';
      case 'no urgente':
      case 'normal':
        return '🟢 ';
      default:
        return '⚪ ';
    }
  };

  return (
    <div className="w-full px-2 sm:px-4 lg:max-w-7xl lg:mx-auto">
      {/* Panel de filtros con estilo moderno */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl sm:rounded-2xl shadow-xl p-3 sm:p-6 mb-4 sm:mb-8 border border-white/50">
        <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
          <div className="w-6 h-6 sm:w-8 sm:h-8 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full flex items-center justify-center">
            <svg className="w-3 h-3 sm:w-5 sm:h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <h3 className="text-base sm:text-lg font-semibold text-gray-800">🔍 Filtros</h3>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* Búsqueda general */}
          <div className="col-span-full lg:col-span-2">
            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">Búsqueda general</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-2 sm:pl-3 flex items-center pointer-events-none">
                <svg className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <input
                type="text"
                value={busqueda}
                onChange={e => { setBusqueda(e.target.value); setPage(1); }}
                placeholder="Buscar por nombre, HC o DNI..."
                className="pl-8 sm:pl-10 w-full px-3 sm:px-4 py-2 sm:py-3 text-sm border border-gray-300 rounded-lg sm:rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-white/80"
              />
            </div>
          </div>
          
          {/* Fecha desde */}
          <div>
            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">📅 Desde</label>
            <input
              type="date"
              value={fechaDesde}
              onChange={e => { setFechaDesde(e.target.value); setPage(1); }}
              className="w-full px-3 sm:px-4 py-2 sm:py-3 text-sm border border-gray-300 rounded-lg sm:rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-white/80"
            />
          </div>
          
          {/* Fecha hasta */}
          <div>
            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">📅 Hasta</label>
            <input
              type="date"
              value={fechaHasta}
              onChange={e => { setFechaHasta(e.target.value); setPage(1); }}
              className="w-full px-3 sm:px-4 py-2 sm:py-3 text-sm border border-gray-300 rounded-lg sm:rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-white/80"
            />
          </div>
        </div>
        
        {/* Botón limpiar filtros */}
        {(busqueda || fechaDesde || fechaHasta) && (
          <div className="mt-3 sm:mt-4 flex justify-center sm:justify-end">
            <button 
              onClick={() => { setBusqueda(""); setFechaDesde(""); setFechaHasta(""); setPage(1); }}
              className="inline-flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-all duration-200 hover:scale-105 text-sm"
            >
              <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Limpiar Filtros
            </button>
          </div>
        )}
      </div>

      {/* Estadísticas rápidas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-6 mb-4 sm:mb-8">
        <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl sm:rounded-2xl p-4 sm:p-6 text-white shadow-xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100 text-xs sm:text-sm font-medium">Total Consultas</p>
              <p className="text-2xl sm:text-3xl font-bold">{consultasFiltradas.length}</p>
            </div>
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white/20 rounded-lg sm:rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
          </div>
        </div>
        
        <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-xl sm:rounded-2xl p-4 sm:p-6 text-white shadow-xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-green-100 text-xs sm:text-sm font-medium">Pendientes</p>
              <p className="text-2xl sm:text-3xl font-bold">{consultasFiltradas.filter(c => c.estado === 'pendiente').length}</p>
            </div>
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white/20 rounded-lg sm:rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>
        
        <div className="bg-gradient-to-r from-red-500 to-red-600 rounded-xl sm:rounded-2xl p-4 sm:p-6 text-white shadow-xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-red-100 text-xs sm:text-sm font-medium">Emergencias</p>
              <p className="text-2xl sm:text-3xl font-bold">{consultasFiltradas.filter(c => c.clasificacion === 'Emergencia').length}</p>
            </div>
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white/20 rounded-lg sm:rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Lista de consultas moderna - Responsive */}
      {loading ? (
        <div className="bg-white/80 backdrop-blur-sm rounded-xl sm:rounded-2xl shadow-xl p-8 sm:p-12 border border-white/50 flex justify-center">
          <div className="flex flex-col items-center gap-3 sm:gap-4">
            <div className="w-12 h-12 sm:w-16 sm:h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-gray-600 font-medium text-sm sm:text-base">🏥 Cargando consultas médicas...</p>
          </div>
        </div>
      ) : consultasPaginadas.length === 0 ? (
        <div className="bg-white/80 backdrop-blur-sm rounded-xl sm:rounded-2xl shadow-xl p-8 sm:p-12 border border-white/50 text-center">
          <div className="flex flex-col items-center gap-3 sm:gap-4">
            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-r from-gray-300 to-gray-400 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 sm:w-10 sm:h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg sm:text-xl font-semibold text-gray-700 mb-2">📅 No hay consultas</h3>
              <p className="text-gray-500 text-sm sm:text-base">No se encontraron consultas con los filtros aplicados</p>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Vista Desktop - Tabla */}
          <div className="hidden lg:block bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/50 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gradient-to-r from-blue-600 to-indigo-600">
                  <tr>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-white">👤 Paciente</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-white">🏥 HC / DNI</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-white">📅 Fecha</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-white">⏰ Hora</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-white">📊 Estado</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-white">🚨 Clasificación</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-white">🩺 Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {consultasPaginadas.map((consulta, index) => {
                    const esFilaPar = index % 2 === 0;
                    
                    return (
                      <tr
                        key={consulta.id}
                        className={`${
                          esFilaPar ? 'bg-white/60' : 'bg-blue-50/40'
                        } hover:bg-blue-100/60 transition-all duration-200 hover:shadow-lg transform hover:-translate-y-0.5`}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center">
                              <span className="text-white font-semibold text-sm">
                                {((consulta.paciente_nombre || '') + (consulta.paciente_apellido || '')).charAt(0) || 'P'}
                              </span>
                            </div>
                            <div>
                              <div className="font-semibold text-gray-900">
                                {consulta.paciente_nombre ? `${consulta.paciente_nombre} ${consulta.paciente_apellido || ''}`.trim() : `Paciente #${consulta.paciente_id}`}
                              </div>
                              <div className="text-sm text-gray-500">Consulta médica</div>
                            </div>
                          </div>
                        </td>
                        
                        <td className="px-6 py-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                HC: {consulta.historia_clinica || 'N/A'}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                DNI: {consulta.dni || 'N/A'}
                              </span>
                            </div>
                          </div>
                        </td>
                        
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <span className="font-medium text-gray-900">
                              {formatDate(consulta.fecha)}
                            </span>
                          </div>
                        </td>
                        
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span className="font-medium text-gray-900">
                              {consulta.hora || 'N/A'}
                            </span>
                          </div>
                        </td>
                        
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${getEstadoColor(consulta.estado)}`}>
                            {getEstadoIcon(consulta.estado)}
                            {consulta.estado || 'Sin estado'}
                          </span>
                        </td>
                        
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${getClasificacionColor(consulta.clasificacion)}`}>
                            {getClasificacionIcon(consulta.clasificacion)}
                            {consulta.clasificacion || 'Sin clasificar'}
                          </span>
                        </td>
                        
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            {/* Botones de acción desktop */}
                            {consulta.estado === 'pendiente' && !consulta.clasificacion && (
                              <>
                                <button
                                  onClick={() => actualizarEstado(consulta.id, 'completada')}
                                  className="inline-flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white rounded-lg font-medium transition-all duration-200 hover:scale-105 shadow-md"
                                  title="Completar consulta"
                                >
                                  <span className="text-sm">✔️</span>
                                </button>
                                <button
                                  onClick={() => actualizarEstado(consulta.id, 'cancelada')}
                                  className="inline-flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white rounded-lg font-medium transition-all duration-200 hover:scale-105 shadow-md"
                                  title="Cancelar consulta"
                                >
                                  <span className="text-sm">✖️</span>
                                </button>
                              </>
                            )}
                            
                            <button
                              onClick={() => navigate(`/historia-clinica/${consulta.paciente_id}/${consulta.id}`)}
                              className="inline-flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-lg font-medium transition-all duration-200 hover:scale-105 shadow-md"
                              title="Ver Historia Clínica"
                            >
                              <span className="text-sm">📖</span>
                            </button>
                            
                            {onIniciarConsulta && (
                              <button
                                onClick={() => onIniciarConsulta(consulta)}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white rounded-lg font-medium transition-all duration-200 hover:scale-105 shadow-md"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                                Iniciar
                              </button>
                            )}
                            
                            {onVerDetalle && (
                              <button
                                onClick={() => onVerDetalle(consulta)}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white rounded-lg font-medium transition-all duration-200 hover:scale-105 shadow-md"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                                Ver
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Vista Móvil - Tarjetas */}
          <div className="lg:hidden space-y-3 sm:space-y-4">
            {consultasPaginadas.map((consulta) => (
              <div
                key={consulta.id}
                className="bg-white/80 backdrop-blur-sm rounded-xl shadow-lg border border-white/50 p-4 hover:shadow-xl transition-all duration-200 hover:scale-[1.02]"
              >
                {/* Header de la tarjeta con paciente */}
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-white font-semibold text-lg">
                      {((consulta.paciente_nombre || '') + (consulta.paciente_apellido || '')).charAt(0) || 'P'}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 truncate">
                      {consulta.paciente_nombre ? `${consulta.paciente_nombre} ${consulta.paciente_apellido || ''}`.trim() : `Paciente #${consulta.paciente_id}`}
                    </h3>
                    <p className="text-sm text-gray-500">Consulta médica</p>
                  </div>
                </div>

                {/* Información en grid */}
                <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
                  <div>
                    <p className="text-gray-600 font-medium">📅 Fecha</p>
                    <p className="text-gray-900">{formatDate(consulta.fecha)}</p>
                  </div>
                  <div>
                    <p className="text-gray-600 font-medium">⏰ Hora</p>
                    <p className="text-gray-900">{consulta.hora || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-gray-600 font-medium">🏥 HC</p>
                    <p className="text-gray-900">{consulta.historia_clinica || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-gray-600 font-medium">👤 DNI</p>
                    <p className="text-gray-900">{consulta.dni || 'N/A'}</p>
                  </div>
                </div>

                {/* Estados */}
                <div className="flex flex-wrap gap-2 mb-4">
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${getEstadoColor(consulta.estado)}`}>
                    {getEstadoIcon(consulta.estado)}
                    {consulta.estado || 'Sin estado'}
                  </span>
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${getClasificacionColor(consulta.clasificacion)}`}>
                    {getClasificacionIcon(consulta.clasificacion)}
                    {consulta.clasificacion || 'Sin clasificar'}
                  </span>
                </div>

                {/* Botones de acción móvil */}
                <div className="flex flex-wrap gap-2">
                  {consulta.estado === 'pendiente' && !consulta.clasificacion && (
                    <>
                      <button
                        onClick={() => actualizarEstado(consulta.id, 'completada')}
                        className="flex-1 min-w-0 inline-flex items-center justify-center gap-1 px-3 py-2 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white rounded-lg font-medium transition-all duration-200 text-sm"
                      >
                        <span>✔️</span>
                        <span className="hidden sm:inline">Completar</span>
                      </button>
                      <button
                        onClick={() => actualizarEstado(consulta.id, 'cancelada')}
                        className="flex-1 min-w-0 inline-flex items-center justify-center gap-1 px-3 py-2 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white rounded-lg font-medium transition-all duration-200 text-sm"
                      >
                        <span>✖️</span>
                        <span className="hidden sm:inline">Cancelar</span>
                      </button>
                    </>
                  )}
                  
                  <button
                    onClick={() => navigate(`/historia-clinica/${consulta.paciente_id}/${consulta.id}`)}
                    className="flex-1 min-w-0 inline-flex items-center justify-center gap-1 px-3 py-2 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-lg font-medium transition-all duration-200 text-sm"
                  >
                    <span>📖</span>
                    <span className="hidden sm:inline">Historia</span>
                  </button>
                  
                  {onIniciarConsulta && (
                    <button
                      onClick={() => onIniciarConsulta(consulta)}
                      className="flex-1 min-w-0 inline-flex items-center justify-center gap-1 px-3 py-2 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white rounded-lg font-medium transition-all duration-200 text-sm"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      <span className="hidden sm:inline">Iniciar</span>
                    </button>
                  )}
                  
                  {onVerDetalle && (
                    <button
                      onClick={() => onVerDetalle(consulta)}
                      className="flex-1 min-w-0 inline-flex items-center justify-center gap-1 px-3 py-2 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white rounded-lg font-medium transition-all duration-200 text-sm"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                      <span className="hidden sm:inline">Ver</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Mensaje de estado */}
      {msg && (
        <div className="mt-3 sm:mt-4 p-3 sm:p-4 bg-blue-100 border border-blue-300 rounded-lg sm:rounded-xl text-blue-800 text-center text-sm sm:text-base">
          {msg}
        </div>
      )}

      {/* Paginación moderna responsive */}
      {consultasFiltradas.length > 0 && (
        <div className="mt-4 sm:mt-8 bg-white/80 backdrop-blur-sm rounded-xl sm:rounded-2xl shadow-xl p-4 sm:p-6 border border-white/50">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">
            {/* Controles de página */}
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                onClick={handlePrev}
                disabled={page === 1}
                className="inline-flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 bg-gradient-to-r from-gray-500 to-gray-600 hover:from-gray-600 hover:to-gray-700 text-white rounded-lg font-medium transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none text-sm"
              >
                <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                <span className="hidden sm:inline">Anterior</span>
              </button>
              
              <div className="flex items-center gap-1 sm:gap-2">
                <span className="text-gray-600 font-medium text-sm sm:text-base">
                  {page}/{totalPages}
                </span>
              </div>
              
              <button
                onClick={handleNext}
                disabled={page === totalPages}
                className="inline-flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 bg-gradient-to-r from-gray-500 to-gray-600 hover:from-gray-600 hover:to-gray-700 text-white rounded-lg font-medium transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none text-sm"
              >
                <span className="hidden sm:inline">Siguiente</span>
                <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
            
            {/* Selector de filas por página */}
            <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-3">
              <label className="text-xs sm:text-sm font-medium text-gray-700">
                📄 <span className="hidden sm:inline">Filas por página:</span><span className="sm:hidden">Por página:</span>
              </label>
              <select
                value={rowsPerPage}
                onChange={handleRowsPerPage}
                className="px-2 sm:px-3 py-1.5 sm:py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white/80"
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
              
              <span className="text-xs sm:text-sm text-gray-500 text-center sm:text-left">
                <span className="block sm:inline">{consultasPaginadas.length} de {totalRows}</span>
                <span className="hidden sm:inline"> consultas</span>
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MedicoConsultas;