import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { BASE_URL } from "../config/config";
import { 
  FaHistory, 
  FaArrowLeft, 
  FaSearch,
  FaFilter,
  FaDownload,
  FaEye,
  FaCalendarAlt,
  FaMoneyBillWave,
  FaUser,
  FaClock,
  FaChevronLeft,
  FaChevronRight,
  FaChartLine
} from "react-icons/fa";
import Spinner from "../components/Spinner";

export default function HistorialIngresosPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const [loading, setLoading] = useState(true);
  const [ingresos, setIngresos] = useState([]);
  const [estadisticas, setEstadisticas] = useState(null);
  const [resumenTipos, setResumenTipos] = useState([]);
  const [resumenMetodos, setResumenMetodos] = useState([]);
  const [paginacion, setPaginacion] = useState({ total: 0, pagina_actual: 1, total_paginas: 1 });

  // Estados de filtros
  const [filtros, setFiltros] = useState({
    fecha: searchParams.get('fecha') || new Date().toISOString().split('T')[0],
    tipo: searchParams.get('tipo') || '',
    metodo: searchParams.get('metodo') || ''
  });

  const [paginaActual, setPaginaActual] = useState(1);
  const registrosPorPagina = 20;

  useEffect(() => {
    cargarHistorial();
  }, [filtros, paginaActual]);

  const cargarHistorial = async () => {
    try {
      setLoading(true);
      
      const params = new URLSearchParams({
        fecha: filtros.fecha,
        limite: registrosPorPagina.toString(),
        offset: ((paginaActual - 1) * registrosPorPagina).toString()
      });

      if (filtros.tipo) params.append('tipo', filtros.tipo);
      if (filtros.metodo) params.append('metodo', filtros.metodo);

      const response = await fetch(`${BASE_URL}api_historial_ingresos.php?${params}`, { 
        credentials: 'include' 
      });
      const data = await response.json();
      
      if (data.success) {
        setIngresos(data.ingresos);
        setEstadisticas(data.estadisticas);
        setResumenTipos(data.resumen_tipos);
        setResumenMetodos(data.resumen_metodos);
        setPaginacion(data.paginacion);
      }
    } catch (error) {
      console.error('Error cargando historial:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFiltroChange = (campo, valor) => {
    const nuevosFiltros = { ...filtros, [campo]: valor };
    setFiltros(nuevosFiltros);
    setPaginaActual(1);
    
    // Actualizar URL params
    const params = new URLSearchParams();
    if (nuevosFiltros.fecha !== new Date().toISOString().split('T')[0]) {
      params.set('fecha', nuevosFiltros.fecha);
    }
    if (nuevosFiltros.tipo) params.set('tipo', nuevosFiltros.tipo);
    if (nuevosFiltros.metodo) params.set('metodo', nuevosFiltros.metodo);
    
    setSearchParams(params);
  };

  const formatearMonto = (monto) => {
    return `S/ ${parseFloat(monto || 0).toFixed(2)}`;
  };

  const formatearTiempo = (fechaHora) => {
    if (!fechaHora) return '--:--';
    const fecha = new Date(fechaHora);
    return fecha.toLocaleTimeString('es-PE', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const obtenerColorTipo = (tipo) => {
    const colores = {
      'consulta': 'bg-blue-100 text-blue-800',
      'laboratorio': 'bg-yellow-100 text-yellow-800',
      'farmacia': 'bg-purple-100 text-purple-800',
      'ecografia': 'bg-green-100 text-green-800',
      'rayosx': 'bg-red-100 text-red-800',
      'procedimiento': 'bg-gray-100 text-gray-800',
      'otros': 'bg-indigo-100 text-indigo-800'
    };
    return colores[tipo] || 'bg-gray-100 text-gray-800';
  };

  const obtenerIconoMetodoPago = (metodo) => {
    const iconos = {
      'efectivo': '💵',
      'tarjeta_debito': '💳',
      'tarjeta_credito': '💳',
      'transferencia': '🏦',
      'yape': '📱',
      'plin': '📱',
      'otros': '💰'
    };
    return iconos[metodo] || '💰';
  };

  if (loading) return <Spinner />;

  return (
    <div className="max-w-7xl mx-auto p-6">
      {/* Header */}
      <div className="mb-8">
        <button 
          onClick={() => navigate('/contabilidad/ingresos')}
          className="mb-4 bg-gradient-to-r from-gray-200 to-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:from-gray-300 hover:to-gray-400 flex items-center gap-2 font-semibold transition-all"
        >
          <FaArrowLeft />
          Volver a Ingresos
        </button>

        <div className="flex items-center gap-3">
          <FaHistory className="text-4xl text-blue-600" />
          <div>
            <h1 className="text-3xl font-bold text-gray-800">Historial de Ingresos</h1>
            <p className="text-gray-600">Registro detallado de todas las transacciones</p>
          </div>
        </div>
      </div>

      {/* Estadísticas Rápidas */}
      {estadisticas && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-blue-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm font-medium">Transacciones</p>
                <p className="text-2xl font-bold text-blue-600">{estadisticas.total_transacciones}</p>
              </div>
              <FaMoneyBillWave className="text-3xl text-blue-500 opacity-50" />
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-green-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm font-medium">Total Ingresos</p>
                <p className="text-2xl font-bold text-green-600">{formatearMonto(estadisticas.total_ingresos)}</p>
              </div>
              <FaChartLine className="text-3xl text-green-500 opacity-50" />
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-purple-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm font-medium">Tipos de Servicio</p>
                <p className="text-2xl font-bold text-purple-600">{estadisticas.tipos_diferentes}</p>
              </div>
              <FaFilter className="text-3xl text-purple-500 opacity-50" />
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-orange-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm font-medium">Métodos de Pago</p>
                <p className="text-2xl font-bold text-orange-600">{estadisticas.metodos_diferentes}</p>
              </div>
              <FaCalendarAlt className="text-3xl text-orange-500 opacity-50" />
            </div>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
        <div className="flex items-center gap-2 mb-4">
          <FaFilter className="text-gray-600" />
          <h3 className="text-lg font-semibold text-gray-800">Filtros</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Fecha</label>
            <input
              type="date"
              value={filtros.fecha}
              onChange={(e) => handleFiltroChange('fecha', e.target.value)}
              className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de Servicio</label>
            <select
              value={filtros.tipo}
              onChange={(e) => handleFiltroChange('tipo', e.target.value)}
              className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Todos los tipos</option>
              <option value="consulta">Consulta Médica</option>
              <option value="laboratorio">Laboratorio</option>
              <option value="farmacia">Farmacia</option>
              <option value="ecografia">Ecografía</option>
              <option value="rayosx">Rayos X</option>
              <option value="procedimiento">Procedimiento</option>
              <option value="otros">Otros</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Método de Pago</label>
            <select
              value={filtros.metodo}
              onChange={(e) => handleFiltroChange('metodo', e.target.value)}
              className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Todos los métodos</option>
              <option value="efectivo">Efectivo</option>
              <option value="tarjeta_debito">Tarjeta de Débito</option>
              <option value="tarjeta_credito">Tarjeta de Crédito</option>
              <option value="transferencia">Transferencia</option>
              <option value="yape">Yape</option>
              <option value="plin">Plin</option>
              <option value="otros">Otros</option>
            </select>
          </div>
        </div>
      </div>

      {/* Lista de Ingresos */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-800">
              Transacciones ({paginacion.total} registros)
            </h3>
            <button className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2">
              <FaDownload />
              Exportar
            </button>
          </div>
        </div>

        {ingresos.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <FaHistory className="text-4xl mx-auto mb-4 opacity-50" />
            <p>No se encontraron ingresos para los filtros seleccionados</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Hora</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Descripción</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Paciente</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Método Pago</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Monto</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Usuario</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {ingresos.map((ingreso) => (
                  <tr key={ingreso.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <FaClock className="text-gray-400" />
                        <span className="text-sm font-medium text-gray-900">
                          {formatearTiempo(ingreso.fecha_registro)}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${obtenerColorTipo(ingreso.tipo_ingreso)}`}>
                        {ingreso.tipo_ingreso}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{ingreso.descripcion}</div>
                        {ingreso.area && (
                          <div className="text-xs text-gray-500">{ingreso.area}</div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {ingreso.paciente_nombre || '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{obtenerIconoMetodoPago(ingreso.metodo_pago)}</span>
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {ingreso.metodo_pago.replace('_', ' ')}
                          </div>
                          {ingreso.referencia_pago && (
                            <div className="text-xs text-gray-500">Ref: {ingreso.referencia_pago}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-lg font-bold text-green-600">
                        {formatearMonto(ingreso.monto)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <FaUser className="text-gray-400" />
                        <span className="text-sm text-gray-900">{ingreso.usuario_nombre}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginación */}
        {paginacion.total_paginas > 1 && (
          <div className="px-6 py-4 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-700">
                Mostrando {((paginaActual - 1) * registrosPorPagina) + 1} - {Math.min(paginaActual * registrosPorPagina, paginacion.total)} de {paginacion.total} registros
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPaginaActual(Math.max(1, paginaActual - 1))}
                  disabled={paginaActual === 1}
                  className="px-3 py-1 border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  <FaChevronLeft />
                </button>
                
                <span className="px-4 py-2 bg-blue-600 text-white rounded-lg">
                  {paginaActual} / {paginacion.total_paginas}
                </span>
                
                <button
                  onClick={() => setPaginaActual(Math.min(paginacion.total_paginas, paginaActual + 1))}
                  disabled={paginaActual === paginacion.total_paginas}
                  className="px-3 py-1 border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  <FaChevronRight />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}