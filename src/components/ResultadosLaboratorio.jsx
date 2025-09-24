import React, { useEffect, useState } from "react";
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
    <div className="mt-2 border rounded p-2 bg-gray-50">
      <div className="font-semibold mb-1">Resultados de laboratorio:</div>
      <div className="max-h-[350px] md:max-h-[400px] overflow-y-auto pr-2">
        {resultadosLab.map((res, idx) => (
          <div key={idx} className="mb-2">
            <div className="text-xs text-gray-500">
              Fecha: {res.fecha?.slice(0, 16).replace("T", " ")}
            </div>
            {res.resultados && typeof res.resultados === "object" ? (
              <ul className="list-disc ml-5">
                {Object.entries(res.resultados).map(([ex, val]) => (
                  <li key={ex}>
                    <b>{idToNombre[ex] || ex}:</b> {val}
                  </li>
                ))}
              </ul>
            ) : (
              <div>{JSON.stringify(res.resultados)}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
