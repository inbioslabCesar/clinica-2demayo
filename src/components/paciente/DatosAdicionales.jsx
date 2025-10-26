import React from "react";

function DatosAdicionales({ form, handleChange }) {
  return (
    <div className="bg-white rounded-lg p-4 border border-blue-300">
      <h3 className="text-lg font-semibold text-blue-800 mb-3 flex items-center gap-2">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
        Información Adicional
      </h3>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Procedencia</label>
          <input name="procedencia" value={form.procedencia} onChange={handleChange} placeholder="Ciudad o lugar de procedencia" className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Dirección</label>
          <textarea name="direccion" value={form.direccion} onChange={handleChange} placeholder="Dirección completa del paciente" rows="2" className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Seguro</label>
          <input name="tipo_seguro" value={form.tipo_seguro} onChange={handleChange} placeholder="Ej: SIS, EsSalud, Particular, etc." className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
        </div>
      </div>
    </div>
  );
}

export default DatosAdicionales;
