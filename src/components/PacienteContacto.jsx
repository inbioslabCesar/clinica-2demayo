import React from "react";

function PacienteContacto({ form, handleChange }) {
  return (
    <div className="bg-white rounded-lg p-4 border border-blue-300">
      <h3 className="text-lg font-semibold text-blue-800 mb-3 flex items-center gap-2">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
        </svg>
        Información de Contacto
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
          <input name="telefono" value={form.telefono} onChange={handleChange} placeholder="Número de contacto" type="tel" className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input name="email" value={form.email} onChange={handleChange} placeholder="Correo electrónico" type="email" className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
        </div>
      </div>
    </div>
  );
}

export default PacienteContacto;
