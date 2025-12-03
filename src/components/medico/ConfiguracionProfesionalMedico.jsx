import { useState, useRef, useEffect } from "react";
import { BASE_URL } from "../../config/config";

export default function ConfiguracionProfesionalMedico({ isOpen, onClose }) {
  // Estados para la información del médico
  const [infoProfesional, setInfoProfesional] = useState({
    nombre: '',
    apellido: '',
    especialidad: '',
    cmp: '',
    rne: '',
    firma: null
  });
  
  const [infoOriginal, setInfoOriginal] = useState({});
  const [loading, setLoading] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [previewFirma, setPreviewFirma] = useState(null);
  const [nuevaFirma, setNuevaFirma] = useState(null);
  const fileInputRef = useRef(null);

  // Cargar información existente al abrir el modal
  useEffect(() => {
    if (isOpen) {
      cargarInfoProfesional();
    }
  }, [isOpen]);

  const cargarInfoProfesional = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${BASE_URL}api_info_profesional_medico.php`, {
        credentials: 'include'
      });
      const data = await response.json();
      
      if (data.success && data.medico) {
        const info = {
          nombre: data.medico.nombre || '',
          apellido: data.medico.apellido || '',
          especialidad: data.medico.especialidad || '',
          cmp: data.medico.cmp || '',
          rne: data.medico.rne || '',
          firma: data.medico.firma
        };
        setInfoProfesional(info);
        setInfoOriginal(info);
        setPreviewFirma(data.medico.firma);
      }
    } catch (error) {
      console.error('Error al cargar información profesional:', error);
      setMensaje("Error al cargar la información profesional");
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field, value) => {
    setInfoProfesional(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Validar tipo de archivo
    if (!file.type.match(/^image\/(png|jpeg|jpg)$/)) {
      setMensaje("Solo se permiten archivos PNG, JPG o JPEG");
      return;
    }

    // Validar tamaño (máximo 2MB)
    if (file.size > 2 * 1024 * 1024) {
      setMensaje("El archivo es demasiado grande. Máximo 2MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      setNuevaFirma(dataUrl);
      setPreviewFirma(dataUrl);
      setInfoProfesional(prev => ({ ...prev, firma: dataUrl }));
      setMensaje("");
    };
    reader.readAsDataURL(file);
  };

  const guardarInformacion = async () => {
    try {
      setLoading(true);
      setMensaje("");

      // Validaciones básicas
      if (!infoProfesional.nombre.trim()) {
        setMensaje("❌ El nombre es obligatorio");
        return;
      }

      if (!infoProfesional.apellido.trim()) {
        setMensaje("❌ El apellido es obligatorio");
        return;
      }

      if (!infoProfesional.cmp.trim()) {
        setMensaje("❌ El código CMP es obligatorio");
        return;
      }

      const response = await fetch(`${BASE_URL}api_info_profesional_medico.php`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(infoProfesional)
      });

      const data = await response.json();

      if (data.success) {
        setMensaje("✅ Información profesional guardada exitosamente");
        setInfoOriginal(infoProfesional);
        setNuevaFirma(null);
        setTimeout(() => {
          onClose();
        }, 2000);
      } else {
        setMensaje("❌ " + (data.error || "Error al guardar la información"));
      }
    } catch (error) {
      console.error('Error al guardar información:', error);
      setMensaje("❌ Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  const eliminarFirma = async () => {
    if (!confirm("¿Estás seguro de que deseas eliminar tu firma digital?")) {
      return;
    }

    try {
      setLoading(true);
      setMensaje("");

      const response = await fetch(`${BASE_URL}api_info_profesional_medico.php`, {
        method: 'DELETE',
        credentials: 'include'
      });

      const data = await response.json();

      if (data.success) {
        setMensaje("✅ Firma eliminada exitosamente");
        setInfoProfesional(prev => ({ ...prev, firma: null }));
        setPreviewFirma(null);
        setNuevaFirma(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      } else {
        setMensaje("❌ " + (data.error || "Error al eliminar la firma"));
      }
    } catch (error) {
      console.error('Error al eliminar firma:', error);
      setMensaje("❌ Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  const resetearFormulario = () => {
    setInfoProfesional(infoOriginal);
    setPreviewFirma(infoOriginal.firma);
    setNuevaFirma(null);
    setMensaje("");
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const haycambios = () => {
    return JSON.stringify(infoProfesional) !== JSON.stringify(infoOriginal);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-6 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-bold">👨‍⚕️ Configuración Profesional</h2>
                <p className="text-blue-100 text-sm">Gestiona tu información profesional y firma digital</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Información Personal */}
          <div className="bg-gray-50 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Información Personal
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nombre *
                </label>
                <input
                  type="text"
                  value={infoProfesional.nombre}
                  onChange={(e) => handleInputChange('nombre', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Ej: Francisco"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Apellido *
                </label>
                <input
                  type="text"
                  value={infoProfesional.apellido}
                  onChange={(e) => handleInputChange('apellido', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Ej: Benavides Godinez"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Especialidad
                </label>
                <input
                  type="text"
                  value={infoProfesional.especialidad}
                  onChange={(e) => handleInputChange('especialidad', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Ej: Patólogo Clínico"
                />
              </div>
            </div>
          </div>

          {/* Códigos Profesionales */}
          <div className="bg-green-50 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a1 1 0 011-1h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Códigos Profesionales
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  C.M.P. (Colegio Médico del Perú) *
                </label>
                <input
                  type="text"
                  value={infoProfesional.cmp}
                  onChange={(e) => handleInputChange('cmp', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  placeholder="Ej: 64201"
                />
                <p className="text-xs text-gray-500 mt-1">Obligatorio para todos los médicos</p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  R.N.E. (Registro Nacional de Especialidad)
                </label>
                <input
                  type="text"
                  value={infoProfesional.rne}
                  onChange={(e) => handleInputChange('rne', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  placeholder="Ej: 36922"
                />
                <p className="text-xs text-gray-500 mt-1">Solo para médicos especialistas</p>
              </div>
            </div>
          </div>

          {/* Firma Digital */}
          <div className="bg-purple-50 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h14a2 2 0 002-2V7a2 2 0 00-2-2h-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              ✍️ Firma Digital
            </h3>

            {/* Vista previa de firma */}
            {previewFirma ? (
              <div className="bg-white border-2 border-dashed border-purple-300 rounded-lg p-4 text-center mb-4">
                <img 
                  src={previewFirma} 
                  alt="Firma digital" 
                  className="max-h-32 mx-auto object-contain"
                  style={{ maxWidth: '300px' }}
                />
                <p className="text-sm text-gray-500 mt-2">
                  {nuevaFirma ? "Nueva firma (sin guardar)" : "Firma actual"}
                </p>
              </div>
            ) : (
              <div className="bg-white border-2 border-dashed border-purple-300 rounded-lg p-8 text-center mb-4">
                <svg className="w-12 h-12 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h14a2 2 0 002-2V7a2 2 0 00-2-2h-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                <p className="text-gray-500">No hay firma registrada</p>
              </div>
            )}

            <div className="space-y-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg"
                onChange={handleFileSelect}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              />
              
              <div className="bg-purple-100 border border-purple-200 rounded-lg p-3">
                <div className="text-sm text-purple-800">
                  <p className="font-medium mb-1">📋 Requisitos de la firma:</p>
                  <ul className="space-y-1 text-purple-700 text-xs">
                    <li>• Formato: PNG, JPG o JPEG</li>
                    <li>• Tamaño máximo: 2MB</li>
                    <li>• Recomendado: Fondo transparente</li>
                    <li>• Dimensiones sugeridas: 300x100 píxeles</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Vista previa del resultado final */}
          {(infoProfesional.nombre || infoProfesional.apellido || infoProfesional.cmp) && (
            <div className="bg-blue-50 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                Vista Previa - Así aparecerá en los documentos
              </h3>
              
              <div className="bg-white border-2 border-blue-200 rounded-lg p-4 text-center">
                {previewFirma && (
                  <img 
                    src={previewFirma} 
                    alt="Firma" 
                    className="max-h-16 mx-auto object-contain mb-3"
                  />
                )}
                <div className="border-t-2 border-gray-300 pt-2">
                  <div className="text-sm font-medium text-gray-800">
                    {infoProfesional.nombre} {infoProfesional.apellido}
                  </div>
                  {infoProfesional.especialidad && (
                    <div className="text-xs text-gray-600">
                      {infoProfesional.especialidad}
                    </div>
                  )}
                  <div className="text-xs text-gray-600">
                    C.M.P. {infoProfesional.cmp}
                    {infoProfesional.rne && ` - R.N.E ${infoProfesional.rne}`}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Mensaje de estado */}
          {mensaje && (
            <div className={`p-4 rounded-lg ${
              mensaje.includes('✅') 
                ? 'bg-green-50 border border-green-200 text-green-800' 
                : 'bg-red-50 border border-red-200 text-red-800'
            }`}>
              <p className="font-medium">{mensaje}</p>
            </div>
          )}

          {/* Botones de acción */}
          <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-gray-200">
            {haycambios() && (
              <button
                onClick={guardarInformacion}
                disabled={loading}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded-xl font-semibold transition-all duration-200 hover:scale-105 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Guardando...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                    </svg>
                    Guardar Información
                  </>
                )}
              </button>
            )}

            {haycambios() && (
              <button
                onClick={resetearFormulario}
                className="px-6 py-3 bg-gray-500 hover:bg-gray-600 text-white rounded-xl font-semibold transition-all duration-200 hover:scale-105 shadow-lg flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Reset
              </button>
            )}

            {previewFirma && !nuevaFirma && (
              <button
                onClick={eliminarFirma}
                disabled={loading}
                className="px-6 py-3 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white rounded-xl font-semibold transition-all duration-200 hover:scale-105 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Eliminar Firma
              </button>
            )}

            <button
              onClick={onClose}
              className="px-6 py-3 bg-gray-500 hover:bg-gray-600 text-white rounded-xl font-semibold transition-all duration-200 hover:scale-105 shadow-lg flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}