import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import ResultadosLaboratorio from "./ResultadosLaboratorio";
import { BASE_URL } from "../config/config";

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

  return (
    <div className="mb-4">
      <div className="flex gap-2 mb-2">
        <button onClick={() => setTab("laboratorio")}
          className={`px-3 py-1 rounded-t ${tab === "laboratorio" ? "bg-blue-600 text-white" : "bg-gray-200"}`}>Laboratorio</button>
        <button onClick={() => setTab("rx")}
          className={`px-3 py-1 rounded-t ${tab === "rx" ? "bg-blue-600 text-white" : "bg-gray-200"}`}>RX</button>
        <button onClick={() => setTab("ecografia")}
          className={`px-3 py-1 rounded-t ${tab === "ecografia" ? "bg-blue-600 text-white" : "bg-gray-200"}`}>Ecografía</button>
        <button onClick={() => setTab("tomografia")}
          className={`px-3 py-1 rounded-t ${tab === "tomografia" ? "bg-blue-600 text-white" : "bg-gray-200"}`}>Tomografía</button>
      </div>
      <div className="border rounded-b bg-white p-3">
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
            {ordenesLab && ordenesLab.length > 0 && (
              <div className="mb-3 p-2 bg-yellow-50 border border-yellow-300 rounded">
                <div className="font-semibold text-yellow-800 mb-1">Exámenes solicitados:</div>
                {ordenesLab.map((orden, idx) => (
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
                <button
                  className="mb-4 bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition"
                  onClick={() => navigate(`/resultados-laboratorio/${consultaId}`)}
                >
                  Ver resultados de laboratorio
                </button>
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
