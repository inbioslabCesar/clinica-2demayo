import { useState, useEffect } from 'react';
import { BASE_URL } from '../config/config';
import Swal from 'sweetalert2';

function PagosHonorariosMedicos() {
  const [movimientos, setMovimientos] = useState([]);
  const [medicos, setMedicos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroMedico, setFiltroMedico] = useState('todos');
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [fechaDesde, setFechaDesde] = useState(() => {
    const fecha = new Date();
    fecha.setDate(1); // Primer día del mes
    return fecha.toISOString().split('T')[0];
  });
  const [fechaHasta, setFechaHasta] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });

  // Estados para paginación
  const [paginaActual, setPaginaActual] = useState(1);
  const [elementosPorPagina] = useState(15);

  // Modal de pago
  const [mostrarModalPago, setMostrarModalPago] = useState(false);
  const [movimientoSeleccionado, setMovimientoSeleccionado] = useState(null);
  const [datosPago, setDatosPago] = useState({
    estado_pago_medico: 'pagado',
    metodo_pago_medico: 'efectivo',
    observaciones: ''
  });

  const estadosPago = [
    { value: 'pendiente', label: 'Pendiente', color: 'bg-yellow-100 text-yellow-800' },
    { value: 'pagado', label: 'Pagado', color: 'bg-green-100 text-green-800' },
    { value: 'cancelado', label: 'Cancelado', color: 'bg-red-100 text-red-800' }
  ];

  const metodosPago = [
    { value: 'efectivo', label: 'Efectivo' },
    { value: 'transferencia', label: 'Transferencia Bancaria' },
    { value: 'cheque', label: 'Cheque' },
    { value: 'deposito', label: 'Depósito Bancario' }
  ];

  useEffect(() => {
    cargarDatos();
  }, []);

  useEffect(() => {
    cargarMovimientos();
  }, [filtroMedico, filtroEstado, fechaDesde, fechaHasta]);

  const cargarDatos = async () => {
    try {
      setLoading(true);
      await Promise.all([
        cargarMedicos(),
        cargarMovimientos()
      ]);
    } catch (error) {
      console.error('Error al cargar datos:', error);
    } finally {
      setLoading(false);
    }
  };

  const cargarMedicos = async () => {
    try {
      const response = await fetch(`${BASE_URL}api_medicos.php`, {
        credentials: 'include'
      });
      const data = await response.json();
      if (data.success) {
        setMedicos(data.medicos || []);
      }
    } catch (error) {
      console.error('Error al cargar médicos:', error);
    }
  };

  const cargarMovimientos = async () => {
    try {
      let url = `${BASE_URL}api_movimientos_honorarios.php?fecha_desde=${fechaDesde}&fecha_hasta=${fechaHasta}`;
      
      if (filtroMedico !== 'todos') {
        url += `&medico_id=${filtroMedico}`;
      }
      
      if (filtroEstado !== 'todos') {
        url += `&estado_pago=${filtroEstado}`;
      }

      const response = await fetch(url, {
        credentials: 'include'
      });
      const data = await response.json();
      if (data.success) {
        setMovimientos(data.movimientos || []);
      }
    } catch (error) {
      console.error('Error al cargar movimientos:', error);
    }
  };

  const abrirModalPago = (movimiento) => {
    setMovimientoSeleccionado(movimiento);
    setDatosPago({
      estado_pago_medico: movimiento.estado_pago_medico,
      metodo_pago_medico: movimiento.metodo_pago_medico || 'efectivo',
      observaciones: ''
    });
    setMostrarModalPago(true);
  };

  const cerrarModalPago = () => {
    setMostrarModalPago(false);
    setMovimientoSeleccionado(null);
  };

  const actualizarPago = async () => {
    if (!movimientoSeleccionado) return;

    try {
      const response = await fetch(`${BASE_URL}api_movimientos_honorarios.php`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          id: movimientoSeleccionado.id,
          ...datosPago
        }),
      });

      const result = await response.json();
      
      if (result.success) {
        Swal.fire({
          title: '¡Éxito!',
          text: 'Estado de pago actualizado correctamente',
          icon: 'success',
          confirmButtonText: 'OK'
        });
        cerrarModalPago();
        cargarMovimientos();
      } else {
        Swal.fire('Error', result.error || 'Error al actualizar el pago', 'error');
      }
    } catch (error) {
      console.error('Error:', error);
      Swal.fire('Error', 'Error de conexión', 'error');
    }
  };

  const marcarComoPagado = async (movimiento) => {
    const result = await Swal.fire({
      title: '¿Marcar como pagado?',
      text: `¿Confirma que se pagó S/ ${movimiento.monto_medico} a ${movimiento.medico_nombre} ${movimiento.medico_apellido}?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, marcar como pagado',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#10b981'
    });

    if (result.isConfirmed) {
      try {
        const response = await fetch(`${BASE_URL}api_movimientos_honorarios.php`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            id: movimiento.id,
            estado_pago_medico: 'pagado',
            metodo_pago_medico: 'efectivo'
          }),
        });

        const data = await response.json();
        if (data.success) {
          Swal.fire('¡Pagado!', 'El honorario ha sido marcado como pagado', 'success');
          cargarMovimientos();
        } else {
          Swal.fire('Error', data.error || 'Error al marcar como pagado', 'error');
        }
      } catch (error) {
        console.error('Error:', error);
        Swal.fire('Error', 'Error de conexión', 'error');
      }
    }
  };

  // Filtrado y paginación
  const totalElementos = movimientos.length;
  const totalPaginas = Math.ceil(totalElementos / elementosPorPagina);
  const indiceInicio = (paginaActual - 1) * elementosPorPagina;
  const indiceFin = indiceInicio + elementosPorPagina;
  const movimientosPaginados = movimientos.slice(indiceInicio, indiceFin);

  // Cálculos de resumen
  const resumen = movimientos.reduce((acc, mov) => {
    acc.total += parseFloat(mov.monto_medico);
    if (mov.estado_pago_medico === 'pagado') {
      acc.pagado += parseFloat(mov.monto_medico);
    } else if (mov.estado_pago_medico === 'pendiente') {
      acc.pendiente += parseFloat(mov.monto_medico);
    }
    return acc;
  }, { total: 0, pagado: 0, pendiente: 0 });

  const cambiarPagina = (nuevaPagina) => {
    setPaginaActual(nuevaPagina);
  };

  // Reiniciar paginación cuando cambien filtros
  useEffect(() => {
    setPaginaActual(1);
  }, [filtroMedico, filtroEstado, fechaDesde, fechaHasta]);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-xl">Cargando movimientos de honorarios...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-blue-800">💳 Pagos de Honorarios Médicos</h1>
      </div>
      
      {/* Resumen */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="text-blue-800 text-sm font-medium">Total Honorarios</div>
          <div className="text-2xl font-bold text-blue-900">S/ {resumen.total.toFixed(2)}</div>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="text-green-800 text-sm font-medium">Pagado</div>
          <div className="text-2xl font-bold text-green-900">S/ {resumen.pagado.toFixed(2)}</div>
        </div>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="text-yellow-800 text-sm font-medium">Pendiente</div>
          <div className="text-2xl font-bold text-yellow-900">S/ {resumen.pendiente.toFixed(2)}</div>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white p-4 rounded-lg shadow mb-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label className="block font-medium text-gray-700 mb-2">Desde:</label>
            <input
              type="date"
              value={fechaDesde}
              onChange={(e) => setFechaDesde(e.target.value)}
              className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <div>
            <label className="block font-medium text-gray-700 mb-2">Hasta:</label>
            <input
              type="date"
              value={fechaHasta}
              onChange={(e) => setFechaHasta(e.target.value)}
              className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <div>
            <label className="block font-medium text-gray-700 mb-2">Médico:</label>
            <select
              value={filtroMedico}
              onChange={(e) => setFiltroMedico(e.target.value)}
              className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="todos">Todos los médicos</option>
              {medicos.map(medico => (
                <option key={medico.id} value={medico.id}>
                  Dr(a). {medico.nombre} {medico.apellido}
                </option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block font-medium text-gray-700 mb-2">Estado:</label>
            <select
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
              className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="todos">Todos los estados</option>
              {estadosPago.map(estado => (
                <option key={estado.value} value={estado.value}>{estado.label}</option>
              ))}
            </select>
          </div>
          
          <div className="flex items-end">
            <span className="text-gray-600 text-sm">
              {totalElementos} movimiento{totalElementos !== 1 ? 's' : ''} - Página {paginaActual} de {totalPaginas}
            </span>
          </div>
        </div>
      </div>

      {/* Tabla de movimientos */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Fecha/Hora
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Médico
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Paciente
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Servicio
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Honorario
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Estado
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {movimientosPaginados.map((movimiento) => {
                const estadoInfo = estadosPago.find(e => e.value === movimiento.estado_pago_medico);
                return (
                  <tr key={movimiento.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{movimiento.fecha}</div>
                      <div className="text-sm text-gray-500">{movimiento.hora}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        Dr(a). {movimiento.medico_nombre} {movimiento.medico_apellido}
                      </div>
                      <div className="text-sm text-gray-500">{movimiento.especialidad}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {movimiento.paciente_nombre ? (
                        <div>
                          <div className="text-sm text-gray-900">
                            {movimiento.paciente_nombre} {movimiento.paciente_apellido}
                          </div>
                          <div className="text-sm text-gray-500">DNI: {movimiento.dni}</div>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">Sin paciente</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{movimiento.tipo_servicio}</div>
                      {movimiento.tarifa_descripcion && (
                        <div className="text-xs text-gray-500">{movimiento.tarifa_descripcion}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        S/ {parseFloat(movimiento.monto_medico).toFixed(2)}
                      </div>
                      <div className="text-xs text-gray-500">
                        Total: S/ {parseFloat(movimiento.tarifa_total).toFixed(2)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${estadoInfo?.color}`}>
                        {estadoInfo?.label}
                      </span>
                      {movimiento.fecha_pago_medico && (
                        <div className="text-xs text-gray-500 mt-1">
                          Pagado: {movimiento.fecha_pago_medico}
                        </div>
                      )}
                      {movimiento.metodo_pago_medico && movimiento.estado_pago_medico === 'pagado' && (
                        <div className="text-xs text-gray-500">
                          Método: {metodosPago.find(m => m.value === movimiento.metodo_pago_medico)?.label}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        {movimiento.estado_pago_medico === 'pendiente' && (
                          <button
                            onClick={() => marcarComoPagado(movimiento)}
                            className="text-green-600 hover:text-green-900 px-3 py-1 bg-green-100 rounded text-sm"
                          >
                            💰 Marcar Pagado
                          </button>
                        )}
                        <button
                          onClick={() => abrirModalPago(movimiento)}
                          className="text-blue-600 hover:text-blue-900 px-3 py-1 bg-blue-100 rounded text-sm"
                        >
                          ✏️ Editar
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {movimientos.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            No hay movimientos de honorarios para este filtro
          </div>
        )}
      </div>

      {/* Paginación */}
      {totalPaginas > 1 && (
        <div className="bg-white p-4 rounded-lg shadow mt-6">
          <div className="flex items-center justify-center space-x-2">
            <button
              onClick={() => cambiarPagina(1)}
              disabled={paginaActual === 1}
              className="px-3 py-1 text-sm border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
            >
              Primera
            </button>
            <button
              onClick={() => cambiarPagina(paginaActual - 1)}
              disabled={paginaActual === 1}
              className="px-3 py-1 text-sm border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
            >
              Anterior
            </button>
            
            {Array.from({ length: Math.min(5, totalPaginas) }, (_, i) => {
              let pageNumber;
              if (totalPaginas <= 5) {
                pageNumber = i + 1;
              } else {
                const start = Math.max(1, Math.min(paginaActual - 2, totalPaginas - 4));
                pageNumber = start + i;
              }
              
              return (
                <button
                  key={pageNumber}
                  onClick={() => cambiarPagina(pageNumber)}
                  className={`px-3 py-1 text-sm border rounded ${
                    paginaActual === pageNumber
                      ? 'bg-blue-500 text-white'
                      : 'hover:bg-gray-100'
                  }`}
                >
                  {pageNumber}
                </button>
              );
            })}
            
            <button
              onClick={() => cambiarPagina(paginaActual + 1)}
              disabled={paginaActual === totalPaginas}
              className="px-3 py-1 text-sm border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
            >
              Siguiente
            </button>
            <button
              onClick={() => cambiarPagina(totalPaginas)}
              disabled={paginaActual === totalPaginas}
              className="px-3 py-1 text-sm border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
            >
              Última
            </button>
          </div>
        </div>
      )}

      {/* Modal de edición de pago */}
      {mostrarModalPago && movimientoSeleccionado && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h2 className="text-xl font-bold mb-4">Editar Estado de Pago</h2>
            
            <div className="mb-4">
              <div className="text-sm text-gray-600 mb-2">
                <strong>Médico:</strong> Dr(a). {movimientoSeleccionado.medico_nombre} {movimientoSeleccionado.medico_apellido}
              </div>
              <div className="text-sm text-gray-600 mb-2">
                <strong>Monto:</strong> S/ {parseFloat(movimientoSeleccionado.monto_medico).toFixed(2)}
              </div>
              <div className="text-sm text-gray-600 mb-4">
                <strong>Fecha:</strong> {movimientoSeleccionado.fecha}
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Estado de Pago *
                </label>
                <select
                  value={datosPago.estado_pago_medico}
                  onChange={(e) => setDatosPago({...datosPago, estado_pago_medico: e.target.value})}
                  className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {estadosPago.map(estado => (
                    <option key={estado.value} value={estado.value}>{estado.label}</option>
                  ))}
                </select>
              </div>

              {datosPago.estado_pago_medico === 'pagado' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Método de Pago *
                  </label>
                  <select
                    value={datosPago.metodo_pago_medico}
                    onChange={(e) => setDatosPago({...datosPago, metodo_pago_medico: e.target.value})}
                    className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {metodosPago.map(metodo => (
                      <option key={metodo.value} value={metodo.value}>{metodo.label}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Observaciones
                </label>
                <textarea
                  value={datosPago.observaciones}
                  onChange={(e) => setDatosPago({...datosPago, observaciones: e.target.value})}
                  className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows="3"
                  placeholder="Observaciones sobre el pago..."
                />
              </div>
            </div>

            <div className="flex justify-end space-x-4 mt-6">
              <button
                onClick={cerrarModalPago}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={actualizarPago}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Actualizar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PagosHonorariosMedicos;