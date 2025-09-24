
import React, { useState } from "react";
import TriageList from "./TriageList";

// Panel principal para enfermero: navegación entre Triage, Tratamientos y Hospitalización
function EnfermeroPanel() {
  const [tab, setTab] = useState("triage");

  return (
    <div className="max-w-3xl mx-auto p-4">
      <h1 className="text-2xl font-bold text-center mb-4 text-blue-800">Panel de Enfermería</h1>
      <div className="flex justify-center gap-2 mb-6">
        <button
          className={`px-3 py-1 rounded font-semibold border ${tab === "triage" ? "bg-blue-600 text-white" : "bg-white text-blue-600 border-blue-600"}`}
          onClick={() => setTab("triage")}
        >Triage</button>
        <button
          className={`px-3 py-1 rounded font-semibold border ${tab === "tratamientos" ? "bg-blue-600 text-white" : "bg-white text-blue-600 border-blue-600"}`}
          onClick={() => setTab("tratamientos")}
        >Tratamientos</button>
        <button
          className={`px-3 py-1 rounded font-semibold border ${tab === "hospitalizacion" ? "bg-blue-600 text-white" : "bg-white text-blue-600 border-blue-600"}`}
          onClick={() => setTab("hospitalizacion")}
        >Hospitalización</button>
      </div>
      <div>
        {tab === "triage" && (
          <div className="p-4 bg-blue-50 rounded">
            <TriageList />
          </div>
        )}
        {tab === "tratamientos" && <div className="p-4 bg-blue-50 rounded">Gestión de Tratamientos (próximamente)</div>}
        {tab === "hospitalizacion" && <div className="p-4 bg-blue-50 rounded">Gestión de Hospitalización (próximamente)</div>}
      </div>
    </div>
  );
}

export default EnfermeroPanel;
