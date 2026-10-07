import React from "react";
import SelectorMedicamentosReceta from "../comunes/SelectorMedicamentosReceta";
import SelectorRecomendacionesProtocolos from "../comunes/SelectorRecomendacionesProtocolos";

export default function TratamientoPaciente({ receta, setReceta, tratamiento, setTratamiento, recomendaciones, setRecomendaciones, sugerenciasReceta, consultaId }) {
  return (
    <>
      <div className="mb-2 mt-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
        <h3 className="text-lg font-bold text-blue-900">Tratamiento</h3>
      </div>
      <div className="mb-2">
        <textarea
          className="w-full border rounded p-1"
          rows={2}
          placeholder="Indicación general, reposo, dieta, fisioterapia, etc."
          value={tratamiento || ""}
          onChange={e => setTratamiento(e.target.value)}
        />
      </div>
      <SelectorMedicamentosReceta
        receta={receta}
        setReceta={setReceta}
        sugerenciasReceta={sugerenciasReceta}
        consultaId={consultaId}
      />
      <div className="mt-3">
        <SelectorRecomendacionesProtocolos
          recomendaciones={recomendaciones || ""}
          setRecomendaciones={setRecomendaciones}
          consultaId={consultaId}
        />
        <div className="mb-2 mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <label className="block text-sm font-bold text-amber-900">Recomendaciones</label>
        </div>
        <textarea
          className="w-full border rounded p-2"
          rows={3}
          placeholder="Indicaciones adicionales generales para el paciente"
          value={recomendaciones || ""}
          onChange={e => setRecomendaciones(e.target.value)}
        />
      </div>
    </>
  );
}
