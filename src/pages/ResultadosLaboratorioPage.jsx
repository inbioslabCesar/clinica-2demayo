import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { BASE_URL } from "../config/config";

export default function ResultadosLaboratorioPage() {
  const { consultaId } = useParams();
  const [resultados, setResultados] = useState([]);
  const [documentosExternos, setDocumentosExternos] = useState([]);
  const [referenciadosPendientes, setReferenciados] = useState([]);
  const [examenes, setExamenes] = useState([]);
  const [ordenesConsulta, setOrdenesConsulta] = useState([]);
  const [archivoVisor, setArchivoVisor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const isMetaResultKey = (key) => {
    const k = String(key || "");
    return (
      k.endsWith("__imprimir_examen") ||
      k.endsWith("__alarma_activa") ||
      k.endsWith("__alarma_dias")
    );
  };

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    fetch(`${BASE_URL}api_resultados_laboratorio.php?consulta_id=${consultaId}`, { credentials: 'include' })
      .then(res => res.json())
      .then((resLab) => {
        if (!isMounted) return;
        if (resLab.success) {
          setResultados(resLab.resultados || []);
          setDocumentosExternos(resLab.documentos_externos || []);
          setReferenciados(resLab.examenes_referenciados_pendientes || []);
          setError("");
        } else {
          setError(resLab.error || "No hay resultados");
          setDocumentosExternos([]);
        }
      })
      .catch(() => {
        if (!isMounted) return;
        setError("Error al cargar resultados");
        setDocumentosExternos([]);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    fetch(`${BASE_URL}api_examenes_laboratorio.php`, { credentials: 'include' })
      .then(res => res.json())
      .then((resEx) => {
        if (!isMounted) return;
        setExamenes(resEx.examenes || []);
      })
      .catch(() => {
        if (!isMounted) return;
        setExamenes([]);
      });

    fetch(`${BASE_URL}api_ordenes_laboratorio.php?consulta_id=${consultaId}`, { credentials: 'include' })
      .then(res => res.json())
      .then((resOrdenes) => {
        if (!isMounted) return;
        setOrdenesConsulta(Array.isArray(resOrdenes?.ordenes) ? resOrdenes.ordenes : []);
      })
      .catch(() => {
        if (!isMounted) return;
        setOrdenesConsulta([]);
      });

    return () => {
      isMounted = false;
    };
  }, [consultaId]);

  function formatBytes(bytes) {
    const b = Number(bytes || 0);
    if (b <= 0) return "";
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
    return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  }

  // Normaliza valores numéricos desde texto (soporta coma decimal y unidades)
  function normalizeNumber(value) {
    if (value === null || value === undefined) return 0;
    if (typeof value === "number") return value;
    let s = String(value).trim();
    s = s.replace(/,/g, ".");
    const match = s.match(/-?\d+(?:\.\d+)?/);
    if (!match) return 0;
    const n = parseFloat(match[0]);
    return Number.isFinite(n) ? n : 0;
  }

  // Mapas para nombre, unidad y valores de referencia (array)
  const idToNombre = {};
  const idToReferencias = {};
  for (const ex of examenes) {
    idToNombre[ex.id] = ex.nombre;
    idToReferencias[ex.id] = Array.isArray(ex.valores_referenciales) ? ex.valores_referenciales : [];
  }
  for (const orden of ordenesConsulta) {
    const examenesOrden = Array.isArray(orden?.examenes) ? orden.examenes : [];
    for (const ex of examenesOrden) {
      const examId = Number(ex?.id || 0);
      if (examId <= 0) continue;
      if (!idToNombre[examId] && ex?.nombre) {
        idToNombre[examId] = ex.nombre;
      }
      if ((!Array.isArray(idToReferencias[examId]) || idToReferencias[examId].length === 0) && Array.isArray(ex?.valores_referenciales)) {
        idToReferencias[examId] = ex.valores_referenciales;
      }
    }
  }

  // Obtiene el parámetro del examen por nombre
  function normalizeName(s) {
    if (!s) return "";
    return String(s).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }
  function getParametro(paramsList, nombreParam = null) {
    if (!Array.isArray(paramsList) || paramsList.length === 0) return null;
    if (!nombreParam) return null;
    const target = normalizeName(nombreParam);
    const param = paramsList.find(p => {
      if (!p || typeof p !== 'object') return false;
      if (!(p.tipo === undefined || p.tipo === 'Parámetro')) return false;
      return normalizeName(p.nombre || '') === target;
    });
    return param || null;
  }

  // Lógica robusta para obtener min y max (como en LlenarResultadosForm)
  function getMinMax(param) {
    let min = null, max = null;
    if (!param) return { min, max };
    // Preferir referencias[0] si existen
    if (Array.isArray(param.referencias) && param.referencias.length > 0) {
      const ref0 = param.referencias[0] || {};
      const m = normalizeNumber(ref0.valor_min);
      const M = normalizeNumber(ref0.valor_max);
      if (Number.isFinite(m)) min = m;
      if (Number.isFinite(M)) max = M;
      // Si no hay min/max pero hay texto en `valor`, intentar extraer rango "a" o "-"
      if (min === null && max === null && typeof ref0.valor === 'string' && ref0.valor.trim() !== '') {
        // Normalizar comas, guiones y quitar etiquetas como 'N:'
        let txt = ref0.valor.replace(/,/g, '.').replace(/\bN\s*:|\bNormal\s*:\s*/i, '').trim();
        // patrones: "x - y" | "x – y" | "x — y" | "x a y" | "x hasta y" | "entre x y y"
        const rangeMatch = txt.match(/(-?\d+(?:\.\d+)?)\s*(?:-|–|—|a|hasta|\bentre\b)\s*(-?\d+(?:\.\d+)?)/i);
        if (rangeMatch) {
          const rmin = parseFloat(rangeMatch[1]);
          const rmax = parseFloat(rangeMatch[2]);
          if (Number.isFinite(rmin)) min = rmin;
          if (Number.isFinite(rmax)) max = rmax;
        } else {
          // si solo hay un número, usarlo como referencia exacta (min=max)
          const single = txt.match(/-?\d+(?:\.\d+)?/);
          if (single) {
            const v = parseFloat(single[0]);
            if (Number.isFinite(v)) { min = v; max = v; }
          }
        }
      }
    }
    // Compatibilidad con campos directos
    if (min === null && param.valor_min !== undefined) {
      const m2 = normalizeNumber(param.valor_min);
      if (Number.isFinite(m2)) min = m2;
    } else if (min === null && param.min !== undefined) {
      const m3 = normalizeNumber(param.min);
      if (Number.isFinite(m3)) min = m3;
    }
    if (max === null && param.valor_max !== undefined) {
      const M2 = normalizeNumber(param.valor_max);
      if (Number.isFinite(M2)) max = M2;
    } else if (max === null && param.max !== undefined) {
      const M3 = normalizeNumber(param.max);
      if (Number.isFinite(M3)) max = M3;
    }
    return { min, max };
  }

  // Chequea si el valor está fuera de rango (robusto)
  function fueraDeRango(val, param) {
    if (!param) return false;
    if (val === undefined || val === null || val === "") return false;
    const { min, max } = getMinMax(param);
    const valNum = normalizeNumber(val);
    if (!Number.isFinite(valNum)) return false;
    if (min !== null && valNum < min) return true;
    if (max !== null && valNum > max) return true;
    return false;
  }

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded-xl shadow-xl mt-6">
      {/* Encabezado mejorado */}
      <div className="mb-8 text-center">
        <div className="flex items-center justify-center gap-3 mb-2">
          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h2 className="text-3xl font-bold text-green-800">📋 Resultados de Laboratorio</h2>
        </div>
        <p className="text-green-600">Reporte completo de los análisis médicos</p>
      </div>

      {/* Botón volver mejorado */}
      <Link 
        to={-1} 
        className="mb-6 inline-flex items-center gap-2 px-4 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg font-medium transition-colors duration-200 hover:scale-105"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        ⬅️ Volver
      </Link>
      {loading ? (
        <div className="flex items-center justify-center p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
          <span className="ml-3 text-gray-600">Cargando resultados...</span>
        </div>
      ) : error ? (
        <div className="p-6 text-red-600 bg-red-50 border border-red-200 rounded-xl">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {error}
          </div>
        </div>
      ) : resultados.length === 0 ? (
        <div className="p-8 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="text-gray-500 text-lg">No hay resultados registrados para esta consulta.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {resultados.map((res, idx) => (
            <div key={idx} className="bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-200 rounded-xl p-6 shadow-lg hover:shadow-xl transition-shadow duration-300">
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-green-200">
                <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3a2 2 0 012-2h4a2 2 0 012 2v4m-4 8v4m-4-4h8m-8-4h8a2 2 0 002-2V7a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                </svg>
                <span className="text-sm font-bold text-green-800">
                  📅 Fecha del Análisis: {new Date(res.fecha).toLocaleDateString('es-ES', { 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric', 
                    hour: '2-digit', 
                    minute: '2-digit' 
                  })}
                </span>
              </div>
              {res.resultados && typeof res.resultados === "object" ? (
                <div>
                  {(() => {
                    // Agrupar resultados por examen principal
                    const agrupados = {};
                    Object.entries(res.resultados).forEach(([ex, val]) => {
                      if (isMetaResultKey(ex)) return;
                      let exId = ex;
                      let nombreParam = null;
                      if (ex.includes("__")) {
                        [exId, nombreParam] = ex.split("__");
                      }
                      if (!agrupados[exId]) agrupados[exId] = [];
                      agrupados[exId].push({ nombreParam, val, ex });
                    });
                    return Object.entries(agrupados).map(([exId, params]) => {
                      const examName = idToNombre[exId] || exId;
                      return (
                        <div key={exId} className="mb-3">
                          <div className="font-semibold text-base mb-1">{examName}</div>
                          <ul className="list-disc ml-5">
                            {params.map(({ nombreParam, val, ex }) => {
                              // Si no hay nombreParam, mostrar como resultado simple
                              const paramsList = idToReferencias[exId] || [];
                              const parametrosValidos = (paramsList || []).filter(p => p && typeof p === 'object' && (p.tipo === undefined || p.tipo === "Parámetro") && p.nombre && p.nombre.trim() !== "");
                              const defaults = parametrosValidos.filter(p => /^item\s*\d+$/i.test((p.nombre || '').trim()));
                              const isDefaultItem = nombreParam ? /^item\s*\d+$/i.test(nombreParam.trim()) : false;
                              const defaultIndex = (isDefaultItem && nombreParam) ? defaults.findIndex(p => (p.nombre || '').trim() === nombreParam.trim()) : -1;
                              // Elegir parámetro cuando el resultado viene sin nombre (clave solo por examen)
                              let paramItem = null;
                              if (nombreParam) {
                                paramItem = getParametro(paramsList, nombreParam);
                                // Fallback: si no coincide el nombre, usar el primer parámetro válido
                                if (!paramItem && parametrosValidos.length >= 1) {
                                  paramItem = parametrosValidos[0];
                                }
                              } else if (parametrosValidos.length >= 1) {
                                // Si no hay nombre, elegir el primer parámetro válido para mostrar referencias
                                paramItem = parametrosValidos[0];
                              }

                              // Determinar nombre para mostrar
                              let displayName;
                              if (nombreParam) {
                                displayName = isDefaultItem
                                  ? (defaults.length <= 1 ? examName : `${examName} — Parámetro ${defaultIndex + 1}`)
                                  : nombreParam;
                              } else if (paramItem && (paramItem.nombre || '').trim() !== '') {
                                const isDefaultSingle = /^item\s*\d+$/i.test((paramItem.nombre || '').trim());
                                displayName = isDefaultSingle ? examName : paramItem.nombre;
                              } else {
                                displayName = examName;
                              }

                              const unidad = paramItem && paramItem.unidad ? ` ${paramItem.unidad}` : '';
                              const { min, max } = getMinMax(paramItem);
                              const refText = (paramItem && Array.isArray(paramItem.referencias) && paramItem.referencias[0] && typeof paramItem.referencias[0].valor === 'string' && paramItem.referencias[0].valor.trim() !== '') ? paramItem.referencias[0].valor : '';
                              const isOut = paramItem && fueraDeRango(val, paramItem);
                              const nombreDuplicado = normalizeName(displayName) === normalizeName(examName);
                              return (
                                <li key={ex}>
                                  {!nombreDuplicado && <><b>{displayName}:</b>{' '}</>}
                                  <span className={isOut ? 'text-red-600 font-bold' : ''}>{val}{unidad}</span>
                                  {(min !== null || max !== null || refText) && (
                                    <span className="ml-2 text-xs text-gray-500">[
                                      {min !== null || max !== null
                                        ? `${min !== null ? `min: ${min}` : ''}${min !== null && max !== null ? ', ' : ''}${max !== null ? `max: ${max}` : ''}`
                                        : `ref: ${refText}`}
                                    ]</span>
                                  )}
                                  {isOut && (min !== null || max !== null) && (
                                    <span className="text-xs text-red-600 ml-1 font-semibold">{'Fuera de rango'}</span>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      );
                    });
                  })()}
                </div>
              ) : (
                <div>{JSON.stringify(res.resultados)}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {!loading && !error && referenciadosPendientes.length > 0 && (
        <div className="mt-8 border-2 border-amber-200 rounded-xl p-5 bg-gradient-to-r from-amber-50 to-yellow-50 shadow">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xl">⏳</span>
            <h3 className="text-base font-bold text-amber-800">Resultados de Laboratorio Externo — En Proceso</h3>
          </div>
          <p className="text-sm text-amber-700 mb-4">
            Los siguientes exámenes fueron derivados a un laboratorio externo. Los resultados aún no han sido subidos al sistema.
          </p>
          <div className="space-y-2">
            {referenciadosPendientes.map((item, i) => (
              <div key={i} className="flex items-center gap-3 bg-white border border-amber-200 rounded-lg px-4 py-3">
                <span className="text-lg">🧪</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{item.descripcion || "Examen referenciado"}</p>
                  {item.laboratorio && (
                    <p className="text-xs text-amber-600 font-medium mt-0.5">🏥 {item.laboratorio}</p>
                  )}
                </div>
                <span className="flex-shrink-0 text-xs bg-amber-100 text-amber-700 border border-amber-300 font-semibold px-2.5 py-1 rounded-full whitespace-nowrap">
                  Pendiente de subida
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && !error && documentosExternos.length > 0 && (
        <div className="mt-8 border-2 border-blue-200 rounded-xl p-5 bg-gradient-to-r from-blue-50 to-indigo-50 shadow">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-lg">🔗</span>
            <h3 className="text-lg font-bold text-blue-800">Resultados Referenciados (Laboratorio Externo)</h3>
          </div>
          <div className="space-y-3">
            {documentosExternos.map((doc) => (
              <div key={doc.documento_id} className="bg-white border border-blue-200 rounded-lg p-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                  <div>
                    <p className="text-base font-bold text-blue-800 leading-snug">
                      {doc.titulo || `Documento #${doc.documento_id}`}
                    </p>
                    {doc.descripcion && (
                      <p className="text-sm text-indigo-700 font-medium mt-0.5">📝 {doc.descripcion}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">
                      Orden #{doc.orden_id || "-"} · {doc.fecha ? new Date(doc.fecha).toLocaleString('es-ES') : "Sin fecha"}
                    </p>
                  </div>
                  <span className="text-xs font-semibold bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
                    {Array.isArray(doc.archivos) ? doc.archivos.length : 0} archivo(s)
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {(doc.archivos || []).map((arch) => (
                    <button
                      key={arch.archivo_id}
                      type="button"
                      onClick={() => setArchivoVisor(arch)}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-xs font-semibold"
                      title={arch.nombre_original}
                    >
                      👁️ Ver archivo
                      <span className="text-[11px] text-indigo-500">{arch.nombre_original}</span>
                      <span className="text-[10px] text-gray-400">{formatBytes(arch.tamano)}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {archivoVisor && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-5xl h-[85vh] rounded-xl shadow-2xl flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-800 truncate">{archivoVisor.nombre_original}</p>
                <p className="text-xs text-gray-500">Vista previa del archivo referenciado</p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={archivoVisor.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs px-3 py-1.5 rounded bg-blue-100 text-blue-700 hover:bg-blue-200 font-semibold"
                >
                  Abrir en pestaña
                </a>
                <button
                  type="button"
                  onClick={() => setArchivoVisor(null)}
                  className="text-xs px-3 py-1.5 rounded bg-gray-100 text-gray-700 hover:bg-gray-200 font-semibold"
                >
                  Cerrar
                </button>
              </div>
            </div>

            <div className="flex-1 bg-gray-50">
              {String(archivoVisor.mime_type || '').startsWith('image/') ? (
                <div className="w-full h-full flex items-center justify-center p-4 overflow-auto">
                  <img src={archivoVisor.url} alt={archivoVisor.nombre_original} className="max-w-full max-h-full object-contain rounded border" />
                </div>
              ) : String(archivoVisor.mime_type || '').includes('dicom') ? (
                <div className="w-full h-full flex items-center justify-center text-center p-6">
                  <div>
                    <p className="font-semibold text-gray-700 mb-1">No hay visor DICOM integrado en esta pantalla.</p>
                    <p className="text-sm text-gray-500">Puedes abrir el archivo en una pestaña externa para visualizarlo.</p>
                  </div>
                </div>
              ) : (
                <iframe
                  src={archivoVisor.url}
                  title={archivoVisor.nombre_original}
                  className="w-full h-full border-0"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
