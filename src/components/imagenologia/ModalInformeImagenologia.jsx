import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FiX, FiDownload, FiSave, FiLoader } from 'react-icons/fi';
import Swal from 'sweetalert2';
import { authFetch, resolveAppUrl } from '../../utils/apiClient';

const PLANTILLAS_CACHE_TTL_MS = 5 * 60 * 1000;
let plantillasCache = {
  data: null,
  ts: 0,
};

async function getPlantillasImagenologia(force = false) {
  const now = Date.now();
  if (!force && Array.isArray(plantillasCache.data) && (now - plantillasCache.ts) < PLANTILLAS_CACHE_TTL_MS) {
    return { success: true, plantillas: plantillasCache.data };
  }

  const res = await authFetch('api_imagenologia_plantillas.php');
  const data = await res.json();
  if (data?.success && Array.isArray(data.plantillas)) {
    plantillasCache = { data: data.plantillas, ts: now };
  }
  return data;
}

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

function makeUniqueFieldId(baseId, usedIds, fallbackPrefix = 'campo') {
  const normalizedBase = String(baseId || '').trim();
  let candidate = normalizedBase !== '' ? normalizedBase : `${fallbackPrefix}_1`;
  let counter = 2;
  while (usedIds.has(candidate.toLowerCase())) {
    candidate = `${normalizedBase || fallbackPrefix}_${counter}`;
    counter += 1;
  }
  usedIds.add(candidate.toLowerCase());
  return candidate;
}

function normalizeTemplateFieldIds(template) {
  if (!template || typeof template !== 'object') return template;
  const copy = {
    ...template,
    estructura_json: template?.estructura_json && typeof template.estructura_json === 'object'
      ? { ...template.estructura_json }
      : template?.estructura_json,
  };

  const sections = Array.isArray(copy?.estructura_json?.sections)
    ? copy.estructura_json.sections
    : null;

  if (!sections) return copy;

  copy.estructura_json = {
    ...copy.estructura_json,
    sections: sections.map((section, sectionIndex) => {
      if (!section || typeof section !== 'object') return section;
      const usedIds = new Set();
      const fallbackPrefix = `campo_${sectionIndex + 1}`;
      const campos = Array.isArray(section.campos) ? section.campos : [];
      return {
        ...section,
        campos: campos.map((campo) => {
          if (!campo || typeof campo !== 'object') return campo;
          return {
            ...campo,
            id: makeUniqueFieldId(campo.id, usedIds, fallbackPrefix),
          };
        })
      };
    })
  };

  return copy;
}

function normalizeTipoPlantilla(tipo) {
  const t = String(tipo || '').trim().toLowerCase();
  if (t === 'rx' || t === 'rayos_x' || t === 'rayos x') return 'rayosx';
  return t;
}

function normalizeTextForMatch(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pickTemplateByHintText(templates = [], hint = '') {
  if (!Array.isArray(templates) || templates.length === 0) return null;
  const normalizedHint = normalizeTextForMatch(hint);
  if (!normalizedHint) return null;

  return templates.find((tpl) => {
    const tplName = normalizeTextForMatch(tpl?.nombre || '');
    return tplName && normalizedHint.includes(tplName);
  }) || null;
}

function draftStorageKey(ordenImagenId) {
  return `imagenologia_informe_borrador_${ordenImagenId}`;
}

function readDraft(ordenImagenId) {
  try {
    const raw = sessionStorage.getItem(draftStorageKey(ordenImagenId));
    const draft = raw ? JSON.parse(raw) : null;
    return draft && typeof draft === 'object' ? draft : null;
  } catch {
    return null;
  }
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

function resolveTemplateByContext(templates = [], { orden = null, informe = null } = {}) {
  const fromOrder = pickTemplateByHintText(templates, `${orden?.indicaciones || ''} ${orden?.titulo || ''}`);
  if (fromOrder) return fromOrder;

  const fromTitle = pickTemplateByHintText(templates, `${informe?.titulo || ''}`);
  if (fromTitle) return fromTitle;

  return null;
}

function pickTipoPlantilla({ tipoExamenProp, orden, informe }) {
  const fromOrden = normalizeTipoPlantilla(orden?.tipo);
  if (fromOrden) return fromOrden;

  const fromInforme = normalizeTipoPlantilla(informe?.plantilla_json?.tipo_examen);
  if (fromInforme) return fromInforme;

  return normalizeTipoPlantilla(tipoExamenProp);
}

function swalFrontConfig(baseConfig) {
  return {
    ...baseConfig,
    target: document.body,
    backdrop: true,
    didOpen: () => {
      const popup = Swal.getPopup();
      if (popup) {
        popup.style.zIndex = '100000';
      }
      const container = Swal.getContainer();
      if (container) {
        container.style.zIndex = '100000';
      }
      if (typeof baseConfig?.didOpen === 'function') {
        baseConfig.didOpen();
      }
    }
  };
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
  const [dirty, setDirty] = useState(false);
  const [tituloEditadoManual, setTituloEditadoManual] = useState(false);
  const draftTimerRef = useRef(null);
  const medicoMostrado = [informe?.medico_nombre, informe?.medico_apellido].filter(Boolean).join(' ') || medicoNombre;

  // ─ Cargar plantillas y informe existente ─────────────────────────────────
  useEffect(() => {
    if (!open || !ordenImagenId) return;

    const tipoPlantillaProp = normalizeTipoPlantilla(tipoExamen);

    setLoading(true);
    Promise.all([
      getPlantillasImagenologia(),
      authFetch(`api_imagenologia_informes.php?orden_imagen_id=${ordenImagenId}`),
      authFetch(`api_ordenes_imagen.php?orden_id=${ordenImagenId}&vista=informe_fast`)
    ])
      .then(([dataPlant, resInf, resOrden]) => Promise.all([Promise.resolve(dataPlant), resInf.json(), resOrden.json()]))
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
          const plantillasNormalizadas = dataPlant.plantillas.map((p) => normalizeTemplateFieldIds(p));
          const filtradasPorTipo = plantillasNormalizadas.filter(
            (p) => normalizeTipoPlantilla(p?.tipo_examen) === tipoPlantilla
          );
          plantillasDisponibles = filtradasPorTipo.length > 0 ? filtradasPorTipo : plantillasNormalizadas;

          // Si hay un informe existente con plantilla guardada, usarla; sino la primera activa
          const plantillaInforme = normalizeTemplateFieldIds(dataInf?.informe?.plantilla_json);
          const matchPlantilla = resolveTemplateFromReport(plantillasDisponibles, plantillaInforme);
          const matchContexto = resolveTemplateByContext(plantillasDisponibles, {
            orden: ordenActual,
            informe: dataInf?.informe || null,
          });
          plantillaFinal = matchPlantilla || matchContexto || plantillasDisponibles[0];
        }

        if (!plantillaFinal) {
          try {
            const resAll = await authFetch(`api_imagenologia_plantillas.php?tipo=${tipoPlantilla}`);
            const dataAll = await resAll.json();
            if (dataAll?.success && Array.isArray(dataAll.plantillas)) {
              const plantillasNormalizadas = dataAll.plantillas.map((p) => normalizeTemplateFieldIds(p));
              if (dataAll.plantillas.length > 0) {
                plantillasDisponibles = plantillasNormalizadas;
                const plantillaInforme = normalizeTemplateFieldIds(dataInf?.informe?.plantilla_json);
                plantillaFinal =
                  resolveTemplateFromReport(plantillasDisponibles, plantillaInforme)
                  || resolveTemplateByContext(plantillasDisponibles, {
                    orden: ordenActual,
                    informe: dataInf?.informe || null,
                  })
                  || plantillasDisponibles[0];
              }
            }
          } catch {
            // Fallback controlado abajo.
          }
        }

        if (!plantillaFinal) {
          plantillaFinal = normalizeTemplateFieldIds(createSyntheticTemplate(tipoPlantilla || 'ecografia'));
          plantillasDisponibles = [plantillaFinal];
        }

        setTodasLasPlantillas(plantillasDisponibles);
        setPlantillaSeleccionada(plantillaFinal);

        const draft = readDraft(ordenImagenId);
        if (dataInf.success && dataInf.informe) {
          const inf = dataInf.informe;
          if (!plantillaFinal && inf?.plantilla_json) {
            plantillaFinal = inf.plantilla_json;
            setPlantillaSeleccionada(plantillaFinal);
          }
          setInforme(inf);
          setTitulo(draft?.titulo ?? inf.titulo ?? '');
          setTituloEditadoManual(Boolean(draft?.titulo || inf?.titulo));
          setEstado(draft?.estado ?? inf.estado ?? 'borrador');
          const contenidoExistente = inf.contenido_json || {};
          const contenidoHibrido = hasAnyContenidoValue(contenidoExistente)
            ? contenidoExistente
            : mergeContenidoWithPlantilla(contenidoExistente, plantillaFinal);
          setContenido(draft?.contenido ?? contenidoHibrido);
        } else {
          setContenido(draft?.contenido ?? buildContenidoFromPlantilla(plantillaFinal));
          setTitulo(draft?.titulo ?? plantillaFinal?.nombre ?? '');
          setTituloEditadoManual(Boolean(draft?.titulo));
          setEstado(draft?.estado ?? 'borrador');
        }
        setDirty(Boolean(draft));
      })
      .catch((err) => {
        console.error('Error cargando datos:', err);
        Swal.fire('Error', 'No se pudieron cargar los datos', 'error');
      })
      .finally(() => setLoading(false));
  }, [open, ordenImagenId, tipoExamen]);

  useEffect(() => {
    if (!open || loading || !ordenImagenId || !dirty) return;
    if (draftTimerRef.current) {
      clearTimeout(draftTimerRef.current);
    }
    draftTimerRef.current = setTimeout(() => {
      try {
        sessionStorage.setItem(draftStorageKey(ordenImagenId), JSON.stringify({ titulo, contenido, estado }));
      } catch {
        // A storage failure must not block clinical report editing.
      }
      draftTimerRef.current = null;
    }, 250);

    return () => {
      if (draftTimerRef.current) {
        clearTimeout(draftTimerRef.current);
      }
    };
  }, [open, loading, ordenImagenId, dirty, titulo, contenido, estado]);

  useEffect(() => () => {
    if (draftTimerRef.current) {
      clearTimeout(draftTimerRef.current);
    }
  }, []);

  // ─ Manejar cambios en campos dinámicos ──────────────────────────────────
  const handleFieldChange = useCallback((sectionId, fieldId, value) => {
    setDirty(true);
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
        Swal.fire(swalFrontConfig({
          title: 'Éxito',
          text: 'Informe guardado exitosamente',
          icon: 'success'
        }));
        setInforme((prev) => ({ ...(prev || {}), id: data.informe_id, estado }));
        sessionStorage.removeItem(draftStorageKey(ordenImagenId));
        setDirty(false);
        if (onSaved) onSaved({ refreshListado: false, informeId: data.informe_id || null, estado });
      } else {
        Swal.fire(swalFrontConfig({
          title: 'Error',
          text: data.error || 'No se pudo guardar el informe',
          icon: 'error'
        }));
      }
    } catch (err) {
      console.error('Error al guardar:', err);
      Swal.fire(swalFrontConfig({
        title: 'Error',
        text: 'Error de conexión',
        icon: 'error'
      }));
    } finally {
      setSaving(false);
    }
  }, [ordenImagenId, titulo, contenido, plantillaSeleccionada, estado, onSaved]);

  // ─ Generar PDF ──────────────────────────────────────────────────────────
  const handleGenerarPdf = useCallback(async () => {
    setGenerandoPdf(true);
    try {
      let informeId = informe?.id || 0;
      if (dirty || !informeId) {
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

        const saveData = await response.json();
        if (!saveData.success) {
          throw new Error(saveData.error || 'No se pudo guardar antes de generar PDF');
        }
        informeId = informeId || saveData.informe_id || 0;
      }

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
        setInforme((prev) => ({ ...(prev || {}), id: informeId, estado: 'completado', pdf_path: pdfData.pdf_path || prev?.pdf_path || null }));

        const completarResponse = await authFetch(`api_imagenologia_informes.php?id=${informeId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accion: 'completar' })
        });
        const completarData = await completarResponse.json();
        if (completarData?.success) {
          setEstado('completado');
        }

        Swal.fire(swalFrontConfig({
          title: 'Éxito',
          text: 'PDF generado correctamente',
          icon: 'success'
        }));
        
        // Descargar archivo generado
        if (pdfData.pdf_url) {
          const link = document.createElement('a');
          link.href = resolveAppUrl(pdfData.pdf_url);
          link.download = pdfData.pdf_filename || `informe_imagenologia_${informeId}.pdf`;
          link.click();
        }
        if (onSaved) onSaved({ refreshListado: true, informeId, estado: 'completado' });
        sessionStorage.removeItem(draftStorageKey(ordenImagenId));
        setDirty(false);
      } else {
        Swal.fire(swalFrontConfig({
          title: 'Error',
          text: pdfData.error || 'No se pudo generar el PDF',
          icon: 'error'
        }));
      }
    } catch (err) {
      console.error('Error al generar PDF:', err);
      Swal.fire(swalFrontConfig({
        title: 'Error',
        text: err.message || 'Error de conexión',
        icon: 'error'
      }));
    } finally {
      setGenerandoPdf(false);
    }
  }, [informe, ordenImagenId, titulo, contenido, plantillaSeleccionada, estado, onSaved, dirty]);

  if (!open) return null;

  const modalNode = (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-[99999] flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full h-[90vh] sm:h-[92vh] flex flex-col overflow-hidden">
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
                    onChange={(e) => {
                      setTitulo(e.target.value);
                      setTituloEditadoManual(true);
                      setDirty(true);
                    }}
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

                      const tituloActual = String(titulo || '').trim();
                      const tituloPlantillaActual = String(plantillaSeleccionada?.nombre || '').trim();
                      const puedeSincronizarTitulo = !tituloEditadoManual || tituloActual === '' || tituloActual === tituloPlantillaActual;

                      const hayCambios = hasAnyContenidoValue(contenido);
                      let modoAplicacion = 'replace';
                      if (hayCambios) {
                        const confirm = await Swal.fire(swalFrontConfig({
                          title: 'Cambiar plantilla',
                          text: 'Puedes reemplazar el contenido con la nueva plantilla o mantener lo escrito y solo completar campos vacios.',
                          icon: 'question',
                          showCancelButton: true,
                          showDenyButton: true,
                          confirmButtonText: 'Reemplazar contenido',
                          denyButtonText: 'Mantener y completar',
                          cancelButtonText: 'Cancelar',
                        }));
                        if (confirm.isDismissed) return;
                        modoAplicacion = confirm.isDenied ? 'merge' : 'replace';
                      }

                      setPlantillaSeleccionada(p);
                      setContenido((prev) => (
                        modoAplicacion === 'merge'
                          ? mergeContenidoWithPlantilla(prev, p)
                          : buildContenidoFromPlantilla(p)
                      ));

                      if (puedeSincronizarTitulo) {
                        setTitulo(String(p?.nombre || ''));
                        setTituloEditadoManual(false);
                      }

                      setDirty(true);
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
