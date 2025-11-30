import { useState, useEffect } from 'react';
import { BASE_URL } from '../config/config';
import Swal from 'sweetalert2';

function GestionHonorariosMedicos() {
  const [configuraciones, setConfiguraciones] = useState([]);
  const [medicos, setMedicos] = useState([]);
  const [tarifas, setTarifas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mostrarModal, setMostrarModal] = useState(false);
  const [configuracionEditando, setConfiguracionEditando] = useState(null);
  const [filtroMedico, setFiltroMedico] = useState('todos');
  const [filtroTipoServicio, setFiltroTipoServicio] = useState('todos');

  // Estados para paginación
  const [paginaActual, setPaginaActual] = useState(1);
  const [elementosPorPagina] = useState(10);

  // Tipos de servicios médicos
  const tiposServicio = [
    { value: 'consulta', label: 'Consultas Médicas' },
    { value: 'procedimiento', label: 'Procedimientos Médicos' },
    { value: 'cirugia', label: 'Cirugías' },
    { value: 'interconsulta', label: 'Interconsultas' },
    { value: 'otros', label: 'Otros Servicios' }
  ];

  const [nuevaConfiguracion, setNuevaConfiguracion] = useState({
    medico_id: '',
    tarifa_id: '', // Opcional: configuración específica para una tarifa
    especialidad: '',
    tipo_servicio: 'consulta',
    porcentaje_clinica: '',
    porcentaje_medico: '',
    monto_fijo_clinica: '',
    monto_fijo_medico: '',
    vigencia_desde: new Date().toISOString().split('T')[0],
    vigencia_hasta: '',
    observaciones: '',
    activo: 1
  });

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    try {
      setLoading(true);
      await Promise.all([
        cargarConfiguraciones(),
        cargarMedicos(),
        cargarTarifas()
      ]);
    } catch {
      // Eliminado log de error al cargar datos
    } finally {
      setLoading(false);
    }
  };

  const cargarConfiguraciones = async () => {
    try {
      const response = await fetch(`${BASE_URL}api_honorarios_medicos_v2.php`, {
        credentials: 'include'
      });
      const data = await response.json();
      if (data.success) {
        setConfiguraciones(data.configuraciones || []);
      }
    } catch {
      // Eliminado log de error al cargar configuraciones
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
    } catch {
      // Eliminado log de error al cargar médicos
    }
  };

  const cargarTarifas = async () => {
    try {
      const response = await fetch(`${BASE_URL}api_honorarios_medicos_v2.php?tarifas_con_honorarios=1`, {
        credentials: 'include'
      });
      const data = await response.json();
      if (data.success) {
        setTarifas(data.tarifas || []);
      }
    } catch {
      // Eliminado log de error al cargar tarifas
    }
  };

  const abrirModal = (configuracion = null) => {
    if (configuracion) {
      setConfiguracionEditando(configuracion);
      setNuevaConfiguracion({
        medico_id: configuracion.medico_id,
        tarifa_id: configuracion.tarifa_id || '',
        especialidad: configuracion.especialidad,
        tipo_servicio: configuracion.tipo_servicio,
        porcentaje_clinica: configuracion.porcentaje_clinica,
        porcentaje_medico: configuracion.porcentaje_medico,
        monto_fijo_clinica: configuracion.monto_fijo_clinica || '',
        monto_fijo_medico: configuracion.monto_fijo_medico || '',
        vigencia_desde: configuracion.vigencia_desde,
        vigencia_hasta: configuracion.vigencia_hasta || '',
        observaciones: configuracion.observaciones || '',
        activo: configuracion.activo
      });
    } else {
      setConfiguracionEditando(null);
      setNuevaConfiguracion({
        medico_id: '',
        tarifa_id: '',
        especialidad: '',
        tipo_servicio: 'consulta',
        porcentaje_clinica: '',
        porcentaje_medico: '',
        monto_fijo_clinica: '',
        monto_fijo_medico: '',
        vigencia_desde: new Date().toISOString().split('T')[0],
        vigencia_hasta: '',
        observaciones: '',
        activo: 1
      });
    }
    setMostrarModal(true);
  };

  const cerrarModal = () => {
    setMostrarModal(false);
    setConfiguracionEditando(null);
  };

  const validarFormulario = () => {
    if (!nuevaConfiguracion.medico_id) {
      Swal.fire('Error', 'Debe seleccionar un médico', 'error');
      return false;
    }

    const usarMontosFijos = nuevaConfiguracion.monto_fijo_clinica && nuevaConfiguracion.monto_fijo_medico;
    const usarPorcentajes = nuevaConfiguracion.porcentaje_clinica && nuevaConfiguracion.porcentaje_medico;

    if (!usarMontosFijos && !usarPorcentajes) {
      Swal.fire('Error', 'Debe configurar porcentajes O montos fijos', 'error');
      return false;
    }

    if (usarPorcentajes) {
      const totalPorcentaje = parseFloat(nuevaConfiguracion.porcentaje_clinica) + parseFloat(nuevaConfiguracion.porcentaje_medico);
      if (Math.abs(totalPorcentaje - 100) > 0.01) {
        Swal.fire('Error', 'Los porcentajes deben sumar exactamente 100%', 'error');
        return false;
      }
    }

    return true;
  };

  const guardarConfiguracion = async () => {
    if (!validarFormulario()) return;

    try {
      const url = `${BASE_URL}api_honorarios_medicos_v2.php`;
      const method = configuracionEditando ? 'PUT' : 'POST';
      
      // Limpiar campos vacíos para evitar problemas con la base de datos
      const dataToSend = configuracionEditando
        ? { ...nuevaConfiguracion, id: configuracionEditando.id }
        : nuevaConfiguracion;

      // Convertir campos vacíos a null para MySQL
      if (dataToSend.tarifa_id === '') dataToSend.tarifa_id = null;
      if (dataToSend.vigencia_hasta === '') dataToSend.vigencia_hasta = null;
      if (dataToSend.monto_fijo_clinica === '') dataToSend.monto_fijo_clinica = null;
      if (dataToSend.monto_fijo_medico === '') dataToSend.monto_fijo_medico = null;

      const data = dataToSend;

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(data),
      });

      const result = await response.json();
      
      if (result.success) {
        Swal.fire({
          title: '¡Éxito!',
          text: configuracionEditando ? 'Configuración actualizada correctamente' : 'Configuración creada correctamente',
          icon: 'success',
          confirmButtonText: 'OK'
        });
        cerrarModal();
        cargarConfiguraciones();
      } else {
        Swal.fire('Error', result.error || 'Error al guardar la configuración', 'error');
      }
    } catch (error) {
      console.error('Error:', error);
      Swal.fire('Error', 'Error de conexión', 'error');
    }
  };

  const eliminarConfiguracion = async (id, medico) => {
    const result = await Swal.fire({
      title: '¿Estás seguro?',
      text: `¿Deseas eliminar la configuración de ${medico}?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#d33'
    });

    if (result.isConfirmed) {
      try {
        const response = await fetch(`${BASE_URL}api_honorarios_medicos_v2.php`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ id })
        });

        const data = await response.json();
        if (data.success) {
          Swal.fire('¡Eliminado!', 'La configuración ha sido eliminada', 'success');
          cargarConfiguraciones();
        } else {
          Swal.fire('Error', data.error || 'Error al eliminar la configuración', 'error');
        }
      } catch (error) {
        console.error('Error:', error);
        Swal.fire('Error', 'Error de conexión', 'error');
      }
    }
  };

  const actualizarMedico = (medicoId) => {
    const medico = medicos.find(m => m.id == medicoId);
    if (medico) {
      setNuevaConfiguracion(prev => ({
        ...prev,
        medico_id: medicoId,
        especialidad: medico.especialidad || ''
      }));
    }
  };

  const calcularPorcentajeRestante = (campo, valor) => {
    if (campo === 'porcentaje_clinica') {
      const resto = 100 - parseFloat(valor || 0);
      setNuevaConfiguracion(prev => ({
        ...prev,
        porcentaje_clinica: valor,
        porcentaje_medico: resto >= 0 ? resto.toString() : ''
      }));
    } else if (campo === 'porcentaje_medico') {
      const resto = 100 - parseFloat(valor || 0);
      setNuevaConfiguracion(prev => ({
        ...prev,
        porcentaje_medico: valor,
        porcentaje_clinica: resto >= 0 ? resto.toString() : ''
      }));
    }
  };

  // Filtrado de configuraciones
  const configuracionesFiltradas = configuraciones.filter(config => {
    const cumpleMedico = filtroMedico === 'todos' || config.medico_id == filtroMedico;
    const cumpleTipo = filtroTipoServicio === 'todos' || config.tipo_servicio === filtroTipoServicio;
    return cumpleMedico && cumpleTipo;
  });

  // Paginación
  const totalElementos = configuracionesFiltradas.length;
  const totalPaginas = Math.ceil(totalElementos / elementosPorPagina);
  const indiceInicio = (paginaActual - 1) * elementosPorPagina;
  const indiceFin = indiceInicio + elementosPorPagina;
  const configuracionesPaginadas = configuracionesFiltradas.slice(indiceInicio, indiceFin);

  const cambiarPagina = (nuevaPagina) => {
    setPaginaActual(nuevaPagina);
  };

  // Reiniciar paginación cuando cambien filtros
  useEffect(() => {
    setPaginaActual(1);
  }, [filtroMedico, filtroTipoServicio]);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-xl">Cargando configuraciones de honorarios...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-green-800">💰 Gestión de Honorarios Médicos</h1>
        <button
          onClick={() => abrirModal()}
          className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 font-medium"
        >
          ➕ Nueva Configuración
        </button>
      </div>
      
      {/* Filtros */}
      <div className="bg-white p-4 rounded-lg shadow mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block font-medium text-gray-700 mb-2">Filtrar por médico:</label>
            <select
              value={filtroMedico}
              onChange={(e) => setFiltroMedico(e.target.value)}
              className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="todos">Todos los médicos</option>
              {medicos.map(medico => (
                <option key={medico.id} value={medico.id}>
                  Dr(a). {medico.nombre} {medico.apellido} - {medico.especialidad}
                </option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block font-medium text-gray-700 mb-2">Filtrar por tipo de servicio:</label>
            <select
              value={filtroTipoServicio}
              onChange={(e) => setFiltroTipoServicio(e.target.value)}
              className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="todos">Todos los servicios</option>
              {tiposServicio.map(tipo => (
                <option key={tipo.value} value={tipo.value}>{tipo.label}</option>
              ))}
            </select>
          </div>
          
          <div className="flex items-end">
            <span className="text-gray-600">
              {totalElementos} configuración{totalElementos !== 1 ? 'es' : ''} - Página {paginaActual} de {totalPaginas}
            </span>
          </div>
        </div>
      </div>

      {/* Tabla de configuraciones */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Médico
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Servicio
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Configuración
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Vigencia
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
              {configuracionesPaginadas.map((config) => (
                <tr key={config.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          Dr(a). {config.nombre} {config.apellido}
                        </div>
                        <div className="text-sm text-gray-500">{config.especialidad}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {tiposServicio.find(t => t.value === config.tipo_servicio)?.label || config.tipo_servicio}
                    </span>
                    {config.tarifa_descripcion && (
                      <div className="text-xs text-gray-500 mt-1">
                        Tarifa específica: {config.tarifa_descripcion}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {config.monto_fijo_clinica ? (
                        <div>
                          <div>Clínica: S/ {parseFloat(config.monto_fijo_clinica).toFixed(2)}</div>
                          <div>Médico: S/ {parseFloat(config.monto_fijo_medico).toFixed(2)}</div>
                        </div>
                      ) : (
                        <div>
                          <div>Clínica: {config.porcentaje_clinica}%</div>
                          <div>Médico: {config.porcentaje_medico}%</div>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div>Desde: {config.vigencia_desde}</div>
                    {config.vigencia_hasta && <div>Hasta: {config.vigencia_hasta}</div>}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      config.activo === 1 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {config.activo === 1 ? '✓ Activo' : '✗ Inactivo'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex space-x-2">
                      <button
                        onClick={() => abrirModal(config)}
                        className="text-blue-600 hover:text-blue-900 px-3 py-1 bg-blue-100 rounded text-sm"
                      >
                        ✏️ Editar
                      </button>
                      <button
                        onClick={() => eliminarConfiguracion(config.id, `${config.nombre} ${config.apellido}`)}
                        className="text-red-600 hover:text-red-900 px-3 py-1 bg-red-100 rounded text-sm"
                      >
                        🗑️ Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {configuracionesFiltradas.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            No hay configuraciones registradas para este filtro
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
                      ? 'bg-green-500 text-white'
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

      {/* Modal para crear/editar configuraciones */}
      {mostrarModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">
              {configuracionEditando ? 'Editar Configuración de Honorarios' : 'Nueva Configuración de Honorarios'}
            </h2>

            <div className="space-y-4">
              {/* Médico */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Médico *
                </label>
                <select
                  value={nuevaConfiguracion.medico_id}
                  onChange={(e) => actualizarMedico(e.target.value)}
                  className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                  disabled={configuracionEditando}
                >
                  <option value="">Seleccionar médico...</option>
                  {medicos.map(medico => (
                    <option key={medico.id} value={medico.id}>
                      Dr(a). {medico.nombre} {medico.apellido} - {medico.especialidad}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Especialidad */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Especialidad
                  </label>
                  <input
                    type="text"
                    value={nuevaConfiguracion.especialidad}
                    onChange={(e) => setNuevaConfiguracion({...nuevaConfiguracion, especialidad: e.target.value})}
                    className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="Especialidad médica"
                  />
                </div>

                {/* Tipo de Servicio */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tipo de Servicio *
                  </label>
                  <select
                    value={nuevaConfiguracion.tipo_servicio}
                    onChange={(e) => setNuevaConfiguracion({...nuevaConfiguracion, tipo_servicio: e.target.value})}
                    className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    {tiposServicio.map(tipo => (
                      <option key={tipo.value} value={tipo.value}>{tipo.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Tarifa específica (opcional) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tarifa Específica (Opcional)
                </label>
                <select
                  value={nuevaConfiguracion.tarifa_id}
                  onChange={(e) => setNuevaConfiguracion({...nuevaConfiguracion, tarifa_id: e.target.value})}
                  className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="">Configuración general para el tipo de servicio</option>
                  {tarifas
                    .filter(t => t.servicio_tipo === nuevaConfiguracion.tipo_servicio)
                    .map(tarifa => (
                    <option key={tarifa.id} value={tarifa.id}>
                      {tarifa.descripcion} - S/ {tarifa.precio_particular}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Si selecciona una tarifa específica, esta configuración solo se aplicará a esa tarifa.
                  Si no selecciona ninguna, se aplicará a todas las tarifas del tipo de servicio.
                </p>
              </div>

              {/* Configuración de honorarios */}
              <div className="border rounded-lg p-4 bg-gray-50">
                <h3 className="font-medium text-gray-700 mb-3">Configuración de Honorarios</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Porcentajes */}
                  <div>
                    <h4 className="text-sm font-medium text-gray-600 mb-2">Por Porcentajes</h4>
                    <div className="space-y-2">
                      <div>
                        <label className="block text-xs text-gray-500">Porcentaje Clínica (%)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          value={nuevaConfiguracion.porcentaje_clinica}
                          onChange={(e) => calcularPorcentajeRestante('porcentaje_clinica', e.target.value)}
                          className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                          placeholder="0.00"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500">Porcentaje Médico (%)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          value={nuevaConfiguracion.porcentaje_medico}
                          onChange={(e) => calcularPorcentajeRestante('porcentaje_medico', e.target.value)}
                          className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                          placeholder="0.00"
                        />
                      </div>
                      {nuevaConfiguracion.porcentaje_clinica && nuevaConfiguracion.porcentaje_medico && (
                        <div className={`text-xs p-2 rounded ${
                          Math.abs(parseFloat(nuevaConfiguracion.porcentaje_clinica) + parseFloat(nuevaConfiguracion.porcentaje_medico) - 100) <= 0.01
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                          Total: {(parseFloat(nuevaConfiguracion.porcentaje_clinica) + parseFloat(nuevaConfiguracion.porcentaje_medico)).toFixed(2)}%
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Montos fijos */}
                  <div>
                    <h4 className="text-sm font-medium text-gray-600 mb-2">Por Montos Fijos</h4>
                    <div className="space-y-2">
                      <div>
                        <label className="block text-xs text-gray-500">Monto Fijo Clínica (S/)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={nuevaConfiguracion.monto_fijo_clinica}
                          onChange={(e) => setNuevaConfiguracion({...nuevaConfiguracion, monto_fijo_clinica: e.target.value})}
                          className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                          placeholder="0.00"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500">Monto Fijo Médico (S/)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={nuevaConfiguracion.monto_fijo_medico}
                          onChange={(e) => setNuevaConfiguracion({...nuevaConfiguracion, monto_fijo_medico: e.target.value})}
                          className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-3 p-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700">
                  <strong>Nota:</strong> Puede usar porcentajes O montos fijos, no ambos. 
                  Los porcentajes se calculan sobre el precio de la tarifa correspondiente.
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Vigencia */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Vigencia Desde *
                  </label>
                  <input
                    type="date"
                    value={nuevaConfiguracion.vigencia_desde}
                    onChange={(e) => setNuevaConfiguracion({...nuevaConfiguracion, vigencia_desde: e.target.value})}
                    className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Vigencia Hasta (Opcional)
                  </label>
                  <input
                    type="date"
                    value={nuevaConfiguracion.vigencia_hasta}
                    onChange={(e) => setNuevaConfiguracion({...nuevaConfiguracion, vigencia_hasta: e.target.value})}
                    className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
              </div>

              {/* Observaciones */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Observaciones
                </label>
                <textarea
                  value={nuevaConfiguracion.observaciones}
                  onChange={(e) => setNuevaConfiguracion({...nuevaConfiguracion, observaciones: e.target.value})}
                  className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                  rows="3"
                  placeholder="Observaciones adicionales sobre esta configuración..."
                />
              </div>

              {/* Estado */}
              <div>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={nuevaConfiguracion.activo === 1}
                    onChange={(e) => setNuevaConfiguracion({...nuevaConfiguracion, activo: e.target.checked ? 1 : 0})}
                    className="mr-2"
                  />
                  <span className="text-sm text-gray-700">Configuración activa</span>
                </label>
              </div>
            </div>

            <div className="flex justify-end space-x-4 mt-6">
              <button
                onClick={cerrarModal}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={guardarConfiguracion}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
              >
                {configuracionEditando ? 'Actualizar' : 'Crear'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default GestionHonorariosMedicos;