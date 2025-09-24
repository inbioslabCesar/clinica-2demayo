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
    <div className="max-w-2xl mx-auto p-4 bg-white rounded shadow mt-6">
      <h2 className="text-2xl font-bold mb-4 text-center">Resultados de Laboratorio</h2>
      <Link to={-1} className="mb-4 inline-block text-blue-600 hover:underline">&larr; Volver</Link>
      {loading ? (
        <div className="p-4">Cargando resultados...</div>
      ) : error ? (
        <div className="p-4 text-red-600">{error}</div>
      ) : resultados.length === 0 ? (
        <div className="p-4 text-gray-500">No hay resultados registrados para esta consulta.</div>
      ) : (
        <div className="space-y-4">
          {resultados.map((res, idx) => (
            <div key={idx} className="border rounded p-3 bg-gray-50">
              <div className="text-xs text-gray-500 mb-1">
                Fecha: {res.fecha?.slice(0, 16).replace("T", " ")}
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
