import { useState, useEffect, useCallback } from 'react';
import { FiX, FiDownload, FiSave, FiLoader } from 'react-icons/fi';
import Swal from 'sweetalert2';
import { authFetch } from '../../utils/apiClient';

/**
 * ModalInformeImagenologia
 * Modal para redactar/editar informe clínico de imagenología con plantillas dinámicas
 */
export default function ModalInformeImagenologia({
  open,
  ordenImagenId,
  tipoExamen,
  pacienteNombre,
  medicoNombre,
  onClose,
  onSaved
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [plantillaSeleccionada, setPlantillaSeleccionada] = useState(null);
  const [todasLasPlantillas, setTodasLasPlantillas] = useState([]);
  const [informe, setInforme] = useState(null);
  const [contenido, setContenido] = useState({});
  const [titulo, setTitulo] = useState('');
  const [estado, setEstado] = useState('borrador');
  const [generandoPdf, setGenerandoPdf] = useState(false);
  const medicoMostrado = [informe?.medico_nombre, informe?.medico_apellido].filter(Boolean).join(' ') || medicoNombre;

  // ─ Cargar plantillas y informe existente ─────────────────────────────────
  useEffect(() => {
    if (!open || !ordenImagenId) return;

    const tipoPlantilla = tipoExamen === 'rx' ? 'rayosx' : tipoExamen;

    setLoading(true);
    Promise.all([
      authFetch(`api_imagenologia_plantillas.php?tipo=${tipoPlantilla}`),
      authFetch(`api_imagenologia_informes.php?orden_imagen_id=${ordenImagenId}`)
    ])
      .then(([resPlant, resInf]) => Promise.all([resPlant.json(), resInf.json()]))
      .then(([dataPlant, dataInf]) => {
        if (dataPlant.success && Array.isArray(dataPlant.plantillas) && dataPlant.plantillas.length > 0) {
          setTodasLasPlantillas(dataPlant.plantillas);
          // Si hay un informe existente con plantilla guardada, usarla; sino la primera activa
          const plantillaInforme = dataInf?.informe?.plantilla_json;
          const matchPorNombre = plantillaInforme
            ? dataPlant.plantillas.find((p) => p.nombre === plantillaInforme?.nombre)
            : null;
          setPlantillaSeleccionada(matchPorNombre || dataPlant.plantillas[0]);
        } else {
          setTodasLasPlantillas([]);
        }

        if (dataInf.success && dataInf.informe) {
          const inf = dataInf.informe;
          setInforme(inf);
          setTitulo(inf.titulo || '');
          setEstado(inf.estado || 'borrador');
          setContenido(inf.contenido_json || {});
        } else {
          setContenido({});
          setTitulo('');
          setEstado('borrador');
        }
      })
      .catch((err) => {
        console.error('Error cargando datos:', err);
        Swal.fire('Error', 'No se pudieron cargar los datos', 'error');
      })
      .finally(() => setLoading(false));
  }, [open, ordenImagenId, tipoExamen]);

  // ─ Manejar cambios en campos dinámicos ──────────────────────────────────
  const handleFieldChange = useCallback((sectionId, fieldId, value) => {
    setContenido((prev) => ({
      ...prev,
      [sectionId]: {
        ...(prev[sectionId] || {}),
        [fieldId]: value
      }
    }));
  }, []);

  // ─ Guardar informe ──────────────────────────────────────────────────────
  const handleGuardar = useCallback(async () => {
    if (!ordenImagenId) return;

    setSaving(true);
    try {
      const response = await authFetch('api_imagenologia_informes.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orden_imagen_id: ordenImagenId,
          titulo: titulo || '',
          contenido_json: contenido,
          plantilla_json: plantillaSeleccionada,
          estado
        })
      });

      const data = await response.json();
      if (data.success) {
        Swal.fire('Éxito', 'Informe guardado exitosamente', 'success');
        setInforme((prev) => ({ ...(prev || {}), id: data.informe_id, estado }));
        if (onSaved) onSaved();
      } else {
        Swal.fire('Error', data.error || 'No se pudo guardar el informe', 'error');
      }
    } catch (err) {
      console.error('Error al guardar:', err);
      Swal.fire('Error', 'Error de conexión', 'error');
    } finally {
      setSaving(false);
    }
  }, [ordenImagenId, titulo, contenido, plantillaSeleccionada, estado, onSaved]);

  // ─ Generar PDF ──────────────────────────────────────────────────────────
  const handleGenerarPdf = useCallback(async () => {
    setGenerandoPdf(true);
    try {
      // Primero guardar si hay cambios
      const response = await authFetch('api_imagenologia_informes.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orden_imagen_id: ordenImagenId,
          titulo: titulo || '',
          contenido_json: contenido,
          plantilla_json: plantillaSeleccionada,
          estado: 'completado'
        })
      });

      const saveData = await response.json();
      if (!saveData.success) {
        throw new Error(saveData.error || 'No se pudo guardar antes de generar PDF');
      }

      const informeId = informe?.id || saveData.informe_id;
      if (!informeId) {
        throw new Error('No se pudo resolver el ID del informe para generar el PDF');
      }

      // Luego generar PDF
      const pdfResponse = await authFetch('api_imagenologia_generar_pdf.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ informe_id: informeId })
      });

      const pdfData = await pdfResponse.json();
      if (pdfData.success) {
        setEstado('completado');
        setInforme((prev) => ({ ...(prev || {}), id: informeId, estado: 'completado', pdf_path: pdfData.pdf_path || prev?.pdf_path || null }));
        Swal.fire('Éxito', 'PDF generado correctamente', 'success');
        
        // Descargar archivo generado
        if (pdfData.pdf_url) {
          const link = document.createElement('a');
          link.href = pdfData.pdf_url;
          link.download = `informe_imagenologia_${informeId}.pdf`;
          link.click();
        }
        if (onSaved) onSaved();
      } else {
        Swal.fire('Error', pdfData.error || 'No se pudo generar el PDF', 'error');
      }
    } catch (err) {
      console.error('Error al generar PDF:', err);
      Swal.fire('Error', err.message || 'Error de conexión', 'error');
    } finally {
      setGenerandoPdf(false);
    }
  }, [informe, ordenImagenId, titulo, contenido, plantillaSeleccionada, onSaved]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Encabezado */}
        <div className="sticky top-0 bg-gradient-to-r from-purple-600 to-pink-600 text-white p-6 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold">Redactar Informe de Imagenología</h2>
            <p className="text-sm opacity-90">{pacienteNombre}</p>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-white hover:bg-opacity-20 p-2 rounded transition"
          >
            <FiX size={24} />
          </button>
        </div>

        {/* Contenido */}
        <div className="p-6">
          {loading ? (
            <div className="flex justify-center py-8">
              <FiLoader className="animate-spin text-2xl text-purple-600" />
            </div>
          ) : (
            <>
              {/* Información básica */}
              <div className="mb-6 grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Médico</label>
                  <input
                    type="text"
                    value={medicoMostrado}
                    disabled
                    className="w-full px-3 py-2 bg-gray-100 rounded border opacity-50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Título del Informe</label>
                  <input
                    type="text"
                    value={titulo}
                    onChange={(e) => setTitulo(e.target.value)}
                    placeholder="Ej. Ecografía Abdominal Completa"
                    className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-purple-500 outline-none"
                  />
                </div>
              </div>

              {/* Selector de plantilla */}
              {todasLasPlantillas.length > 1 ? (
                <div className="mb-6 p-4 bg-blue-50 rounded border border-blue-200">
                  <label className="block text-sm font-semibold text-blue-900 mb-2">
                    Plantilla del informe
                  </label>
                  <select
                    value={plantillaSeleccionada?.id ?? ''}
                    onChange={(e) => {
                      const p = todasLasPlantillas.find((pl) => String(pl.id) === String(e.target.value));
                      if (p) setPlantillaSeleccionada(p);
                    }}
                    className="w-full px-3 py-2 border border-blue-300 rounded bg-white text-sm focus:ring-2 focus:ring-blue-400 outline-none"
                  >
                    {todasLasPlantillas.map((p) => (
                      <option key={p.id} value={p.id}>{p.nombre}</option>
                    ))}
                  </select>
                  <p className="text-xs text-blue-600 mt-1">
                    Cambia la plantilla para modificar las secciones del informe.
                  </p>
                </div>
              ) : plantillaSeleccionada ? (
                <div className="mb-6 p-4 bg-blue-50 rounded border border-blue-200">
                  <p className="text-sm text-blue-900">
                    <strong>Plantilla:</strong> {plantillaSeleccionada.nombre}
                  </p>
                </div>
              ) : null}

              {/* Secciones dinámicas */}
              <div className="space-y-6">
                {plantillaSeleccionada?.estructura_json?.sections?.map((section) => (
                  <div key={section.id} className="border-l-4 border-purple-400 pl-4">
                    <h3 className="text-lg font-semibold text-purple-700 mb-4">
                      {section.nombre}
                    </h3>

                    <div className="space-y-4">
                      {section.campos?.map((campo) => (
                        <div key={campo.id}>
                          <label className="block text-sm font-medium mb-1">
                            {campo.label}
                            {campo.required && <span className="text-red-500">*</span>}
                          </label>

                          {campo.type === 'textarea' ? (
                            <textarea
                              value={
                                contenido[section.id]?.[campo.id] || ''
                              }
                              onChange={(e) =>
                                handleFieldChange(
                                  section.id,
                                  campo.id,
                                  e.target.value
                                )
                              }
                              placeholder={campo.placeholder || ''}
                              className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-purple-500 outline-none"
                              rows={4}
                            />
                          ) : campo.type === 'number' ? (
                            <input
                              type="number"
                              value={
                                contenido[section.id]?.[campo.id] || ''
                              }
                              onChange={(e) =>
                                handleFieldChange(
                                  section.id,
                                  campo.id,
                                  e.target.value
                                )
                              }
                              placeholder={campo.placeholder || ''}
                              className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-purple-500 outline-none"
                            />
                          ) : (
                            <input
                              type="text"
                              value={
                                contenido[section.id]?.[campo.id] || ''
                              }
                              onChange={(e) =>
                                handleFieldChange(
                                  section.id,
                                  campo.id,
                                  e.target.value
                                )
                              }
                              placeholder={campo.placeholder || ''}
                              className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-purple-500 outline-none"
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Estado */}
              <div className="mt-6 p-4 bg-gray-50 rounded border">
                <p className="text-sm">
                  <strong>Estado actual:</strong>{' '}
                  <span className={`px-2 py-1 rounded text-white ${
                    estado === 'completado'
                      ? 'bg-green-500'
                      : estado === 'archivado'
                      ? 'bg-gray-500'
                      : 'bg-yellow-500'
                  }`}>
                    {estado.charAt(0).toUpperCase() + estado.slice(1)}
                  </span>
                </p>
              </div>
            </>
          )}
        </div>

        {/* Pie: Botones de acción */}
        <div className="bg-gray-50 border-t p-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 border rounded hover:bg-gray-100 transition"
          >
            Cerrar
          </button>
          <button
            onClick={handleGuardar}
            disabled={saving || loading}
            className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2 transition"
          >
            {saving ? <FiLoader className="animate-spin" /> : <FiSave />}
            Guardar Informe
          </button>
          <button
            onClick={handleGenerarPdf}
            disabled={generandoPdf || loading || saving}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 flex items-center gap-2 transition"
          >
            {generandoPdf ? <FiLoader className="animate-spin" /> : <FiDownload />}
            Generar PDF
          </button>
        </div>
      </div>
    </div>
  );
}
