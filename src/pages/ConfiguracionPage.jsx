import { useState, useEffect } from 'react';
import Swal from 'sweetalert2';
import { BASE_URL } from '../config/config.js';

function ConfiguracionPage() {
  const [configuracion, setConfiguracion] = useState({
    nombre_clinica: '',
    direccion: '',
    telefono: '',
    email: '',
    horario_atencion: '',
    logo_url: '',
    website: '',
    ruc: '',
    especialidades: '',
    mision: '',
    vision: '',
    valores: '',
    director_general: '',
    jefe_enfermeria: '',
    contacto_emergencias: ''
  });

  const [loading, setLoading] = useState(false);
  const [cargandoDatos, setCargandoDatos] = useState(true);

  // Cargar configuración al montar el componente
  useEffect(() => {
    cargarConfiguracion();
  }, []);

  const cargarConfiguracion = async () => {
    try {
      setCargandoDatos(true);
      console.log('🔍 Intentando cargar configuración...');
      
      const response = await fetch(BASE_URL + 'api_get_configuracion.php', {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      console.log('📡 Respuesta del servidor:', response.status, response.statusText);

      if (response.ok) {
        const result = await response.json();
        console.log('📋 Resultado:', result);
        if (result.success) {
          setConfiguracion(result.data);
        } else {
          throw new Error(result.error || 'Error al cargar la configuración');
        }
      } else if (response.status === 401) {
        // Error de autenticación específico
        const errorResult = await response.json();
        throw new Error('🔒 Acceso denegado: ' + (errorResult.error || 'No está autenticado como administrador'));
      } else {
        const errorText = await response.text();
        console.error('❌ Error del servidor:', errorText);
        throw new Error(`Error del servidor: ${response.status} - ${errorText}`);
      }
    } catch (error) {
      console.error('🚨 Error al cargar configuración:', error);
      
      // Si es error de autenticación, mostrar mensaje específico
      if (error.message.includes('🔒 Acceso denegado')) {
        Swal.fire({
          title: '🔒 Acceso Denegado',
          text: 'Necesita estar autenticado como administrador para ver la configuración.',
          icon: 'warning',
          confirmButtonText: 'Ir a Login',
          showCancelButton: true,
          cancelButtonText: 'Cancelar'
        }).then((result) => {
          if (result.isConfirmed) {
            window.location.href = '/';
          }
        });
      } else {
        Swal.fire({
          title: 'Error',
          text: 'No se pudo cargar la configuración: ' + error.message,
          icon: 'error',
          confirmButtonText: 'OK'
        });
      }
    } finally {
      setCargandoDatos(false);
    }
  };

  const manejarCambio = (campo, valor) => {
    setConfiguracion(prev => ({
      ...prev,
      [campo]: valor
    }));
  };

  const guardarConfiguracion = async () => {
    // Validar campos requeridos
    if (!configuracion.nombre_clinica || !configuracion.direccion || 
        !configuracion.telefono || !configuracion.email) {
      Swal.fire({
        title: 'Error',
        text: 'Por favor, complete todos los campos obligatorios.',
        icon: 'error',
        confirmButtonText: 'OK'
      });
      return;
    }

    // Validar formato de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(configuracion.email)) {
      Swal.fire({
        title: 'Error',
        text: 'Por favor, ingrese un email válido.',
        icon: 'error',
        confirmButtonText: 'OK'
      });
      return;
    }

    setLoading(true);
    
    try {
      console.log('💾 Intentando guardar configuración...', configuracion);
      
      const response = await fetch(BASE_URL + 'api_configuracion.php', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(configuracion)
      });

      console.log('📡 Respuesta del servidor:', response.status, response.statusText);

      if (response.ok) {
        const result = await response.json();
        console.log('📋 Resultado:', result);
        if (result.success) {
          Swal.fire({
            title: '¡Configuración guardada!',
            text: result.message || 'Los cambios se han aplicado exitosamente.',
            icon: 'success',
            confirmButtonText: 'OK'
          });
        } else {
          throw new Error(result.error || 'Error al guardar la configuración');
        }
      } else if (response.status === 401) {
        // Error de autenticación específico
        await response.json(); // Consumir la respuesta
        Swal.fire({
          title: '🔒 Acceso Denegado',
          text: 'Necesita estar autenticado como administrador para modificar la configuración.',
          icon: 'warning',
          confirmButtonText: 'Ir a Login',
          showCancelButton: true,
          cancelButtonText: 'Cancelar'
        }).then((result) => {
          if (result.isConfirmed) {
            window.location.href = '/';
          }
        });
        return; // Salir sin mostrar el error genérico
      } else {
        const errorText = await response.text();
        console.error('❌ Error del servidor:', errorText);
        throw new Error(`Error del servidor: ${response.status} - ${errorText}`);
      }
    } catch (error) {
      console.error('🚨 Error al guardar configuración:', error);
      Swal.fire({
        title: 'Error',
        text: 'No se pudo guardar la configuración: ' + error.message,
        icon: 'error',
        confirmButtonText: 'OK'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6 text-blue-800">⚙️ Configuración del Sistema</h1>
      
      {cargandoDatos ? (
        <div className="bg-white rounded-lg shadow-lg p-6 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando configuración...</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-800">Información de la Clínica</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nombre de la Clínica *
              </label>
              <input
                type="text"
                value={configuracion.nombre_clinica}
                onChange={(e) => manejarCambio('nombre_clinica', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Teléfono *
              </label>
              <input
                type="tel"
                value={configuracion.telefono}
                onChange={(e) => manejarCambio('telefono', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email *
              </label>
              <input
                type="email"
                value={configuracion.email}
                onChange={(e) => manejarCambio('email', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                RUC (opcional)
              </label>
              <input
                type="text"
                value={configuracion.ruc || ''}
                onChange={(e) => manejarCambio('ruc', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Dirección *
              </label>
              <input
                type="text"
                value={configuracion.direccion}
                onChange={(e) => manejarCambio('direccion', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Director General
              </label>
              <input
                type="text"
                value={configuracion.director_general || ''}
                onChange={(e) => manejarCambio('director_general', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Dr. Juan Pérez"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Jefe de Enfermería
              </label>
              <input
                type="text"
                value={configuracion.jefe_enfermeria || ''}
                onChange={(e) => manejarCambio('jefe_enfermeria', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enf. María González"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                URL del Logo (opcional)
              </label>
              <input
                type="url"
                value={configuracion.logo_url || ''}
                onChange={(e) => manejarCambio('logo_url', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="https://ejemplo.com/logo.png"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Sitio Web (opcional)
              </label>
              <input
                type="url"
                value={configuracion.website || ''}
                onChange={(e) => manejarCambio('website', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="https://www.ejemplo.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Contacto de Emergencias
              </label>
              <input
                type="tel"
                value={configuracion.contacto_emergencias || ''}
                onChange={(e) => manejarCambio('contacto_emergencias', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Emergencias 24h: +51 987-654-321"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Especialidades
              </label>
              <textarea
                value={configuracion.especialidades || ''}
                onChange={(e) => manejarCambio('especialidades', e.target.value)}
                rows="2"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Medicina General, Pediatría, Ginecología, Traumatología..."
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Horario de Atención
              </label>
              <textarea
                value={configuracion.horario_atencion || ''}
                onChange={(e) => manejarCambio('horario_atencion', e.target.value)}
                rows="3"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Lunes a Viernes: 7:00 AM - 8:00 PM..."
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Misión Institucional
              </label>
              <textarea
                value={configuracion.mision || ''}
                onChange={(e) => manejarCambio('mision', e.target.value)}
                rows="3"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Brindar servicios de salud de calidad..."
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Visión Institucional
              </label>
              <textarea
                value={configuracion.vision || ''}
                onChange={(e) => manejarCambio('vision', e.target.value)}
                rows="3"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Ser el centro de salud de referencia..."
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Valores Institucionales
              </label>
              <textarea
                value={configuracion.valores || ''}
                onChange={(e) => manejarCambio('valores', e.target.value)}
                rows="3"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Compromiso, Excelencia, Humanización, Integridad..."
              />
            </div>
          </div>

          <div className="mt-8 pt-6 border-t">
            <div className="flex justify-between items-center">
              <p className="text-sm text-gray-500">* Campos obligatorios</p>
              <button
                onClick={guardarConfiguracion}
                disabled={loading}
                className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 font-medium transition-colors"
              >
                {loading ? (
                  <div className="flex items-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Guardando...
                  </div>
                ) : (
                  '💾 Guardar Configuración'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-yellow-800 mb-2">ℹ️ Información del Sistema</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <strong>Versión:</strong> 1.0.0
          </div>
          <div>
            <strong>Base de datos:</strong> MySQL
          </div>
          <div>
            <strong>Servidor web:</strong> Apache (Laragon)
          </div>
          <div>
            <strong>Framework:</strong> React + Vite
          </div>
        </div>
      </div>
    </div>
  );
}

export default ConfiguracionPage;