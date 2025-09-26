
import React, { useEffect, useState } from "react";
import Spinner from "../Spinner";
import { BASE_URL } from "../../config/config";
import TriageForm from "./TriageForm";
import { Icon } from '@fluentui/react';

function TriageList() {
  const [consultas, setConsultas] = useState([]);
  const [triajeStatus, setTriajeStatus] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [triajeActual, setTriajeActual] = useState(null);
  const [triajeData, setTriajeData] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [cargandoTriaje, setCargandoTriaje] = useState(false);
  // Paginación
  const [rowsPerPage, setRowsPerPage] = useState(5);
  const [page, setPage] = useState(1);
  // Buscador dinámico
  const [busqueda, setBusqueda] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");

  // Refrescar lista de consultas y estados de triaje
  const recargarConsultas = () => {
    setLoading(true);
    fetch(BASE_URL + "api_consultas.php", {credentials: "include"})
      .then((res) => res.json())
      .then(async (data) => {
        if (data.success) {
          setConsultas(data.consultas);
          // Consultar estado de triaje para cada consulta
          const statusObj = {};
          await Promise.all(data.consultas.map(async (c) => {
            try {
              const res = await fetch(BASE_URL + `api_triaje.php?consulta_id=${c.id}`);
              const data = await res.json();
              statusObj[c.id] = (data.success && data.triaje) ? 'Completado' : 'Pendiente';
            } catch {
              statusObj[c.id] = 'Pendiente';
            }
          }));
          setTriajeStatus(statusObj);
        } else {
          setError(data.error || "Error al cargar consultas");
        }
        setLoading(false);
      })
      .catch((_err) => {
        setError("Error de red");
        setLoading(false);
      });
  };

  useEffect(() => {
    recargarConsultas();
  }, []);

  if (loading) return <Spinner message="Cargando pacientes en triaje..." />;
  if (error) return <div className="text-red-600">{error}</div>;

  // Filtrar por búsqueda y fechas
  let consultasFiltradas = consultas.filter(c => {
    // Filtro de búsqueda (historia_clinica, paciente, médico)
    const texto = busqueda.trim().toLowerCase();
    if (texto) {
      const match = (c.historia_clinica && c.historia_clinica.toLowerCase().includes(texto)) ||
                   (c.paciente_nombre && c.paciente_nombre.toLowerCase().includes(texto)) ||
                   (c.paciente_apellido && c.paciente_apellido.toLowerCase().includes(texto)) ||
                   (c.medico_nombre && c.medico_nombre.toLowerCase().includes(texto));
      if (!match) return false;
    }
    // Filtro de fechas (por campo fecha)
    if (!fechaDesde && !fechaHasta) return true;
    if (!c.fecha) return false;
    if (fechaDesde && c.fecha < fechaDesde) return false;
    if (fechaHasta && c.fecha > fechaHasta) return false;
    return true;
  });
  // Calcular paginación
  const totalRows = consultasFiltradas.length;
  const totalPages = Math.ceil(totalRows / rowsPerPage);
  const startIdx = (page - 1) * rowsPerPage;
  const endIdx = startIdx + rowsPerPage;
  const consultasPagina = consultasFiltradas.slice(startIdx, endIdx);

  return (
    <div className="space-y-6">
      {/* Header con estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-r from-emerald-500 to-green-600 rounded-2xl p-4 text-white">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-12 h-12 bg-white/20 rounded-xl">
              <Icon iconName="People" className="text-2xl" />
            </div>
            <div>
              <div className="text-2xl font-bold">{totalRows}</div>
              <div className="text-sm text-emerald-100">Total Pacientes</div>
            </div>
          </div>
        </div>
        
        <div className="bg-gradient-to-r from-yellow-500 to-orange-600 rounded-2xl p-4 text-white">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-12 h-12 bg-white/20 rounded-xl">
              <Icon iconName="Clock" className="text-2xl" />
            </div>
            <div>
              <div className="text-2xl font-bold">
                {Object.values(triajeStatus).filter(status => status === 'Pendiente').length}
              </div>
              <div className="text-sm text-yellow-100">Triajes Pendientes</div>
            </div>
          </div>
        </div>
        
        <div className="bg-gradient-to-r from-blue-500 to-indigo-600 rounded-2xl p-4 text-white">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-12 h-12 bg-white/20 rounded-xl">
              <Icon iconName="CheckMark" className="text-2xl" />
            </div>
            <div>
              <div className="text-2xl font-bold">
                {Object.values(triajeStatus).filter(status => status === 'Completado').length}
              </div>
              <div className="text-sm text-blue-100">Triajes Completados</div>
            </div>
          </div>
        </div>
      </div>

      {/* Filtros modernizados */}
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
        <div className="flex items-center gap-3 mb-4">
          <Icon iconName="Filter" className="text-xl text-gray-600" />
          <h3 className="text-lg font-semibold text-gray-800">Filtros de búsqueda</h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Búsqueda general */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Icon iconName="Search" className="text-lg text-gray-400" />
            </div>
            <input
              type="text"
              value={busqueda}
              onChange={e => { setBusqueda(e.target.value); setPage(1); }}
              placeholder="Buscar paciente, médico..."
              className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-300"
            />
          </div>

          {/* Fecha desde */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Icon iconName="Calendar" className="text-lg text-gray-400" />
            </div>
            <input 
              type="date" 
              value={fechaDesde} 
              onChange={e => { setFechaDesde(e.target.value); setPage(1); }} 
              className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-300"
              placeholder="Fecha desde"
            />
          </div>

          {/* Fecha hasta */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Icon iconName="Calendar" className="text-lg text-gray-400" />
            </div>
            <input 
              type="date" 
              value={fechaHasta} 
              onChange={e => { setFechaHasta(e.target.value); setPage(1); }} 
              className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-300"
              placeholder="Fecha hasta"
            />
          </div>

          {/* Filas por página */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Icon iconName="NumberedList" className="text-lg text-gray-400" />
            </div>
            <select 
              value={rowsPerPage} 
              onChange={e => { setRowsPerPage(Number(e.target.value)); setPage(1); }} 
              className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-300 appearance-none bg-white"
            >
              <option value={5}>5 por página</option>
              <option value={10}>10 por página</option>
              <option value={25}>25 por página</option>
            </select>
          </div>
        </div>

        {/* Botón limpiar filtros */}
        {(busqueda || fechaDesde || fechaHasta) && (
          <div className="mt-4 flex justify-end">
            <button 
              onClick={() => { setBusqueda(""); setFechaDesde(""); setFechaHasta(""); setPage(1); }} 
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition-colors duration-300"
            >
              <Icon iconName="Clear" className="text-lg" />
              <span>Limpiar filtros</span>
            </button>
          </div>
        )}
      </div>
      {/* Formulario de triaje activo */}
      {triajeActual ? (
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
          <div className="bg-gradient-to-r from-emerald-500 to-green-600 p-6 text-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex items-center justify-center w-12 h-12 bg-white/20 rounded-xl backdrop-blur-sm">
                  <Icon iconName="Health" className="text-2xl text-white" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold">
                    Triaje: {triajeActual.paciente_nombre} {triajeActual.paciente_apellido}
                  </h3>
                  <p className="text-emerald-100">
                    Historia Clínica: {triajeActual.historia_clinica || 'N/A'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm bg-white/20 rounded-xl px-3 py-2">
                <Icon iconName="Calendar" className="text-lg" />
                <span>{triajeActual.fecha} - {triajeActual.hora}</span>
              </div>
            </div>
          </div>
          <div className="p-6">
            {cargandoTriaje ? (
              <div className="flex items-center justify-center py-12">
                <div className="flex flex-col items-center gap-4">
                  <div className="w-12 h-12 border-4 border-emerald-200 border-t-emerald-500 rounded-full animate-spin"></div>
                  <p className="text-gray-600">Cargando datos de triaje...</p>
                </div>
              </div>
            ) : (
              <TriageForm
                consulta={triajeActual}
                initialData={triajeData}
                onGuardar={async (datos) => {
                  setGuardando(true);
                  await fetch(BASE_URL + "api_triaje.php", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ consulta_id: triajeActual.id, datos })
                  });
                  setGuardando(false);
                  setTriajeActual(null);
                  setTriajeData(null);
                  recargarConsultas();
                }}
                onCancelar={() => { setTriajeActual(null); setTriajeData(null); }}
                guardando={guardando}
              />
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Vista de tabla/cards */}
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
            {/* Header de la tabla */}
            <div className="bg-gradient-to-r from-gray-50 to-gray-100 p-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Icon iconName="Table" className="text-xl text-gray-600" />
                  <h3 className="text-lg font-semibold text-gray-800">
                    Lista de Pacientes para Triaje
                  </h3>
                </div>
                <div className="text-sm text-gray-600">
                  {consultasFiltradas.length > 0 
                    ? `Mostrando ${consultasPagina.length} de ${consultasFiltradas.length} pacientes`
                    : 'No hay pacientes'
                  }
                </div>
              </div>
            </div>

            {/* Tabla responsive */}
            <div className="overflow-x-auto">
              {consultasFiltradas.length === 0 ? (
                <div className="text-center py-12">
                  <div className="flex items-center justify-center w-20 h-20 bg-gray-100 rounded-full mx-auto mb-4">
                    <Icon iconName="Health" className="text-4xl text-gray-400" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-600 mb-2">No hay pacientes</h3>
                  <p className="text-gray-500">No se encontraron pacientes pendientes de triaje</p>
                </div>
              ) : (
                <>
                  {/* Vista de tabla para desktop */}
                  <div className="hidden lg:block">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Historia Clínica</th>
                          <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Paciente</th>
                          <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Médico</th>
                          <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Fecha y Hora</th>
                          <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Estado</th>
                          <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Acción</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {consultasPagina.map((c) => (
                          <tr key={c.id} className="hover:bg-gray-50 transition-colors duration-200">
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <Icon iconName="NumberField" className="text-lg text-gray-400" />
                                <span className="font-mono text-sm">{c.historia_clinica || '-'}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className="flex items-center justify-center w-10 h-10 bg-emerald-100 rounded-full">
                                  <Icon iconName="Contact" className="text-lg text-emerald-600" />
                                </div>
                                <div>
                                  <div className="font-semibold text-gray-800">
                                    {c.paciente_nombre} {c.paciente_apellido}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <Icon iconName="Health" className="text-lg text-blue-500" />
                                <span className="text-sm text-gray-700">{c.medico_nombre || '-'}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <Icon iconName="Calendar" className="text-lg text-gray-400" />
                                <div className="text-sm">
                                  <div className="text-gray-800">{c.fecha}</div>
                                  <div className="text-gray-500">{c.hora}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              {triajeStatus[c.id] === 'Completado' ? (
                                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                                  <Icon iconName="CheckMark" className="text-sm" />
                                  Completado
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800">
                                  <Icon iconName="Clock" className="text-sm" />
                                  Pendiente
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              <button
                                className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-500 to-green-600 text-white font-semibold rounded-xl hover:from-emerald-600 hover:to-green-700 transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl"
                                onClick={async () => {
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
                                }}
                              >
                                <Icon iconName="Health" className="text-lg" />
                                Realizar Triaje
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Vista de cards para móvil/tablet */}
                  <div className="lg:hidden p-4 space-y-4">
                    {consultasPagina.map((c) => (
                      <div key={c.id} className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all duration-300">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className="flex items-center justify-center w-12 h-12 bg-emerald-100 rounded-full">
                              <Icon iconName="Contact" className="text-xl text-emerald-600" />
                            </div>
                            <div>
                              <div className="font-semibold text-gray-800 text-lg">
                                {c.paciente_nombre} {c.paciente_apellido}
                              </div>
                              <div className="flex items-center gap-1 text-sm text-gray-600">
                                <Icon iconName="NumberField" className="text-sm" />
                                HC: {c.historia_clinica || 'N/A'}
                              </div>
                            </div>
                          </div>
                          {triajeStatus[c.id] === 'Completado' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              <Icon iconName="CheckMark" className="text-xs" />
                              Completado
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                              <Icon iconName="Clock" className="text-xs" />
                              Pendiente
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-4 mb-4">
                          <div className="flex items-center gap-2">
                            <Icon iconName="Health" className="text-lg text-blue-500" />
                            <div>
                              <div className="text-xs text-gray-500">Médico</div>
                              <div className="text-sm text-gray-800">{c.medico_nombre || 'N/A'}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Icon iconName="Calendar" className="text-lg text-gray-400" />
                            <div>
                              <div className="text-xs text-gray-500">Fecha y Hora</div>
                              <div className="text-sm text-gray-800">{c.fecha} - {c.hora}</div>
                            </div>
                          </div>
                        </div>

                        <button
                          className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-emerald-500 to-green-600 text-white font-semibold rounded-xl hover:from-emerald-600 hover:to-green-700 transition-all duration-300 transform hover:scale-[1.02] shadow-lg hover:shadow-xl"
                          onClick={async () => {
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
                          }}
                        >
                          <Icon iconName="Health" className="text-xl" />
                          Realizar Triaje
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Paginación modernizada */}
          {consultasFiltradas.length > 0 && totalPages > 1 && (
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-600">
                  Mostrando {startIdx + 1} - {Math.min(endIdx, totalRows)} de {totalRows} pacientes
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setPage(page - 1)} 
                    disabled={page === 1} 
                    className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 disabled:bg-gray-50 disabled:text-gray-400 text-gray-700 rounded-xl transition-all duration-300 disabled:cursor-not-allowed"
                  >
                    <Icon iconName="ChevronLeft" className="text-lg" />
                    <span className="hidden sm:inline">Anterior</span>
                  </button>
                  
                  <div className="flex items-center gap-1">
                    <span className="px-3 py-2 text-sm font-medium text-gray-600">
                      Página {page} de {totalPages}
                    </span>
                  </div>
                  
                  <button 
                    onClick={() => setPage(page + 1)} 
                    disabled={page === totalPages} 
                    className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 disabled:bg-gray-50 disabled:text-gray-400 text-gray-700 rounded-xl transition-all duration-300 disabled:cursor-not-allowed"
                  >
                    <span className="hidden sm:inline">Siguiente</span>
                    <Icon iconName="ChevronRight" className="text-lg" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default TriageList;
