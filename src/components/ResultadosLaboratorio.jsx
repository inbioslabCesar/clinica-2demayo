import { useEffect, useState } from "react";
import { BASE_URL } from "../config/config";

export default function ResultadosLaboratorio({ resultadosLab }) {
  const [examenes, setExamenes] = useState([]);
  useEffect(() => {
    fetch(BASE_URL + "api_examenes_laboratorio.php", { credentials: 'include' })
      .then(res => res.json())
      .then(data => setExamenes(data.examenes || []));
  }, []);

  // Mapa de id a nombre
  const idToNombre = {};
  for (const ex of examenes) {
    idToNombre[ex.id] = ex.nombre;
  }

  if (!resultadosLab || resultadosLab.length === 0) return null;
  return (
    <div className="mt-6 border-2 border-green-200 rounded-xl p-6 bg-gradient-to-r from-green-50 to-emerald-50 shadow-lg">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
          <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <h3 className="text-xl font-bold text-green-800">📋 Resultados de Laboratorio</h3>
      </div>
      
      <div className="max-h-[400px] md:max-h-[500px] overflow-y-auto pr-2 space-y-4">
        {resultadosLab.map((res, idx) => (
          <div key={idx} className="bg-white border border-green-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow duration-200">
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-green-100">
              <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3a2 2 0 012-2h4a2 2 0 012 2v4m-4 8v4m-4-4h8m-8-4h8a2 2 0 002-2V7a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
              </svg>
              <span className="text-sm font-semibold text-green-700">
                📅 Fecha: {new Date(res.fecha).toLocaleDateString('es-ES', { 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric', 
                  hour: '2-digit', 
                  minute: '2-digit' 
                })}
              </span>
            </div>
            
            {res.resultados && typeof res.resultados === "object" ? (
              <div className="space-y-2">
                {Object.entries(res.resultados).map(([ex, val]) => (
                  <div key={ex} className="flex items-start gap-3 p-2 bg-green-25 rounded-md border-l-4 border-green-400">
                    <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0"></div>
                    <div className="flex-1">
                      <span className="font-semibold text-green-800">{idToNombre[ex] || ex}:</span>
                      <span className="ml-2 text-gray-700 font-medium">{val}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-3 bg-gray-50 rounded-md border-l-4 border-gray-400">
                <span className="text-gray-700">{JSON.stringify(res.resultados)}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
