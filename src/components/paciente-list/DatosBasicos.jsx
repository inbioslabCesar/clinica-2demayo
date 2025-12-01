import React from "react";

function DatosBasicos({ form, handleChange }) {
  return (
    <div className="bg-white rounded-lg p-4 border border-blue-300">
      <h3 className="text-lg font-semibold text-blue-800 mb-3 flex items-center gap-2">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
        Información Básica
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Tipo de documento y DNI */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de documento</label>
          <select name="tipo_documento" value={form.tipo_documento} onChange={handleChange} className="w-full border rounded-lg px-3 py-2 mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
            <option value="dni">DNI</option>
            <option value="carnet_extranjeria">Carnet de extranjería</option>
            <option value="sin_documento">Sin documento</option>
          </select>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {form.tipo_documento === "dni"
              ? "DNI"
              : form.tipo_documento === "carnet_extranjeria"
              ? "Carnet de extranjería"
              : "DNI Provisional"}
          </label>
          <input name="dni" value={form.dni} onChange={handleChange} placeholder={form.tipo_documento === "dni" ? "Documento de identidad (8 dígitos)" : form.tipo_documento === "carnet_extranjeria" ? "Carnet de extranjería (12 dígitos)" : "Se genera automáticamente"} className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" autoFocus disabled={form.tipo_documento === "sin_documento"} />
        </div>
        {/* Historia clínica */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Historia Clínica <span className="text-xs text-gray-500">(Se genera automáticamente si está vacío)</span></label>
          <input name="historia_clinica" value={form.historia_clinica} onChange={handleChange} placeholder="HC##### (opcional - se genera automáticamente)" className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
        </div>
        {/* Nombre y Apellido */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
          <input name="nombre" value={form.nombre} onChange={handleChange} placeholder="Nombres del paciente" className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" required />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Apellido *</label>
          <input name="apellido" value={form.apellido} onChange={handleChange} placeholder="Apellidos del paciente" className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" required />
        </div>
        {/* Sexo */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Sexo *</label>
          <select name="sexo" value={form.sexo} onChange={handleChange} className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
            <option value="M">Masculino</option>
            <option value="F">Femenino</option>
            <option value="Otro">Otro</option>
          </select>
        </div>
      </div>
    </div>
  );
}

export default DatosBasicos;
