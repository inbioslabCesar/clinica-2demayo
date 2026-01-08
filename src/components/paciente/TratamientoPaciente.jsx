import React from "react";
import SelectorMedicamentosReceta from "../comunes/SelectorMedicamentosReceta";

export default function TratamientoPaciente({ receta, setReceta, tratamiento, setTratamiento }) {
  return (
    <>
      <h3 className="text-lg font-semibold mb-2 mt-4">Tratamiento</h3>
      <div className="mb-2">
        <textarea
          className="w-full border rounded p-1"
          rows={2}
          placeholder="Indicación general, reposo, dieta, fisioterapia, etc."
          value={tratamiento || ""}
          onChange={e => setTratamiento(e.target.value)}
        />
      </div>
      <SelectorMedicamentosReceta receta={receta} setReceta={setReceta} />
    </>
  );
}
