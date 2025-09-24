import React, { useState } from "react";
import { BASE_URL } from "../config/config";

import ExamenesSelector from "./ExamenesSelector";

export default function SolicitudLaboratorio({ consultaId }) {
  const [examenes, setExamenes] = useState([]);
  const [examenesDisponibles, setExamenesDisponibles] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setGuardando(true);
    setMsg("");
    await fetch(BASE_URL + "api_ordenes_laboratorio.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ consulta_id: consultaId, examenes }),
    });
    setGuardando(false);
    setMsg("Orden enviada correctamente");
    setExamenes([]);
  };

  // Obtener todos los exámenes disponibles para mostrar nombres seleccionados
  React.useEffect(() => {
    fetch(BASE_URL + "api_examenes_laboratorio.php", { credentials: 'include' })
      .then(res => res.json())
      .then(data => setExamenesDisponibles(data.examenes || []));
  }, []);

  const seleccionados = examenesDisponibles.filter(ex => examenes.includes(ex.id));

  return (
    <form onSubmit={handleSubmit} className="mb-4">
      <div className="font-semibold mb-1">Solicitar exámenes de laboratorio:</div>
      <ExamenesSelector selected={examenes} setSelected={setExamenes} />
      {examenes.length > 0 && (
        <div className="mb-2 bg-blue-50 border border-blue-200 rounded p-2 text-xs">
          <b>Exámenes seleccionados:</b>
          <ul className="list-disc ml-5 mt-1">
            {seleccionados.map(ex => (
              <li key={ex.id} className="flex items-center gap-2">
                <span>{ex.nombre}</span>
                {(ex.condicion_paciente || ex.tiempo_resultado) && (
                  <span className="ml-2 text-gray-400 text-[11px] italic flex flex-col gap-0.5">
                    {ex.condicion_paciente && (
                      <span>{ex.condicion_paciente}</span>
                    )}
                    {ex.tiempo_resultado && (
                      <span>Tiempo resultado: {ex.tiempo_resultado}</span>
                    )}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <button type="submit" className="bg-green-600 text-white px-3 py-1 rounded" disabled={guardando || examenes.length === 0}>
        {guardando ? "Enviando..." : "Solicitar"}
      </button>
      {msg && <div className="mt-1 text-green-700 font-semibold">{msg}</div>}
    </form>
  );
}
