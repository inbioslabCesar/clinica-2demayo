import React, { useEffect, useState } from "react";
import Spinner from "./Spinner";
import { useNavigate } from "react-router-dom";
import { BASE_URL } from "../config/config";

function MedicoConsultas({ medicoId }) {
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

  // Obtener la fecha de hoy en formato YYYY-MM-DD
    // Mostrar todas las consultas del médico

    useEffect(() => {
    if (!medicoId) return;
    setLoading(true);
    fetch(`${BASE_URL}api_consultas.php?medico_id=${medicoId}`, { credentials: "include" })
      .then(r => r.json())
      .then(data => { 
        console.log("Consultas recibidas:", data.consultas);
        setConsultas(data.consultas || []);
        setLoading(false);
      });
  }, [medicoId]);

  const actualizarEstado = async (id, estado) => {
    setMsg("");
    setLoading(true);
    await fetch(BASE_URL + "api_consultas.php", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ id, estado })
    });
    // Refrescar lista
    fetch(`${BASE_URL}api_consultas.php?medico_id=${medicoId}`, { credentials: "include" })
      .then(r => r.json())
      .then(data => { 
        setConsultas(data.consultas || []);
        setLoading(false);
      });
  };

  // Filtrar por búsqueda y fechas
  let consultasFiltradas = consultas.filter(c => {
    // Filtro de búsqueda (nombre, apellido, historia clínica, dni)
    const texto = busqueda.trim().toLowerCase();
    if (texto) {
      const match = (c.paciente_nombre && c.paciente_nombre.toLowerCase().includes(texto)) ||
                   (c.paciente_apellido && c.paciente_apellido.toLowerCase().includes(texto)) ||
                   (c.historia_clinica && c.historia_clinica.toLowerCase().includes(texto)) ||
                   (c.dni && c.dni.toLowerCase().includes(texto));
      if (!match) return false;
    }
    // Filtro de fechas (por campo fecha)
    if (!fechaDesde && !fechaHasta) return true;
    if (!c.fecha) return false;
    if (fechaDesde && c.fecha < fechaDesde) return false;
    if (fechaHasta && c.fecha > fechaHasta) return false;
    return true;
  });
  // Calcular datos paginados
  const totalRows = consultasFiltradas.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage));
  const pagedConsultas = consultasFiltradas.slice((page - 1) * rowsPerPage, page * rowsPerPage);

  // Cambiar página y filas por página
  const handleRowsPerPage = (e) => {
    setRowsPerPage(Number(e.target.value));
    setPage(1);
  };
  const handlePrev = () => setPage((p) => Math.max(1, p - 1));
  const handleNext = () => setPage((p) => Math.min(totalPages, p + 1));

  return (
    <div className="max-w-7xl mx-auto">
      {/* Panel de filtros con estilo moderno */}
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl p-6 mb-8 border border-white/50">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-800">🔍 Filtros de Búsqueda</h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Búsqueda general */}
          <div className="col-span-full lg:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">Búsqueda general</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <input
                type="text"
                value={busqueda}
                onChange={e => { setBusqueda(e.target.value); setPage(1); }}
                placeholder="Buscar por nombre, HC o DNI..."
                className="pl-10 w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-white/80"
              />
            </div>
          </div>
          
          {/* Fecha desde */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">📅 Desde</label>
            <input
              type="date"
              value={fechaDesde}
              onChange={e => { setFechaDesde(e.target.value); setPage(1); }}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-white/80"
            />
          </div>
          
          {/* Fecha hasta */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">📅 Hasta</label>
            <input
              type="date"
              value={fechaHasta}
              onChange={e => { setFechaHasta(e.target.value); setPage(1); }}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-white/80"
            />
          </div>
        </div>
        
        {/* Botón limpiar filtros */}
        {(busqueda || fechaDesde || fechaHasta) && (
          <div className="mt-4 flex justify-end">
            <button 
              onClick={() => { setBusqueda(""); setFechaDesde(""); setFechaHasta(""); setPage(1); }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-all duration-200 hover:scale-105"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Limpiar Filtros
            </button>
          </div>
        )}
      </div>

      {/* Estadísticas rápidas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-2xl p-6 text-white shadow-xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100 text-sm font-medium">Total Consultas</p>
              <p className="text-3xl font-bold">{consultasFiltradas.length}</p>
            </div>
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
          </div>
        </div>
        
        <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-2xl p-6 text-white shadow-xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-green-100 text-sm font-medium">Pendientes</p>
              <p className="text-3xl font-bold">{consultasFiltradas.filter(c => c.estado === 'pendiente').length}</p>
            </div>
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>
        
        <div className="bg-gradient-to-r from-red-500 to-red-600 rounded-2xl p-6 text-white shadow-xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-red-100 text-sm font-medium">Emergencias</p>
              <p className="text-3xl font-bold">{consultasFiltradas.filter(c => c.clasificacion === 'Emergencia').length}</p>
            </div>
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
          </div>
        </div>
      </div>
      {/* Lista de consultas moderna */}
      {loading ? (
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl p-12 border border-white/50 flex justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-gray-600 font-medium">🏥 Cargando consultas médicas...</p>
          </div>
        </div>
      ) : consultasPaginadas.length === 0 ? (
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl p-12 border border-white/50 text-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-20 h-20 bg-gradient-to-r from-gray-300 to-gray-400 rounded-full flex items-center justify-center">
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <div>
              <h3 className="text-xl font-semibold text-gray-700 mb-2">📅 No hay consultas</h3>
              <p className="text-gray-500">No se encontraron consultas con los filtros aplicados</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/50 overflow-hidden">
          {/* Tabla responsiva moderna */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-1 py-0.5 sm:px-2 md:px-3 md:py-2 whitespace-nowrap">Fecha</th>
                  <th className="px-1 py-0.5 sm:px-2 md:px-3 md:py-2 whitespace-nowrap">Hora</th>
                  <th className="px-1 py-0.5 sm:px-2 md:px-3 md:py-2 whitespace-nowrap">Paciente</th>
                  <th className="px-1 py-0.5 sm:px-2 md:px-3 md:py-2 whitespace-nowrap">Tipo</th>
                  <th className="px-1 py-0.5 sm:px-2 md:px-3 md:py-2 whitespace-nowrap">Estado</th>
                  <th className="px-1 py-0.5 sm:px-2 md:px-3 md:py-2 whitespace-nowrap">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {consultas.length === 0 && <tr><td colSpan={6} className="text-center">No hay consultas agendadas</td></tr>}
                {pagedConsultas.map(c => {
                  let rowColor = '';
                  let etiqueta = '';
                  let alertaUrgente = null;
                  if (c.clasificacion === 'Emergencia') {
                    rowColor = 'bg-red-200';
                    etiqueta = <span className="bg-red-600 text-white px-2 py-0.5 rounded text-xs ml-2">EMERGENCIA</span>;
                    alertaUrgente = <span title="Emergencia" className="ml-1 animate-pulse text-red-700 text-lg font-bold">&#9888;</span>;
                  } else if (c.clasificacion === 'Urgente') {
                    rowColor = 'bg-yellow-200';
                    etiqueta = <span className="bg-yellow-600 text-white px-2 py-0.5 rounded text-xs ml-2">URGENTE</span>;
                    alertaUrgente = <span title="Urgente" className="ml-1 animate-pulse text-yellow-600 text-lg font-bold">&#9888;</span>;
                  } else if (c.clasificacion === 'No urgente') {
                    rowColor = 'bg-green-100';
                    etiqueta = <span className="bg-green-600 text-white px-2 py-0.5 rounded text-xs ml-2">NO URGENTE</span>;
                  }
                  // Mostrar siempre el estado real de la consulta
                  let estadoMostrar = c.estado;
                  return (
                    <tr key={c.id} className={rowColor}>
                      <td className="px-1 py-0.5 sm:px-2 md:px-3 md:py-2">{c.fecha}</td>
                      <td className="px-1 py-0.5 sm:px-2 md:px-3 md:py-2">{c.hora}</td>
                      <td className="px-1 py-0.5 sm:px-2 md:px-3 md:py-2">
                        {c.paciente_nombre ? `${c.paciente_nombre} ${c.paciente_apellido}` : `Paciente #${c.paciente_id}`}
                        {etiqueta} {alertaUrgente}
                      </td>
                      <td className="px-1 py-0.5 sm:px-2 md:px-3 md:py-2 text-center">
                      {/* Tipo de consulta/triaje */}
                      {c.clasificacion ? c.clasificacion : <span className="text-gray-400 italic">Sin clasificar</span>}
                    </td>
                    <td className="px-1 py-0.5 sm:px-2 md:px-3 md:py-2 font-bold">{estadoMostrar}</td>
                    <td className="px-1 py-0.5 sm:px-2 md:px-3 md:py-2 flex flex-wrap gap-0.5 sm:gap-2">
                      {c.estado === 'pendiente' && !c.clasificacion && (
                        <>
                          <button onClick={() => actualizarEstado(c.id, 'completada')} className="bg-green-600 text-white px-1 py-0.5 rounded text-lg md:text-xl" title="Completar">
                            <span role="img" aria-label="Completar">✔️</span>
                          </button>
                          <button onClick={() => actualizarEstado(c.id, 'cancelada')} className="bg-red-600 text-white px-1 py-0.5 rounded text-lg md:text-xl" title="Cancelar">
                            <span role="img" aria-label="Cancelar">✖️</span>
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => navigate(`/historia-clinica/${c.paciente_id}/${c.id}`)}
                        className="bg-blue-600 text-white px-1 py-0.5 rounded text-lg md:text-xl"
                        title="Historia Clínica"
                      >
                        <span role="img" aria-label="Historia Clínica">📖</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            </table>
          </div>
        </div>
      )}
      {msg && <div className="mt-2 text-center text-sm">{msg}</div>}

      {/* Paginación */}
      {consultas.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 mt-4">
          <div className="flex items-center gap-2">
            <button onClick={handlePrev} disabled={page === 1} className="px-2 py-1 rounded bg-gray-200 disabled:opacity-50">&lt;</button>
            <span className="text-xs">Página {page} de {totalPages}</span>
            <button onClick={handleNext} disabled={page === totalPages} className="px-2 py-1 rounded bg-gray-200 disabled:opacity-50">&gt;</button>
          </div>
          <div className="flex items-center gap-1 text-xs">
            <span>Filas por página:</span>
            <select value={rowsPerPage} onChange={handleRowsPerPage} className="border rounded px-1 py-0.5">
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={25}>25</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
}

export default MedicoConsultas;
