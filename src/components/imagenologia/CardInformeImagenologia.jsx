import { useState, useEffect } from 'react';
import { FiFileText, FiEdit3, FiDownload } from 'react-icons/fi';
import Swal from 'sweetalert2';
import { authFetch } from '../../utils/apiClient';
import ModalInformeImagenologia from './ModalInformeImagenologia';

/**
 * CardInformeImagenologia
 * Integración de informe en card de imagenología
 * Muestra estado, botones para editar y descargar
 */
export default function CardInformeImagenologia({
  ordenImagenId,
  tipoExamen,
  pacienteNombre,
  medicoNombre,
  onInformeActualizado
}) {
  const [informe, setInforme] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [descargando, setDescargando] = useState(false);

  // ─ Cargar informe al montar o cuando se actualiza ─────────────────────────
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
      if (data.success) {
        setInforme(data.informe);
      }
    } catch (err) {
      console.error('Error al cargar informe:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDescargarPdf = async () => {
    if (!informe) {
      Swal.fire('Error', 'Informe no disponible', 'warning');
      return;
    }

    setDescargando(true);
    try {
      // Primero asegurarse de generar el PDF si no existe
      const response = await authFetch('api_imagenologia_generar_pdf.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ informe_id: informe.id })
      });

      const data = await response.json();
      if (data.success) {
        // Descargar el PDF
        window.open(`/descargar_informe_imagenologia.php?informe_id=${informe.id}`, '_blank');
      } else {
        Swal.fire('Error', data.error || 'No se pudo generar el PDF', 'error');
      }
    } catch (err) {
      console.error('Error:', err);
      Swal.fire('Error', 'Error de conexión', 'error');
    } finally {
      setDescargando(false);
    }
  };

  const handleCerrarModal = () => {
    setModalOpen(false);
    cargarInforme(); // Recargar después de editar
    if (onInformeActualizado) {
      onInformeActualizado();
    }
  };

  const estadoBadge = (estado) => {
    const badges = {
      borrador: 'bg-yellow-100 text-yellow-800',
      completado: 'bg-green-100 text-green-800',
      archivado: 'bg-gray-100 text-gray-800'
    };
    return badges[estado] || badges.borrador;
  };

  if (loading) {
    return (
      <div className="p-4 bg-gray-50 rounded border border-dashed border-gray-300 text-center text-sm text-gray-500">
        Cargando informe...
      </div>
    );
  }

  return (
    <>
      <div className="p-4 bg-blue-50 rounded border border-blue-200">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <FiFileText className="text-blue-600" size={20} />
            <span className="font-semibold text-blue-900">Informe Clínico</span>
          </div>
          {informe && (
            <span className={`px-2 py-1 text-xs font-semibold rounded ${estadoBadge(informe.estado)}`}>
              {informe.estado.charAt(0).toUpperCase() + informe.estado.slice(1)}
            </span>
          )}
        </div>

        {informe ? (
          <>
            {/* Información del informe */}
            <div className="mb-3 text-sm text-gray-700">
              <p className="text-xs text-gray-600">
                Redactado por: <strong>{[informe.medico_nombre, informe.medico_apellido].filter(Boolean).join(' ') || medicoNombre || `Médico #${informe.medico_id || '-'}`}</strong>
              </p>
              {informe.fecha_redaccion && (
                <p className="text-xs text-gray-600">
                  Fecha: <strong>{new Date(informe.fecha_redaccion).toLocaleDateString('es-PE')}</strong>
                </p>
              )}
            </div>

            {/* Botones de acción */}
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setModalOpen(true)}
                className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-1 transition"
              >
                <FiEdit3 size={16} />
                Editar
              </button>
              <button
                onClick={handleDescargarPdf}
                disabled={descargando}
                className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 flex items-center gap-1 transition"
              >
                <FiDownload size={16} />
                {descargando ? 'Descargando...' : 'PDF'}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-gray-700 mb-3">
              No hay informe redactado aún. Inicia la redacción del informe clínico.
            </p>
            <button
              onClick={() => setModalOpen(true)}
              className="px-3 py-2 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 flex items-center gap-2 transition w-full justify-center"
            >
              <FiEdit3 size={16} />
              Iniciar Informe
            </button>
          </>
        )}
      </div>

      {/* Modal para redactar/editar */}
      <ModalInformeImagenologia
        open={modalOpen}
        ordenImagenId={ordenImagenId}
        tipoExamen={tipoExamen}
        pacienteNombre={pacienteNombre}
        medicoNombre={medicoNombre}
        onClose={handleCerrarModal}
        onSaved={cargarInforme}
      />
    </>
  );
}
