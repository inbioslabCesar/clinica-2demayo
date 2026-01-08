import { useState, useRef, useEffect } from "react";
import { BASE_URL } from "../../config/config";

export default function FirmaDigitalMedico({ isOpen, onClose }) {
  const [firma, setFirma] = useState(null);
  const [firmaExistente, setFirmaExistente] = useState(null);
  const [loading, setLoading] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [previewUrl, setPreviewUrl] = useState(null);
  const fileInputRef = useRef(null);

  // Cargar firma existente al abrir el modal
  useEffect(() => {
    if (isOpen) {
      cargarFirmaExistente();
    }
  }, [isOpen]);

  const cargarFirmaExistente = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${BASE_URL}api_firma_medico.php`, {
        credentials: 'include'
      });
      const data = await response.json();
      
      if (data.success && data.firma) {
        setFirmaExistente(data.firma);
        setPreviewUrl(data.firma);
      } else {
        setFirmaExistente(null);
        setPreviewUrl(null);
      }
    } catch (error) {
      console.error('Error al cargar firma:', error);
      setMensaje("Error al cargar la firma existente");
    } finally {
      setLoading(false);
    }
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
      setFirma(dataUrl);
      setPreviewUrl(dataUrl);
      setMensaje("");
    };
    reader.readAsDataURL(file);
  };

  const subirFirma = async () => {
    if (!firma) {
      setMensaje("Por favor selecciona una imagen de firma");
      return;
    }

    try {
      setLoading(true);
      setMensaje("");

      const response = await fetch(`${BASE_URL}api_firma_medico.php`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ firma })
      });

      const data = await response.json();

      if (data.success) {
        setMensaje("✅ Firma guardada exitosamente");
        setFirmaExistente(firma);
        setTimeout(() => {
          onClose();
        }, 2000);
      } else {
        setMensaje("❌ " + (data.error || "Error al guardar la firma"));
      }
    } catch (error) {
      console.error('Error al subir firma:', error);
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

      const response = await fetch(`${BASE_URL}api_firma_medico.php`, {
        method: 'DELETE',
        credentials: 'include'
      });

      const data = await response.json();

      if (data.success) {
        setMensaje("✅ Firma eliminada exitosamente");
        setFirmaExistente(null);
        setFirma(null);
        setPreviewUrl(null);
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
    setFirma(null);
    setPreviewUrl(firmaExistente);
    setMensaje("");
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-6 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h14a2 2 0 002-2V7a2 2 0 00-2-2h-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-bold">✍️ Firma Digital</h2>
                <p className="text-blue-100 text-sm">Gestiona tu firma para documentos médicos</p>
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
          {/* Vista previa de firma */}
          <div className="bg-gray-50 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              Vista Previa
            </h3>
            
            {previewUrl ? (
              <div className="bg-white border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
                <img 
                  src={previewUrl} 
                  alt="Firma digital" 
                  className="max-h-32 mx-auto object-contain"
                  style={{ maxWidth: '300px' }}
                />
                <p className="text-sm text-gray-500 mt-2">
                  {firma ? "Nueva firma (sin guardar)" : "Firma actual"}
                </p>
              </div>
            ) : (
              <div className="bg-white border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                <svg className="w-12 h-12 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h14a2 2 0 002-2V7a2 2 0 00-2-2h-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                <p className="text-gray-500">No hay firma registrada</p>
              </div>
            )}
          </div>

          {/* Subir nueva firma */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
              <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              {firmaExistente ? "Cambiar Firma" : "Subir Firma"}
            </h3>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-blue-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="text-sm text-blue-800">
                  <p className="font-medium mb-1">Requisitos de la imagen:</p>
                  <ul className="space-y-1 text-blue-700">
                    <li>• Formato: PNG, JPG o JPEG</li>
                    <li>• Tamaño máximo: 2MB</li>
                    <li>• Recomendado: Fondo transparente o blanco</li>
                    <li>• Dimensiones sugeridas: 300x100 píxeles</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg"
                onChange={handleFileSelect}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              
              {firma && (
                <div className="flex gap-2">
                  <button
                    onClick={resetearFormulario}
                    className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Cancelar
                  </button>
                </div>
              )}
            </div>
          </div>

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
            {firma && (
              <button
                onClick={subirFirma}
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
                    Guardar Firma
                  </>
                )}
              </button>
            )}

            {firmaExistente && !firma && (
              <button
                onClick={eliminarFirma}
                disabled={loading}
                className="px-6 py-3 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white rounded-xl font-semibold transition-all duration-200 hover:scale-105 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Eliminando...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Eliminar Firma
                  </>
                )}
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