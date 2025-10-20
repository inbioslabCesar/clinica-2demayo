import { useState, useEffect, useCallback } from 'react';
import { BASE_URL } from '../config/config';
import Swal from 'sweetalert2';

function GestionTarifasPage() {
  const [tarifas, setTarifas] = useState([]);
  const [medicos, setMedicos] = useState([]); // NUEVO: Lista de médicos
  const [loading, setLoading] = useState(true);
  const [mostrarModal, setMostrarModal] = useState(false);
  const [tarifaEditando, setTarifaEditando] = useState(null);
  const [filtroServicio, setFiltroServicio] = useState('todos');
  
  // Estados para paginación
  const [paginaActual, setPaginaActual] = useState(1);
  const [elementosPorPagina, setElementosPorPagina] = useState(5);

  // Tipos de servicios médicos (editables en esta interfaz)
  const serviciosMedicos = [
    { value: 'consulta', label: 'Consultas Médicas' },
    { value: 'rayosx', label: 'Rayos X' },
    { value: 'ecografia', label: 'Ecografía' },
    { value: 'ocupacional', label: 'Medicina Ocupacional' },
    { value: 'procedimientos', label: 'Procedimientos Médicos' },
    { value: 'cirugias', label: 'Cirugías Menores' },
    { value: 'tratamientos', label: 'Tratamientos Especializados' },
    { value: 'emergencias', label: 'Emergencias' }
  ];

  // Todos los tipos (para mostrar, solo servicios médicos gestionables)
  const todosLosServicios = [...serviciosMedicos];

  const [nuevaTarifa, setNuevaTarifa] = useState({
    servicio_tipo: 'consulta',
    medico_id: '', // NUEVO: ID del médico seleccionado
    descripcion_base: '', // NUEVO: Descripción base del servicio
    descripcion: '', // Se genera automáticamente
    precio_particular: '',
    precio_seguro: '',
    precio_convenio: '',
    activo: 1
  });

  useEffect(() => {
    cargarTarifas();
    cargarMedicos(); // NUEVO: Cargar lista de médicos
  }, []);

  const cargarMedicos = async () => {
    try {
      const response = await fetch(`${BASE_URL}api_medicos.php`);
      const data = await response.json();
      
      if (data.success) {
        // Normalizar los IDs a números para evitar problemas de comparación
        const medicosNormalizados = (data.medicos || []).map(medico => ({
          ...medico,
          id: parseInt(medico.id) // Convertir ID a número
        }));
        
        setMedicos(medicosNormalizados);
      }
    } catch (error) {
      console.error('Error al cargar médicos:', error);
    }
  };

  // NUEVO: Generar descripción automáticamente
  const generarDescripcion = useCallback((medicoId, descripcionBase) => {
    if (!medicoId || medicoId === 'general' || medicoId === '') {
      return descripcionBase || 'Consulta General';
    }
    
    // Buscar médico (ahora con IDs normalizados como números)
    const medico = medicos.find(m => m.id === parseInt(medicoId));
    
    if (medico) {
      const nombreCompleto = medico.nombre;
      const especialidad = medico.especialidad ? ` - ${medico.especialidad}` : '';
      return `${nombreCompleto}${especialidad} - ${descripcionBase || 'Consulta'}`;
    }
    
    return descripcionBase || 'Consulta';
  }, [medicos]);

  const cargarTarifas = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${BASE_URL}api_tarifas.php`, {
        credentials: 'include'
      });
      const data = await response.json();
      if (data.success) {
        setTarifas(data.tarifas || []);
      } else {
        console.error('Error al cargar tarifas:', data.error);
      }
    } catch (error) {
      console.error('Error:', error);
      Swal.fire('Error', 'Error de conexión al cargar tarifas', 'error');
    } finally {
      setLoading(false);
    }
  };

  const abrirModal = (tarifa = null) => {
    // No permitir editar medicamentos ni exámenes de laboratorio
    if (tarifa && (tarifa.fuente === 'medicamentos' || tarifa.fuente === 'examenes_laboratorio')) {
      Swal.fire({
        title: 'No Editable',
        text: tarifa.fuente === 'medicamentos' 
          ? 'Los precios de medicamentos se gestionan desde el módulo de farmacia.'
          : 'Los precios de exámenes se gestionan desde el módulo de laboratorio.',
        icon: 'info',
        confirmButtonText: 'Entendido'
      });
      return;
    }
    
    if (tarifa) {
      setTarifaEditando(tarifa);
      
      // Intentar extraer médico y descripción base de la descripción existente
      const descripcionCompleta = tarifa.descripcion;
      let medicoId = 'general';
      let descripcionBase = descripcionCompleta;
      
      // Buscar si la descripción contiene el nombre de algún médico
      const medicoEncontrado = medicos.find(m => 
        descripcionCompleta.includes(m.nombre)
      );
      
      if (medicoEncontrado) {
        medicoId = medicoEncontrado.id.toString();
        // Extraer la descripción base removiendo el nombre del médico y especialidad
        const patronMedico = new RegExp(`^${medicoEncontrado.nombre}(\\s*-\\s*${medicoEncontrado.especialidad})?\\s*-\\s*`, 'i');
        descripcionBase = descripcionCompleta.replace(patronMedico, '').trim();
      }
      
      setNuevaTarifa({
        servicio_tipo: tarifa.servicio_tipo,
        medico_id: medicoId,
        descripcion_base: descripcionBase,
        descripcion: descripcionCompleta,
        precio_particular: tarifa.precio_particular,
        precio_seguro: tarifa.precio_seguro || '',
        precio_convenio: tarifa.precio_convenio || '',
        activo: tarifa.activo
      });
    } else {
      setTarifaEditando(null);
      setNuevaTarifa({
        servicio_tipo: 'consulta',
        medico_id: 'general',
        descripcion_base: '',
        descripcion: '',
        precio_particular: '',
        precio_seguro: '',
        precio_convenio: '',
        activo: 1
      });
    }
    setMostrarModal(true);
  };

  const cerrarModal = () => {
    setMostrarModal(false);
    setTarifaEditando(null);
    // Reset completo del formulario
    setNuevaTarifa({
      servicio_tipo: 'consulta',
      medico_id: 'general',
      descripcion_base: '',
      descripcion: '',
      precio_particular: '',
      precio_seguro: '',
      precio_convenio: '',
      activo: 1
    });
  };

  const guardarTarifa = async () => {
    // Validaciones
    if (!nuevaTarifa.descripcion.trim()) {
      Swal.fire('Error', 'La descripción es obligatoria', 'error');
      return;
    }
    if (!nuevaTarifa.precio_particular || parseFloat(nuevaTarifa.precio_particular) <= 0) {
      Swal.fire('Error', 'El precio particular debe ser mayor a 0', 'error');
      return;
    }

    try {
      const url = tarifaEditando 
        ? `${BASE_URL}api_tarifas.php`
        : `${BASE_URL}api_tarifas.php`;
      
      const method = tarifaEditando ? 'PUT' : 'POST';
      const data = tarifaEditando
        ? { ...nuevaTarifa, id: tarifaEditando.id }
        : nuevaTarifa;

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
          text: tarifaEditando ? 'Tarifa actualizada correctamente' : 'Tarifa creada correctamente',
          icon: 'success',
          confirmButtonText: 'OK'
        });
        cerrarModal();
        cargarTarifas();
      } else {
        Swal.fire('Error', result.error || 'Error al guardar la tarifa', 'error');
      }
    } catch (error) {
      console.error('Error:', error);
      Swal.fire('Error', 'Error de conexión', 'error');
    }
  };

  const eliminarTarifa = async (id, descripcion) => {
    // No permitir eliminar medicamentos ni exámenes de laboratorio
    if (typeof id === 'string' && (id.startsWith('med_') || id.startsWith('lab_'))) {
      Swal.fire({
        title: 'No Eliminable',
        text: id.startsWith('med_') 
          ? 'Los medicamentos se eliminan desde el módulo de farmacia.'
          : 'Los exámenes se eliminan desde el módulo de laboratorio.',
        icon: 'info',
        confirmButtonText: 'Entendido'
      });
      return;
    }
    
    const result = await Swal.fire({
      title: '¿Estás seguro?',
      text: `¿Deseas eliminar la tarifa "${descripcion}"?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#d33'
    });

    if (result.isConfirmed) {
      try {
        const response = await fetch(`${BASE_URL}api_tarifas.php`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ id })
        });

        const data = await response.json();
        if (data.success) {
          Swal.fire('¡Eliminado!', 'La tarifa ha sido eliminada', 'success');
          cargarTarifas();
        } else {
          Swal.fire('Error', data.error || 'Error al eliminar la tarifa', 'error');
        }
      } catch (error) {
        console.error('Error:', error);
        Swal.fire('Error', 'Error de conexión', 'error');
      }
    }
  };

  const cambiarEstado = async (id, nuevoEstado) => {
    try {
      const response = await fetch(`${BASE_URL}api_tarifas.php`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id, activo: nuevoEstado })
      });

      const data = await response.json();
      if (data.success) {
        cargarTarifas();
      } else {
        Swal.fire('Error', data.error || 'Error al cambiar estado', 'error');
      }
    } catch (error) {
      console.error('Error:', error);
      Swal.fire('Error', 'Error de conexión', 'error');
    }
  };

  const tarifasFiltradas = filtroServicio === 'todos' 
  ? tarifas.filter(t => !['laboratorio', 'farmacia'].includes(t.servicio_tipo))
  : tarifas.filter(t => t.servicio_tipo === filtroServicio && !['laboratorio', 'farmacia'].includes(t.servicio_tipo));

  // Cálculos de paginación
  const totalElementos = tarifasFiltradas.length;
  const totalPaginas = Math.ceil(totalElementos / elementosPorPagina);
  const indiceInicio = (paginaActual - 1) * elementosPorPagina;
  const indiceFin = indiceInicio + elementosPorPagina;
  const tarifasPaginadas = tarifasFiltradas.slice(indiceInicio, indiceFin);

  // Funciones de paginación
  const cambiarPagina = (nuevaPagina) => {
    setPaginaActual(nuevaPagina);
  };

  const cambiarElementosPorPagina = (nuevaCantidad) => {
    setElementosPorPagina(nuevaCantidad);
    setPaginaActual(1); // Volver a la primera página
  };

  // Reiniciar a primera página cuando cambie el filtro
  useEffect(() => {
    setPaginaActual(1);
  }, [filtroServicio]);

  // NUEVO: Regenerar descripción cuando se cargan los médicos
  useEffect(() => {
    if (medicos.length > 0 && nuevaTarifa.medico_id && nuevaTarifa.descripcion_base) {
      const descripcionGenerada = generarDescripcion(nuevaTarifa.medico_id, nuevaTarifa.descripcion_base);
      setNuevaTarifa(prev => ({
        ...prev,
        descripcion: descripcionGenerada
      }));
    }
  }, [medicos, nuevaTarifa.medico_id, nuevaTarifa.descripcion_base, generarDescripcion]);

  const obtenerLabelServicio = (tipo) => {
    const servicio = todosLosServicios.find(t => t.value === tipo);
    return servicio ? servicio.label : tipo;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-xl">Cargando tarifas...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-blue-800">💰 Gestión de Tarifas</h1>
        <button
          onClick={() => abrirModal()}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 font-medium"
        >
          ➕ Nueva Tarifa
        </button>
      </div>
      
      {/* Filtros */}
      <div className="bg-white p-4 rounded-lg shadow mb-6">
        <div className="flex items-center gap-4">
          <label className="font-medium text-gray-700">Filtrar por servicio:</label>
          <select
            value={filtroServicio}
            onChange={(e) => setFiltroServicio(e.target.value)}
            className="border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="todos">Todos los servicios</option>
            {todosLosServicios.map(tipo => (
              <option key={tipo.value} value={tipo.value}>{tipo.label}</option>
            ))}
          </select>
          <span className="text-gray-600">
            ({totalElementos} tarifa{totalElementos !== 1 ? 's' : ''} - Página {paginaActual} de {totalPaginas})
          </span>
        </div>
      </div>

      {/* Controles de paginación */}
      <div className="bg-white p-4 rounded-lg shadow mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-3 sm:space-y-0">
          <div className="flex items-center gap-4">
            <label className="font-medium text-gray-700 text-sm sm:text-base">Elementos por página:</label>
            <select
              value={elementosPorPagina}
              onChange={(e) => cambiarElementosPorPagina(parseInt(e.target.value))}
              className="border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={25}>25</option>
            </select>
          </div>
          
          {totalPaginas > 1 && (
            <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto">
              <button
                onClick={() => cambiarPagina(1)}
                disabled={paginaActual === 1}
                className="px-2 sm:px-3 py-1 text-xs sm:text-sm border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 whitespace-nowrap"
              >
                <span className="hidden sm:inline">Primera</span>
                <span className="sm:hidden">❮❮</span>
              </button>
              <button
                onClick={() => cambiarPagina(paginaActual - 1)}
                disabled={paginaActual === 1}
                className="px-2 sm:px-3 py-1 text-xs sm:text-sm border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
              >
                <span className="hidden sm:inline">Anterior</span>
                <span className="sm:hidden">❮</span>
              </button>
              
              {/* Números de página */}
              <div className="hidden sm:flex items-center gap-2">
                {Array.from({ length: Math.min(5, totalPaginas) }, (_, i) => {
                  let pageNumber;
                  if (totalPaginas <= 5) {
                    pageNumber = i + 1;
                  } else {
                    // Lógica para mostrar 5 páginas centradas en la actual
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
              </div>
              
              {/* Números de página para móvil (solo 3) */}
              <div className="flex sm:hidden items-center gap-1">
                {Array.from({ length: Math.min(3, totalPaginas) }, (_, i) => {
                  let pageNumber;
                  if (totalPaginas <= 3) {
                    pageNumber = i + 1;
                  } else {
                    // Lógica para mostrar 3 páginas centradas en la actual
                    const start = Math.max(1, Math.min(paginaActual - 1, totalPaginas - 2));
                    pageNumber = start + i;
                  }
                  
                  return (
                    <button
                      key={`mobile-${pageNumber}`}
                      onClick={() => cambiarPagina(pageNumber)}
                      className={`px-2 py-1 text-xs border rounded ${
                        paginaActual === pageNumber
                          ? 'bg-blue-500 text-white'
                          : 'hover:bg-gray-100'
                      }`}
                    >
                      {pageNumber}
                    </button>
                  );
                })}
              </div>
              
              <button
                onClick={() => cambiarPagina(paginaActual + 1)}
                disabled={paginaActual === totalPaginas}
                className="px-2 sm:px-3 py-1 text-xs sm:text-sm border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
              >
                <span className="hidden sm:inline">Siguiente</span>
                <span className="sm:hidden">❯</span>
              </button>
              <button
                onClick={() => cambiarPagina(totalPaginas)}
                disabled={paginaActual === totalPaginas}
                className="px-2 sm:px-3 py-1 text-xs sm:text-sm border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 whitespace-nowrap"
              >
                <span className="hidden sm:inline">Última</span>
                <span className="sm:hidden">❯❯</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tabla de tarifas */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Servicio
                </th>
                <th className="hidden sm:table-cell px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Descripción
                </th>
                <th className="px-3 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Particular
                </th>
                <th className="hidden lg:table-cell px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Seguro
                </th>
                <th className="hidden lg:table-cell px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Convenio
                </th>
                <th className="hidden md:table-cell px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Estado
                </th>
                <th className="px-3 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {tarifasPaginadas.map((tarifa) => (
                <tr key={tarifa.id} className="hover:bg-gray-50">
                  <td className="px-3 md:px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-col sm:flex-row sm:items-center">
                      <div className="flex items-center mb-1 sm:mb-0">
                        <span className="text-lg mr-2">
                          {tarifa.fuente === 'medicamentos' ? '💊' : 
                           tarifa.fuente === 'examenes_laboratorio' ? '🔬' : '🏥'}
                        </span>
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {obtenerLabelServicio(tarifa.servicio_tipo)}
                        </span>
                      </div>
                      {tarifa.fuente && tarifa.fuente !== 'tarifas' && (
                        <span className="ml-0 sm:ml-2 px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">
                          {tarifa.fuente === 'medicamentos' ? 'Desde Farmacia' : 'Desde Laboratorio'}
                        </span>
                      )}
                      {/* Mostrar descripción en móvil */}
                      <div className="sm:hidden mt-2 text-sm font-medium text-gray-900">
                        {tarifa.descripcion}
                      </div>
                    </div>
                  </td>
                  <td className="hidden sm:table-cell px-6 py-4">
                    <div className="text-sm font-medium text-gray-900">{tarifa.descripcion}</div>
                  </td>
                  <td className="px-3 md:px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    <div className="font-medium">S/ {parseFloat(tarifa.precio_particular).toFixed(2)}</div>
                    {/* Mostrar otros precios en móvil cuando existen */}
                    <div className="block lg:hidden text-xs text-gray-500 mt-1">
                      {tarifa.precio_seguro && (
                        <div>Seguro: S/ {parseFloat(tarifa.precio_seguro).toFixed(2)}</div>
                      )}
                      {tarifa.precio_convenio && (
                        <div>Convenio: S/ {parseFloat(tarifa.precio_convenio).toFixed(2)}</div>
                      )}
                    </div>
                  </td>
                  <td className="hidden lg:table-cell px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {tarifa.precio_seguro ? `S/ ${parseFloat(tarifa.precio_seguro).toFixed(2)}` : '-'}
                  </td>
                  <td className="hidden lg:table-cell px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {tarifa.precio_convenio ? `S/ ${parseFloat(tarifa.precio_convenio).toFixed(2)}` : '-'}
                  </td>
                  <td className="hidden md:table-cell px-6 py-4 whitespace-nowrap">
                    <button
                      onClick={() => cambiarEstado(tarifa.id, tarifa.activo === 1 ? 0 : 1)}
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        tarifa.activo === 1 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {tarifa.activo === 1 ? '✓ Activo' : '✗ Inactivo'}
                    </button>
                  </td>
                  <td className="px-3 md:px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex flex-col sm:flex-row sm:space-x-2 space-y-1 sm:space-y-0">
                      {/* Mostrar estado en móvil */}
                      <div className="block md:hidden mb-2">
                        <button
                          onClick={() => cambiarEstado(tarifa.id, tarifa.activo === 1 ? 0 : 1)}
                          className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            tarifa.activo === 1 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {tarifa.activo === 1 ? '✓ Activo' : '✗ Inactivo'}
                        </button>
                      </div>
                      
                      {tarifa.fuente === 'medicamentos' ? (
                        <button
                          onClick={() => window.open('/farmacia-medicamentos', '_blank')}
                          className="text-blue-600 hover:text-blue-900 px-2 sm:px-3 py-1 bg-blue-100 rounded text-xs sm:text-sm"
                        >
                          🏥 <span className="hidden sm:inline">Gestionar en</span> Farmacia
                        </button>
                      ) : tarifa.fuente === 'examenes_laboratorio' ? (
                        <button
                          onClick={() => window.open('/laboratorio-examenes', '_blank')}
                          className="text-green-600 hover:text-green-900 px-2 sm:px-3 py-1 bg-green-100 rounded text-xs sm:text-sm"
                        >
                          🧪 <span className="hidden sm:inline">Gestionar en</span> Lab
                        </button>
                      ) : (
                        <div className="flex flex-col sm:flex-row space-y-1 sm:space-y-0 sm:space-x-2">
                          <button
                            onClick={() => abrirModal(tarifa)}
                            className="text-blue-600 hover:text-blue-900 px-2 py-1 bg-blue-100 rounded text-xs sm:text-sm"
                          >
                            ✏️ Editar
                          </button>
                          <button
                            onClick={() => eliminarTarifa(tarifa.id, tarifa.descripcion)}
                            className="text-red-600 hover:text-red-900 px-2 py-1 bg-red-100 rounded text-xs sm:text-sm"
                          >
                            🗑️ Eliminar
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {tarifasFiltradas.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            No hay tarifas registradas para este filtro
          </div>
        )}
      </div>

      {/* Modal para crear/editar tarifas */}
      {mostrarModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h2 className="text-xl font-bold mb-4">
              {tarifaEditando ? 'Editar Tarifa' : 'Nueva Tarifa'}
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tipo de Servicio *
                </label>
                <select
                  value={nuevaTarifa.servicio_tipo}
                  onChange={(e) => setNuevaTarifa({...nuevaTarifa, servicio_tipo: e.target.value})}
                  className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {serviciosMedicos.map(tipo => (
                    <option key={tipo.value} value={tipo.value}>{tipo.label}</option>
                  ))}
                </select>
              </div>

              {/* NUEVO: Selector de Médico */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Médico * {medicos.length === 0 && <span className="text-gray-400">(Cargando...)</span>}
                </label>
                <select
                  value={nuevaTarifa.medico_id}
                  onChange={(e) => {
                    const medicoId = e.target.value;
                    const descripcionGenerada = generarDescripcion(medicoId, nuevaTarifa.descripcion_base);
                    setNuevaTarifa({
                      ...nuevaTarifa, 
                      medico_id: medicoId,
                      descripcion: descripcionGenerada
                    });
                  }}
                  className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={medicos.length === 0}
                >
                  <option value="general">Tarifa General (Todos los médicos)</option>
                  {medicos.map(medico => (
                    <option key={medico.id} value={medico.id}>
                      Dr(a). {medico.nombre} {medico.apellido || ''} - {medico.especialidad || 'General'}
                    </option>
                  ))}
                </select>
                {medicos.length === 0 && (
                  <div className="text-sm text-orange-600 mt-1">
                    ⚠️ No se pudieron cargar los médicos. Verifique la conexión.
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Descripción Base *
                </label>
                <input
                  type="text"
                  value={nuevaTarifa.descripcion_base}
                  onChange={(e) => {
                    const descripcionBase = e.target.value;
                    const descripcionGenerada = generarDescripcion(nuevaTarifa.medico_id, descripcionBase);
                    setNuevaTarifa({
                      ...nuevaTarifa, 
                      descripcion_base: descripcionBase,
                      descripcion: descripcionGenerada
                    });
                  }}
                  className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Ej: Consulta Especializada, Procedimiento, etc."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Descripción Final (Se genera automáticamente)
                </label>
                <input
                  type="text"
                  value={nuevaTarifa.descripcion}
                  readOnly
                  className="w-full border rounded px-3 py-2 bg-gray-100 text-gray-600"
                  placeholder="Se generará automáticamente al seleccionar médico y descripción base"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Precio Particular * (S/)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={nuevaTarifa.precio_particular}
                  onChange={(e) => setNuevaTarifa({...nuevaTarifa, precio_particular: e.target.value})}
                  className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Precio Seguro (S/) - Opcional
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={nuevaTarifa.precio_seguro}
                  onChange={(e) => setNuevaTarifa({...nuevaTarifa, precio_seguro: e.target.value})}
                  className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Precio Convenio (S/) - Opcional
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={nuevaTarifa.precio_convenio}
                  onChange={(e) => setNuevaTarifa({...nuevaTarifa, precio_convenio: e.target.value})}
                  className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={nuevaTarifa.activo === 1}
                    onChange={(e) => setNuevaTarifa({...nuevaTarifa, activo: e.target.checked ? 1 : 0})}
                    className="mr-2"
                  />
                  <span className="text-sm text-gray-700">Activo</span>
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
                onClick={guardarTarifa}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                {tarifaEditando ? 'Actualizar' : 'Crear'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default GestionTarifasPage;