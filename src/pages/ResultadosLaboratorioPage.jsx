import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { BASE_URL } from "../config/config";

export default function ResultadosLaboratorioPage() {
  const { consultaId } = useParams();
  const [resultados, setResultados] = useState([]);
  const [examenes, setExamenes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`${BASE_URL}api_resultados_laboratorio.php?consulta_id=${consultaId}`).then(res => res.json()),
      fetch(`${BASE_URL}api_examenes_laboratorio.php`, { credentials: 'include' }).then(res => res.json())
    ]).then(([resLab, resEx]) => {
      if (resLab.success) setResultados(resLab.resultados || []);
      else setError(resLab.error || "No hay resultados");
      setExamenes(resEx.examenes || []);
      setLoading(false);
    }).catch(() => {
      setError("Error al cargar resultados");
      setLoading(false);
    });
  }, [consultaId]);

  // Mapas para nombre, unidad y valores de referencia (array)
  const idToNombre = {};
  const idToUnidad = {};
  const idToReferencias = {};
  for (const ex of examenes) {
    idToNombre[ex.id] = ex.nombre;
    idToUnidad[ex.id] = ex.unidad || '';
    idToReferencias[ex.id] = Array.isArray(ex.valores_referenciales) ? ex.valores_referenciales : [];
  }

  // Busca la referencia más general (o la primera)
  function getReferencia(refArr, nombreParam = null) {
    if (!Array.isArray(refArr) || refArr.length === 0) return null;
    // Si hay parámetros, buscar por nombre
    if (nombreParam) {
      const porNombre = refArr.find(r => r.nombre === nombreParam);
      if (porNombre) return porNombre;
    }
    // Preferir desc vacío, "General" o la primera
    return refArr.find(r => !r.desc || r.desc.toLowerCase() === 'general') || refArr[0];
  }

  // Lógica robusta para obtener min y max (como en LlenarResultadosForm)
  function getMinMax(ref) {
    let min = null, max = null;
    if (!ref) return { min, max };
    // Si tiene array referencias, usar el primero
    if (Array.isArray(ref.referencias) && ref.referencias.length > 0) {
      const ref0 = ref.referencias[0];
      if (!isNaN(parseFloat(ref0.valor_min))) min = parseFloat(ref0.valor_min);
      if (!isNaN(parseFloat(ref0.valor_max))) max = parseFloat(ref0.valor_max);
    }
    // Si no, usar los campos directos
    if (min === null && !isNaN(parseFloat(ref.valor_min)) && ref.valor_min !== null && ref.valor_min !== "") {
      min = parseFloat(ref.valor_min);
    } else if (min === null && ref.min !== undefined && !isNaN(parseFloat(ref.min))) {
      min = parseFloat(ref.min);
    }
    if (max === null && !isNaN(parseFloat(ref.valor_max)) && ref.valor_max !== null && ref.valor_max !== "") {
      max = parseFloat(ref.valor_max);
    } else if (max === null && ref.max !== undefined && !isNaN(parseFloat(ref.max))) {
      max = parseFloat(ref.max);
    }
    return { min, max };
  }

  // Chequea si el valor está fuera de rango (robusto)
  function fueraDeRango(val, ref) {
    if (!ref) return false;
    if (val === undefined || val === null || val === "") return false;
    const { min, max } = getMinMax(ref);
    const valNum = parseFloat(val);
    if (isNaN(valNum)) return false;
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
                              const referencias = idToReferencias[exId] || [];
                              const ref = getReferencia(referencias, nombreParam);
                              const unidad = idToUnidad[exId] ? ` ${idToUnidad[exId]}` : '';
                              const { min, max } = getMinMax(ref);
                              const isOut = ref && fueraDeRango(val, ref);
                              return (
                                <li key={ex}>
                                  <b>{nombreParam || examName}:</b>{' '}
                                  <span className={isOut ? 'text-red-600 font-bold' : ''}>{val}{unidad}</span>
                                  {(min !== null || max !== null) && (
                                    <span className="ml-2 text-xs text-gray-500">[
                                      {min !== null ? `min: ${min}` : ''}
                                      {min !== null && max !== null ? ', ' : ''}
                                      {max !== null ? `max: ${max}` : ''}
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
    </div>
  );
}
