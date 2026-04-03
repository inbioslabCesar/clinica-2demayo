import { useState, useEffect } from 'react';
import Swal from 'sweetalert2';
import { BASE_URL } from '../config/config.js';

const LOGO_SIZE_OPTIONS = [
  { value: '', label: 'Predeterminado' },
  { value: 'sm', label: 'Pequeño' },
  { value: 'md', label: 'Mediano' },
  { value: 'lg', label: 'Grande' },
  { value: 'xl', label: 'Extra grande' },
  { value: 'xxl', label: 'Extra extra grande (XXL)' },
];

const LOGO_SHAPE_OPTIONS = [
  { value: 'auto', label: 'Automático (detectar forma)' },
  { value: 'round', label: 'Circular' },
  { value: 'wide', label: 'Horizontal / ovalado' },
];



function ConfiguracionPage() {
  const normalizeLogoForSave = (value) => {
    let raw = String(value || '').trim();
    if (!raw) return '';
    raw = raw.replace(/\\/g, '/');
    const uploadsMatch = raw.match(/(?:^|\/)(uploads\/[^?#\s]+)$/i);
    if (uploadsMatch && uploadsMatch[1]) {
      return uploadsMatch[1].replace(/^\/+/, '');
    }
    raw = raw.replace(/^\.\//, '').replace(/^\/+/, '');
    return raw;
  };

  const resolveLogoPreviewUrl = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^(https?:\/\/|data:|blob:)/i.test(raw)) return raw;
    const base = String(BASE_URL || '').replace(/\/+$/, '');
    return `${base}/${raw.replace(/^\/+/, '')}`;
  };

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
    contacto_emergencias: '',
    celular: '',
    google_maps_embed: '',
    slogan: '',
    slogan_color: '#3A4FA3',
    nombre_color: '',
    nombre_font_size: '',
    logo_size_sistema: '',
    logo_size_publico: '',
    logo_shape_sistema: 'auto',
    hc_template_mode: 'auto',
    hc_template_single_id: '',
  });

  const [loading, setLoading] = useState(false);
  const [cargandoDatos, setCargandoDatos] = useState(true);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoPreview, setLogoPreview] = useState('');

  // Cargar configuración al montar el componente
  useEffect(() => {
    cargarConfiguracion();
  }, []);

  const cargarConfiguracion = async () => {
    try {
      setCargandoDatos(true);
      
      const response = await fetch(BASE_URL + 'api_get_configuracion.php', {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          const incoming = { ...(result.data || {}) };
          const incomingSingleId = String(incoming.hc_template_single_id || '').trim();
          const incomingMode = String(incoming.hc_template_mode || 'auto').trim().toLowerCase();
          // Legacy fix: if old config stored "default" as single template, switch to automatic mode.
          if (incomingMode === 'single' && incomingSingleId === 'default') {
            incoming.hc_template_mode = 'auto';
            incoming.hc_template_single_id = '';
          }
          setConfiguracion(prev => ({ ...prev, ...incoming }));
          // mostrar preview si hay logo
          if (result.data && result.data.logo_url) setLogoPreview(result.data.logo_url);
        } else {
          throw new Error(result.error || 'Error al cargar la configuración');
        }
      } else if (response.status === 401) {
        // Error de autenticación específico
        const errorResult = await response.json();
        throw new Error('🔒 Acceso denegado: ' + (errorResult.error || 'No está autenticado como administrador'));
      } else {
        const errorText = await response.text();
        // Eliminado log de error del servidor
        throw new Error(`Error del servidor: ${response.status} - ${errorText}`);
      }
    } catch (error) {
      // Eliminado log de error al cargar configuración
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

  const subirArchivoLogo = async (file) => {
    const form = new FormData();
    form.append('logo', file);
    const resp = await fetch(BASE_URL + 'api_upload_logo.php', {
      method: 'POST',
      credentials: 'include',
      body: form
    });
    const j = await resp.json();
    if (!(resp.ok && j.success && j.path)) {
      throw new Error(j.error || 'Error subiendo archivo');
    }
    return String(j.path);
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
      let logoUrlFinal = normalizeLogoForSave(configuracion.logo_url);

      if (configuracion._logo_file) {
        setUploadingLogo(true);
        const uploadedPath = await subirArchivoLogo(configuracion._logo_file);
        logoUrlFinal = normalizeLogoForSave(uploadedPath);
      }

      const { _logo_file, ...restConfig } = configuracion;
      const payload = {
        ...restConfig,
        logo_url: logoUrlFinal,
      };

      const response = await fetch(BASE_URL + 'api_configuracion.php', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          Swal.fire({
            title: '¡Configuración guardada!',
            text: result.message || 'Los cambios se han aplicado exitosamente.',
            icon: 'success',
            confirmButtonText: 'OK'
          });
          // actualizar preview si guardamos una ruta relativa
          if (payload.logo_url) {
            setLogoPreview(payload.logo_url);
            setConfiguracion(prev => ({ ...prev, logo_url: payload.logo_url, _logo_file: null }));
          }
              window.dispatchEvent(new CustomEvent('clinica-config-updated', {
                detail: {
                  logo_url: payload.logo_url || '',
                  nombre_clinica: payload.nombre_clinica || '',
                  logo_size_sistema: payload.logo_size_sistema || '',
                  logo_size_publico: payload.logo_size_publico || '',
                  logo_shape_sistema: payload.logo_shape_sistema || 'auto',
                  hc_template_mode: payload.hc_template_mode || 'auto',
                  hc_template_single_id: payload.hc_template_single_id || '',
                  updated_at: Date.now()
                }
              }));
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
      setUploadingLogo(false);
      setLoading(false);
    }
  };

  const handleFileChange = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    // Preview local
    const url = URL.createObjectURL(f);
    setLogoPreview(url);
    // Store file temporarily on the input (we will upload on demand)
    setConfiguracion(prev => ({ ...prev, _logo_file: f }));
  };

  const uploadLogo = async () => {
    const file = configuracion._logo_file;
    if (!file) {
      Swal.fire({ title: 'Info', text: 'Seleccione un archivo primero.', icon: 'info' });
      return;
    }
    setUploadingLogo(true);
    try {
      const uploadedPath = await subirArchivoLogo(file);
      if (uploadedPath) {
        // Guardar la ruta en el state para cuando pulse "Guardar Configuración"
        setConfiguracion(prev => ({ ...prev, logo_url: uploadedPath, _logo_file: null }));
        // Si la ruta es relativa, convertir a URL pública para preview en dev
        setLogoPreview(uploadedPath);
            window.dispatchEvent(new CustomEvent('clinica-config-updated', {
              detail: {
                logo_url: uploadedPath,
                nombre_clinica: configuracion.nombre_clinica || '',
                logo_size_sistema: configuracion.logo_size_sistema || '',
                logo_size_publico: configuracion.logo_size_publico || '',
                logo_shape_sistema: configuracion.logo_shape_sistema || 'auto',
                hc_template_mode: configuracion.hc_template_mode || 'auto',
                hc_template_single_id: configuracion.hc_template_single_id || '',
                updated_at: Date.now()
              }
            }));
        Swal.fire({ title: 'Listo', text: 'Logo subido correctamente.', icon: 'success' });
      }
    } catch (err) {
      console.error('Error upload logo', err);
      Swal.fire({ title: 'Error', text: 'No se pudo subir el logo: ' + err.message, icon: 'error' });
    } finally {
      setUploadingLogo(false);
    }
  };

  const clearLogo = () => {
    setConfiguracion(prev => ({ ...prev, logo_url: '' }));
    setLogoPreview('');
    window.dispatchEvent(new CustomEvent('clinica-config-updated', {
      detail: {
        logo_url: '',
        nombre_clinica: configuracion.nombre_clinica || '',
        logo_size_sistema: configuracion.logo_size_sistema || '',
        logo_size_publico: configuracion.logo_size_publico || '',
        logo_shape_sistema: configuracion.logo_shape_sistema || 'auto',
        hc_template_mode: configuracion.hc_template_mode || 'auto',
        hc_template_single_id: configuracion.hc_template_single_id || '',
        updated_at: Date.now()
      }
    }));
  };

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6 text-blue-800">⚙️ Configuración del Sistema</h1>
      <div className="mb-6 rounded-lg border border-cyan-200 bg-cyan-50 p-4">
        <p className="text-sm text-cyan-900 font-semibold">Plantillas de Historia Clinica</p>
        <p className="text-xs text-cyan-800 mt-1">
          Para configurar campos sugeridos por especialidad entra a: Configuracion &gt; Plantillas HC.
        </p>
        <button
          type="button"
          className="mt-3 px-3 py-2 text-xs rounded-md bg-cyan-600 text-white hover:bg-cyan-700"
          onClick={() => (window.location.href = '/configuracion/plantillas-hc')}
        >
          Ir a Plantillas HC
        </button>
      </div>
      
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
              <div className="mt-2 flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-500">Color:</label>
                  <input
                    type="color"
                    value={configuracion.nombre_color || '#E85D8E'}
                    onChange={(e) => manejarCambio('nombre_color', e.target.value)}
                    className="h-8 w-10 rounded border border-gray-300 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={configuracion.nombre_color || ''}
                    onChange={(e) => manejarCambio('nombre_color', e.target.value)}
                    className="w-24 px-2 py-1 text-xs border border-gray-300 rounded-md font-mono"
                    placeholder="#E85D8E"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-500">Tamaño:</label>
                  <select
                    value={configuracion.nombre_font_size || ''}
                    onChange={(e) => manejarCambio('nombre_font_size', e.target.value)}
                    className="px-2 py-1 text-xs border border-gray-300 rounded-md"
                  >
                    <option value="">Por defecto</option>
                    <option value="1.25rem">Pequeño</option>
                    <option value="1.5rem">Mediano</option>
                    <option value="1.875rem">Grande</option>
                    <option value="2.25rem">Extra Grande</option>
                    <option value="3rem">Muy Grande</option>
                  </select>
                </div>
              </div>
              {configuracion.nombre_clinica && (
                <p className="mt-1 text-xs font-semibold" style={{ color: configuracion.nombre_color || '#E85D8E', fontSize: configuracion.nombre_font_size || '1.125rem' }}>
                  Vista previa: {configuracion.nombre_clinica}
                </p>
              )}
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
                Eslogan (opcional)
              </label>
              <input
                type="text"
                value={configuracion.slogan || ''}
                onChange={(e) => manejarCambio('slogan', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Salud Integral Femenina"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Color del Eslogan
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={configuracion.slogan_color || '#3A4FA3'}
                  onChange={(e) => manejarCambio('slogan_color', e.target.value)}
                  className="h-10 w-14 rounded border border-gray-300 cursor-pointer"
                />
                <input
                  type="text"
                  value={configuracion.slogan_color || '#3A4FA3'}
                  onChange={(e) => manejarCambio('slogan_color', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                  placeholder="#3A4FA3"
                />
              </div>
              {configuracion.slogan && (
                <p className="mt-2 text-sm font-medium" style={{ color: configuracion.slogan_color || '#3A4FA3' }}>
                  Vista previa: {configuracion.slogan}
                </p>
              )}
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
                URL del Logo (opcional) / Subir logo
              </label>
              <input
                type="url"
                value={configuracion.logo_url || ''}
                onChange={(e) => manejarCambio('logo_url', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
                placeholder="https://ejemplo.com/logo.png"
              />
              <div className="flex items-center gap-2">
                <input type="file" accept="image/*" onChange={handleFileChange} className="text-sm" />
                <button
                  type="button"
                  onClick={uploadLogo}
                  disabled={uploadingLogo}
                  className="bg-green-600 text-white px-3 py-1 rounded-md hover:bg-green-700 disabled:bg-gray-300 text-sm"
                >
                  {uploadingLogo ? 'Subiendo...' : 'Subir Logo'}
                </button>
                <button
                  type="button"
                  onClick={clearLogo}
                  className="bg-red-100 text-red-700 px-3 py-1 rounded-md hover:bg-red-200 text-sm"
                >
                  Eliminar
                </button>
              </div>
              {logoPreview ? (
                <div className="mt-3">
                  <div className="text-xs text-gray-600 mb-1">Vista previa:</div>
                  <img
                    src={resolveLogoPreviewUrl(logoPreview)}
                    alt="Logo preview"
                    style={{ maxHeight: 96 }}
                  />
                </div>
              ) : null}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tamaño del logo en el sistema
              </label>
              <select
                value={configuracion.logo_size_sistema || ''}
                onChange={(e) => manejarCambio('logo_size_sistema', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {LOGO_SIZE_OPTIONS.map((option) => (
                  <option key={option.value || 'default-system'} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500">
                Se aplica al logo del sidebar y la navbar del sistema.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Forma del logo en el sistema
              </label>
              <select
                value={configuracion.logo_shape_sistema || 'auto'}
                onChange={(e) => manejarCambio('logo_shape_sistema', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {LOGO_SHAPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500">
                Útil si el logo trae mucho fondo transparente y la detección automática no acierta.
              </p>
            </div>

            <div className="mb-6 rounded-lg border border-cyan-200 bg-cyan-50 p-4">
              <p className="text-sm text-cyan-900 font-semibold">Plantillas de Historia Clinica</p>
              <p className="text-xs text-cyan-800 mt-1">
                Para configurar plantillas y decidir si usas una fija o automática por especialidad, ve a: Configuracion &gt; Plantillas HC.
              </p>
              <button
                type="button"
                className="mt-3 px-3 py-2 text-xs rounded-md bg-cyan-600 text-white hover:bg-cyan-700"
                onClick={() => (window.location.href = '/configuracion/plantillas-hc')}
              >
                Ir a Plantillas HC
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tamaño del logo en la página pública
              </label>
              <select
                value={configuracion.logo_size_publico || ''}
                onChange={(e) => manejarCambio('logo_size_publico', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {LOGO_SIZE_OPTIONS.map((option) => (
                  <option key={option.value || 'default-public'} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500">
                Se aplica al branding visible en la web pública.
              </p>
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

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Celular / WhatsApp
              </label>
              <input
                type="tel"
                value={configuracion.celular || ''}
                onChange={(e) => manejarCambio('celular', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="+51 987 654 321"
              />
              <p className="text-xs text-gray-500 mt-1">Este número se usará para el botón flotante de WhatsApp en la página pública.</p>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Código de Google Maps (iframe embed)
              </label>
              <textarea
                value={configuracion.google_maps_embed || ''}
                onChange={(e) => manejarCambio('google_maps_embed', e.target.value)}
                rows="3"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-xs"
                placeholder='https://www.google.com/maps/embed?pb=!1m18!1m12...'
              />
              <p className="text-xs text-gray-500 mt-1">Pega aquí la URL del iframe de Google Maps. Ve a Google Maps → Compartir → Incorporar un mapa → copia solo la URL del src.</p>
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