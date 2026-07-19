import { useState, useEffect } from 'react';
import { FiDownload, FiEye, FiChevronDown } from 'react-icons/fi';
import Swal from 'sweetalert2';
import { authFetch, resolveAppUrl } from '../../utils/apiClient';

/**
 * VisorInformeImagenologiaHC
 * Componente para mostrar informe en Historia Clínica
 * Integrable en la sección "Laboratorio y Apoyo Diagnóstico"
 */
export default function VisorInformeImagenologiaHC({
  ordenImagenId,
  servicioNombre,
  pacienteNombre
}) {
  const [informe, setInforme] = useState(null);
  const [loading, setLoading] = useState(false);
  const [expandido, setExpandido] = useState(false);
  const [descargando, setDescargando] = useState(false);

  // ─ Cargar informe al montar ──────────────────────────────────────────────
  useEffect(() => {
    if (!ordenImagenId) return;
    cargarInforme();
  }, [ordenImagenId]);

  const cargarInforme = async () => {
    try {
      setLoading(true);
      const response = await authFetch(
        `api_imagenologia_informes.php?orden_imagen_id=${ordenImagenId}`
      );
      const data = await response.json();
      if (data.success && data.informe) {
        setInforme(data.informe);
      }
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDescargarPdf = async () => {
    if (!informe) return;
    setDescargando(true);
    try {
      window.open(
        resolveAppUrl(`descargar_informe_imagenologia.php?informe_id=${informe.id}`),
        '_blank'
      );
    } catch (err) {
      console.error('Error:', err);
      Swal.fire('Error', 'No se pudo descargar el PDF', 'error');
    } finally {
      setDescargando(false);
    }
  };

  if (!informe && loading) {
    return (
      <div className="p-3 bg-gray-50 rounded text-xs text-gray-500 text-center">
        Cargando informe...
      </div>
    );
  }

  if (!informe) {
    return null; // No mostrar nada si no hay informe
  }

  const contenido = informe.contenido_json || {};

  return (
    <div className="border border-blue-200 rounded-lg bg-blue-50 overflow-hidden">
      {/* Encabezado desplegable */}
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setExpandido(!expandido);
        }}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-blue-100 transition"
      >
        <div className="flex items-center gap-3 flex-1 text-left">
          <FiEye className="text-blue-600 flex-shrink-0" size={18} />
          <div>
            <div className="text-sm font-semibold text-blue-900">
              Informe: {servicioNombre}
            </div>
            <div className="text-xs text-blue-700">
              Estado:{' '}
              <span className={`px-2 py-0.5 rounded inline-block ml-1 ${
                informe.estado === 'completado'
                  ? 'bg-green-200 text-green-800'
                  : informe.estado === 'borrador'
                  ? 'bg-yellow-200 text-yellow-800'
                  : 'bg-gray-200 text-gray-800'
              }`}>
                {informe.estado.charAt(0).toUpperCase() + informe.estado.slice(1)}
              </span>
            </div>
          </div>
        </div>
        <FiChevronDown
          size={20}
          className={`text-blue-600 transition-transform ${
            expandido ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Contenido expandible */}
      {expandido && (
        <div className="border-t border-blue-200 px-4 py-4 bg-white">
          {/* Información del médico */}
          <div className="mb-4 pb-4 border-b border-gray-200 text-xs">
            <p>
              <strong className="text-blue-900">Médico:</strong> {[informe.medico_nombre, informe.medico_apellido].filter(Boolean).join(' ') || (informe.medico_id ? `Dr. #${informe.medico_id}` : 'Sistema')}
            </p>
            {informe.fecha_redaccion && (
              <p>
                <strong className="text-blue-900">Redactado:</strong>{' '}
                {new Date(informe.fecha_redaccion).toLocaleDateString('es-PE')} at{' '}
                {new Date(informe.fecha_redaccion).toLocaleTimeString('es-PE', {
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </p>
            )}
          </div>

          {/* Secciones del informe */}
          <div className="space-y-4 mb-4">
            {Array.isArray(informe.plantilla_json?.sections) ? informe.plantilla_json.sections.map((section) => {
              const sectionData = contenido[section.id];
              if (!sectionData) return null;

              return (
                <div key={section.id}>
                  <h4 className="font-semibold text-sm text-blue-900 mb-2">
                    {section.nombre}
                  </h4>
                  <div className="text-sm text-gray-700 space-y-1 pl-3 border-l-3 border-blue-300">
                    {typeof sectionData === 'object' ? (
                      Object.entries(sectionData).map(([key, value]) =>
                        value ? (
                          <div key={key}>
                            <strong className="text-gray-800">{key}:</strong>{' '}
                            <p className="text-gray-600 ml-4 mb-2">{value}</p>
                          </div>
                        ) : null
                      )
                    ) : (
                      <p className="text-gray-600">{sectionData}</p>
                    )}
                  </div>
                </div>
              );
            }) : Object.entries(contenido).map(([sectionKey, sectionData]) => (
              <div key={sectionKey}>
                <h4 className="font-semibold text-sm text-blue-900 mb-2 capitalize">
                  {sectionKey.replace(/_/g, ' ')}
                </h4>
                <div className="text-sm text-gray-700 space-y-1 pl-3 border-l-3 border-blue-300">
                  {typeof sectionData === 'object' ? (
                    Object.entries(sectionData || {}).map(([key, value]) =>
                      value ? (
                        <div key={key}>
                          <strong className="text-gray-800">{key}:</strong>{' '}
                          <p className="text-gray-600 ml-4 mb-2">{value}</p>
                        </div>
                      ) : null
                    )
                  ) : (
                    <p className="text-gray-600">{String(sectionData || '')}</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Botón descargar PDF */}
          {informe.estado === 'completado' && (
            <button
              type="button"
              onClick={handleDescargarPdf}
              disabled={descargando}
              className="w-full px-4 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2 transition"
            >
              <FiDownload size={16} />
              {descargando ? 'Descargando...' : 'Descargar PDF del Informe'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
