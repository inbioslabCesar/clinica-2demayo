import React from "react";

function DatosEdad({ form, handleChange }) {
  return (
    <div className="bg-white rounded-lg p-4 border border-blue-300">
      <h3 className="text-lg font-semibold text-blue-800 mb-3 flex items-center gap-2">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        Información de Edad
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de Nacimiento</label>
          <input name="fecha_nacimiento" value={form.fecha_nacimiento} onChange={handleChange} type="date" className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Edad</label>
          <div className="flex gap-2">
            <input name="edad" value={form.edad} onChange={handleChange} placeholder="Edad" type="number" className="flex-1 border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" disabled={!!form.fecha_nacimiento} />
            <select name="edad_unidad" value={form.edad_unidad} onChange={handleChange} className="border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" disabled={!!form.fecha_nacimiento}>
              <option value="días">Días</option>
              <option value="meses">Meses</option>
              <option value="años">Años</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DatosEdad;
