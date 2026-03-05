import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import ResultadosLaboratorio from "./ResultadosLaboratorio";
import { BASE_URL } from "../../config/config";

export default function TabsApoyoDiagnostico({ consultaId, resultadosLab, ordenesLab = [] }) {
  const [tab, setTab] = useState("laboratorio");
  const [examenes, setExamenes] = useState([]);
  const navigate = useNavigate();

  // Cargar lista de exámenes para mapear IDs a nombres
  useEffect(() => {
    // Obtener catálogo de exámenes con credenciales (cookies de sesión)
    fetch(`${BASE_URL}/api_examenes_laboratorio.php`, {
      credentials: 'include'
    })
      .then((response) => response.json())
      .then((data) => setExamenes(data.examenes || []))
      .catch((error) => console.error('Error al obtener exámenes:', error));
  }, []);

  // Mapa de id a nombre (dentro de la función, usando useMemo para eficiencia)
  const idToNombre = React.useMemo(() => {
    const map = {};
    for (const ex of examenes) {
      map[ex.id] = ex.nombre;
    }
    return map;
  }, [examenes]);

  const ordenesLabOrdenadas = React.useMemo(() => {
    if (!Array.isArray(ordenesLab) || ordenesLab.length === 0) return [];

    const resultadoFechaPorOrden = new Map();
    if (Array.isArray(resultadosLab)) {
      resultadosLab.forEach((r) => {
        const oid = Number(r?.orden_id || 0);
        if (!oid) return;
        const ts = r?.fecha ? new Date(r.fecha).getTime() : NaN;
        if (Number.isNaN(ts)) return;
        const previo = resultadoFechaPorOrden.get(oid);
        if (previo === undefined || ts > previo) {
          resultadoFechaPorOrden.set(oid, ts);
        }
      });
    }

    const getTs = (orden) => {
      const oid = Number(orden?.id || 0);
      const tsResultado = oid ? resultadoFechaPorOrden.get(oid) : undefined;
      if (tsResultado !== undefined) return tsResultado;
      const tsOrden = orden?.fecha ? new Date(orden.fecha).getTime() : NaN;
      return Number.isNaN(tsOrden) ? 0 : tsOrden;
    };

    return [...ordenesLab].sort((a, b) => getTs(a) - getTs(b));
  }, [ordenesLab, resultadosLab]);

  return (
    <div className="mb-4">
      <div className="flex flex-wrap gap-1 sm:gap-2 mb-2">
        <button onClick={() => setTab("laboratorio")}
          className={`px-2 sm:px-3 py-1 rounded-t text-xs sm:text-sm ${tab === "laboratorio" ? "bg-blue-600 text-white" : "bg-gray-200"}`}>
          🧪 <span className="hidden sm:inline">Laboratorio</span><span className="sm:hidden">Lab</span>
        </button>
        <button onClick={() => setTab("rx")}
          className={`px-2 sm:px-3 py-1 rounded-t text-xs sm:text-sm ${tab === "rx" ? "bg-blue-600 text-white" : "bg-gray-200"}`}>
          📸 <span className="hidden sm:inline">RX</span>
        </button>
        <button onClick={() => setTab("ecografia")}
          className={`px-2 sm:px-3 py-1 rounded-t text-xs sm:text-sm ${tab === "ecografia" ? "bg-blue-600 text-white" : "bg-gray-200"}`}>
          🫀 <span className="hidden sm:inline">Ecografía</span><span className="sm:hidden">Eco</span>
        </button>
        <button onClick={() => setTab("tomografia")}
          className={`px-2 sm:px-3 py-1 rounded-t text-xs sm:text-sm ${tab === "tomografia" ? "bg-blue-600 text-white" : "bg-gray-200"}`}>
          🔬 <span className="hidden sm:inline">Tomografía</span><span className="sm:hidden">TAC</span>
        </button>
      </div>
      <div className="border rounded-b bg-white p-3 overflow-hidden">
        {tab === "laboratorio" && (
          <>
            <button
              className="mb-4 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
              onClick={() => navigate(`/solicitud-laboratorio/${consultaId}`)}
            >
              Solicitar análisis de laboratorio
            </button>
            {/* Si no hay exámenes solicitados */}
            {(!ordenesLab || ordenesLab.length === 0) && (
              <div className="mb-3 p-2 bg-gray-50 border border-gray-200 rounded text-gray-600">
                No hay exámenes solicitados para esta consulta.
              </div>
            )}
            {/* Mostrar exámenes solicitados aunque no haya resultados */}
            {ordenesLabOrdenadas.length > 0 && (
              <div className="mb-3 p-2 bg-yellow-50 border border-yellow-300 rounded">
                <div className="font-semibold text-yellow-800 mb-1">Exámenes solicitados:</div>
                {ordenesLabOrdenadas.map((orden, idx) => (
                  <ul key={orden.id || idx} className="list-disc ml-5 text-sm">
                    {Array.isArray(orden.examenes) && orden.examenes.length > 0 ? (
                      orden.examenes.map((ex, i) => {
                        if (typeof ex === 'string' || typeof ex === 'number') {
                          return <li key={i}>{idToNombre[ex] || ex}</li>;
                        }
                        return <li key={i}>{ex.nombre || idToNombre[ex.id] || JSON.stringify(ex)}</li>;
                      })
                    ) : (
                      <li className="text-gray-500">Sin detalles de exámenes</li>
                    )}
                    <li className="text-xs text-gray-500">Estado: {orden.estado || 'pendiente'}</li>
                  </ul>
                ))}
                {/* Si hay exámenes pero aún no hay resultados */}
                {(
                  !resultadosLab ||
                  resultadosLab.length === 0 ||
                  resultadosLab.every(
                    (r) =>
                      !r.resultados ||
                      (typeof r.resultados === 'object' && Object.keys(r.resultados).length === 0) ||
                      (typeof r.resultados === 'string' && r.resultados.trim() === '')
                  )
                ) && (
                  <div className="mt-2 text-sm text-gray-500">Aún no hay resultados disponibles.</div>
                )}
              </div>
            )}
            {/* Botón para ver resultados si existen */}
            {resultadosLab && resultadosLab.length > 0 &&
              resultadosLab.some(
                (r) =>
                  r.resultados &&
                  ((typeof r.resultados === 'object' && Object.keys(r.resultados).length > 0) ||
                  (typeof r.resultados === 'string' && r.resultados.trim() !== ''))
              ) && (
                <div className="mb-6 p-3 sm:p-4 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-3">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 sm:w-5 sm:h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base sm:text-lg font-semibold text-green-800">Resultados Disponibles</h3>
                      <p className="text-xs sm:text-sm text-green-600">Los resultados de laboratorio ya están listos</p>
                    </div>
                  </div>
                  <button
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 sm:px-6 py-2 sm:py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded-xl font-semibold transition-all duration-200 hover:scale-105 shadow-lg hover:shadow-xl text-sm sm:text-base"
                    onClick={() => navigate(`/resultados-laboratorio/${consultaId}`)}
                  >
                    <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span className="hidden sm:inline">📋 Ver Resultados de Laboratorio</span>
                    <span className="sm:hidden">📋 Ver Resultados</span>
                    <svg className="w-3 h-3 sm:w-4 sm:h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              )}
            {/* Los resultados de laboratorio ya no se muestran aquí, solo en la página dedicada */}
          </>
        )}
        {tab === "rx" && (
          <div className="text-gray-500">(Próximamente: solicitud y resultados de Rayos X)</div>
        )}
        {tab === "ecografia" && (
          <div className="text-gray-500">(Próximamente: solicitud y resultados de Ecografía)</div>
        )}
        {tab === "tomografia" && (
          <div className="text-gray-500">(Próximamente: solicitud y resultados de Tomografía)</div>
        )}
      </div>
    </div>
  );
}
