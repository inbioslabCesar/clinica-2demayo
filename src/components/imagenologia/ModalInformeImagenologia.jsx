import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { FiX, FiDownload, FiSave, FiLoader } from 'react-icons/fi';
import Swal from 'sweetalert2';
import { authFetch } from '../../utils/apiClient';

function isEmptyValue(value) {
  return value == null || String(value).trim() === '';
}

function hasAnyContenidoValue(contenido = {}) {
  return Object.values(contenido || {}).some((section) => {
    if (!section || typeof section !== 'object') return false;
    return Object.values(section).some((v) => !isEmptyValue(v));
  });
}

function buildContenidoFromPlantilla(plantilla) {
  const next = {};
  const sections = plantilla?.estructura_json?.sections || [];
  sections.forEach((section) => {
    const sectionId = section?.id;
    if (!sectionId) return;
    next[sectionId] = {};
    (section.campos || []).forEach((campo) => {
      if (!campo?.id) return;
      next[sectionId][campo.id] = campo.valor_base || '';
    });
  });
  return next;
}

function mergeContenidoWithPlantilla(contenidoActual, plantillaNueva) {
  const merged = { ...(contenidoActual || {}) };
  const sections = plantillaNueva?.estructura_json?.sections || [];
  sections.forEach((section) => {
    const sectionId = section?.id;
    if (!sectionId) return;
    const currentSection = { ...(merged[sectionId] || {}) };
    (section.campos || []).forEach((campo) => {
      if (!campo?.id) return;
      if (isEmptyValue(currentSection[campo.id])) {
        currentSection[campo.id] = campo.valor_base || '';
      }
    });
    merged[sectionId] = currentSection;
  });
  return merged;
}

function templateSections(plantilla) {
  if (Array.isArray(plantilla?.estructura_json?.sections)) return plantilla.estructura_json.sections;
  if (Array.isArray(plantilla?.sections)) return plantilla.sections;
  return [];
}

function buildFallbackSectionsFromContenido(contenido = {}) {
  return Object.entries(contenido || {}).map(([sectionId, sectionData]) => {
    const campos = Object.keys(sectionData || {}).map((fieldId) => ({
      id: fieldId,
      label: fieldId.replace(/_/g, ' '),
      type: 'textarea',
      placeholder: '',
      required: false,
    }));

    return {
      id: sectionId,
      nombre: sectionId.replace(/_/g, ' '),
      campos,
    };
  });
}

function normalizeTipoPlantilla(tipo) {
  const t = String(tipo || '').trim().toLowerCase();
  if (t === 'rx' || t === 'rayos_x' || t === 'rayos x') return 'rayosx';
  return t;
}

function createSyntheticTemplate(tipoExamen = 'ecografia') {
  return {
    id: 'synthetic-default',
    nombre: 'Plantilla base automática',
    tipo_examen: normalizeTipoPlantilla(tipoExamen),
    estructura_json: {
      sections: [
        {
          id: 'hallazgos',
          nombre: 'Hallazgos',
          campos: [
            {
              id: 'descripcion_hallazgos',
              label: 'Descripción de hallazgos',
              type: 'textarea',
              placeholder: 'Describe hallazgos relevantes del estudio...',
              required: false,
              valor_base: 'Sin hallazgos patologicos significativos.',
            },
          ],
        },
        {
          id: 'conclusion',
          nombre: 'Conclusión',
          campos: [
            {
              id: 'resumen_final',
              label: 'Resumen y conclusión',
              type: 'textarea',
              placeholder: 'Redacta la conclusión final del estudio...',
              required: true,
              valor_base: 'No se identifican hallazgos patologicos significativos en el estudio realizado.',
            },
          ],
        },
      ],
    },
  };
}

function resolveTemplateFromReport(templates = [], plantillaInforme = null) {
  if (!Array.isArray(templates) || templates.length === 0 || !plantillaInforme) return null;

  const reportId = String(plantillaInforme?.id || '').trim();
  const reportNombre = String(plantillaInforme?.nombre || '').trim().toLowerCase();

  if (reportId !== '') {
    const byId = templates.find((p) => String(p?.id || '') === reportId);
    if (byId) return byId;
  }

  if (reportNombre !== '') {
    const byName = templates.find((p) => String(p?.nombre || '').trim().toLowerCase() === reportNombre);
    if (byName) return byName;
  }

  return null;
}

function pickTipoPlantilla({ tipoExamenProp, orden, informe }) {
  const fromOrden = normalizeTipoPlantilla(orden?.tipo);
  if (fromOrden) return fromOrden;

  const fromInforme = normalizeTipoPlantilla(informe?.plantilla_json?.tipo_examen);
  if (fromInforme) return fromInforme;

  return normalizeTipoPlantilla(tipoExamenProp);
}

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

    const tipoPlantillaProp = normalizeTipoPlantilla(tipoExamen);

    setLoading(true);
    Promise.all([
      authFetch('api_imagenologia_plantillas.php'),
      authFetch(`api_imagenologia_informes.php?orden_imagen_id=${ordenImagenId}`),
      authFetch(`api_ordenes_imagen.php?orden_id=${ordenImagenId}`)
    ])
      .then(([resPlant, resInf, resOrden]) => Promise.all([resPlant.json(), resInf.json(), resOrden.json()]))
      .then(async ([dataPlant, dataInf, dataOrden]) => {
        let plantillaFinal = null;
        let plantillasDisponibles = [];
        const ordenActual = dataOrden?.orden || null;
        const tipoPlantilla = pickTipoPlantilla({
          tipoExamenProp: tipoPlantillaProp,
          orden: ordenActual,
          informe: dataInf?.informe || null,
        });

        if (dataPlant.success && Array.isArray(dataPlant.plantillas) && dataPlant.plantillas.length > 0) {
          const filtradasPorTipo = dataPlant.plantillas.filter(
            (p) => normalizeTipoPlantilla(p?.tipo_examen) === tipoPlantilla
          );
          plantillasDisponibles = filtradasPorTipo.length > 0 ? filtradasPorTipo : dataPlant.plantillas;

          // Si hay un informe existente con plantilla guardada, usarla; sino la primera activa
          const plantillaInforme = dataInf?.informe?.plantilla_json;
          const matchPlantilla = resolveTemplateFromReport(plantillasDisponibles, plantillaInforme);
          plantillaFinal = matchPlantilla || plantillasDisponibles[0];
        }

        if (!plantillaFinal) {
          try {
            const resAll = await authFetch(`api_imagenologia_plantillas.php?tipo=${tipoPlantilla}`);
            const dataAll = await resAll.json();
            if (dataAll?.success && Array.isArray(dataAll.plantillas)) {
              if (dataAll.plantillas.length > 0) {
                plantillasDisponibles = dataAll.plantillas;
                const plantillaInforme = dataInf?.informe?.plantilla_json;
                plantillaFinal = resolveTemplateFromReport(plantillasDisponibles, plantillaInforme) || plantillasDisponibles[0];
              }
            }
          } catch {
            // Fallback controlado abajo.
          }
        }

        if (!plantillaFinal) {
          plantillaFinal = createSyntheticTemplate(tipoPlantilla || 'ecografia');
          plantillasDisponibles = [plantillaFinal];
        }

        setTodasLasPlantillas(plantillasDisponibles);
        setPlantillaSeleccionada(plantillaFinal);

        if (dataInf.success && dataInf.informe) {
          const inf = dataInf.informe;
          if (!plantillaFinal && inf?.plantilla_json) {
            plantillaFinal = inf.plantilla_json;
            setPlantillaSeleccionada(plantillaFinal);
          }
          setInforme(inf);
          setTitulo(inf.titulo || '');
          setEstado(inf.estado || 'borrador');
          const contenidoExistente = inf.contenido_json || {};
          const contenidoHibrido = hasAnyContenidoValue(contenidoExistente)
            ? contenidoExistente
            : mergeContenidoWithPlantilla(contenidoExistente, plantillaFinal);
          setContenido(contenidoHibrido);
        } else {
          setContenido(buildContenidoFromPlantilla(plantillaFinal));
          setTitulo(plantillaFinal?.nombre || '');
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

  const modalNode = (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-[99999] flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden">
        {/* Encabezado */}
        <div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white p-6 flex justify-between items-center">
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
        <div className="p-6 overflow-y-auto flex-1 min-h-0">
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
                    onChange={async (e) => {
                      const p = todasLasPlantillas.find((pl) => String(pl.id) === String(e.target.value));
                      if (!p) return;
                      if (String(p.id) === String(plantillaSeleccionada?.id)) return;

                      const hayCambios = hasAnyContenidoValue(contenido);
                      if (hayCambios) {
                        const confirm = await Swal.fire({
                          title: 'Cambiar plantilla',
                          text: 'Se mantendra lo ya escrito y se autocompletaran los campos vacios con el nuevo texto base.',
                          icon: 'question',
                          showCancelButton: true,
                          confirmButtonText: 'Aplicar',
                          cancelButtonText: 'Cancelar'
                        });
                        if (!confirm.isConfirmed) return;
                      }

                      setPlantillaSeleccionada(p);
                      setContenido((prev) => mergeContenidoWithPlantilla(prev, p));
                    }}
                    className="w-full px-3 py-2 border border-blue-300 rounded bg-white text-sm focus:ring-2 focus:ring-blue-400 outline-none"
                  >
                    {(() => {
                      const countByName = todasLasPlantillas.reduce((acc, p) => {
                        const n = String(p?.nombre || 'Plantilla');
                        acc[n] = (acc[n] || 0) + 1;
                        return acc;
                      }, {});

                      return todasLasPlantillas.map((p) => {
                        const n = String(p?.nombre || 'Plantilla');
                        const duplicated = (countByName[n] || 0) > 1;
                        const label = duplicated ? `${n} (#${p.id})` : n;
                        return <option key={p.id} value={p.id}>{label}</option>;
                      });
                    })()}
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
              <div className="mb-4 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                El informe se autocompleta con texto base profesional. Ajusta solo medidas, hallazgos relevantes y conclusion final.
              </div>

              <div className="space-y-6">
                {(templateSections(plantillaSeleccionada).length > 0
                  ? templateSections(plantillaSeleccionada)
                  : buildFallbackSectionsFromContenido(contenido)
                ).map((section) => (
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
        <div className="bg-gray-50 border-t p-4 sm:p-6 flex justify-end gap-3 sticky bottom-0 z-10">
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

  if (typeof document === 'undefined' || !document.body) {
    return modalNode;
  }

  return createPortal(modalNode, document.body);
}
