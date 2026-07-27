import React from "react";

function DatosAdicionales({
  form,
  handleChange,
  handleAcompananteChange,
  handleAgregarAcompanante,
  handleQuitarAcompanante,
}) {
  const acompanantes = Array.isArray(form.acompanantes) ? form.acompanantes : [];

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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Grupo Sanguíneo</label>
            <select
              name="grupo_sanguineo"
              value={form.grupo_sanguineo || "NO_ESPECIFICADO"}
              onChange={handleChange}
              className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="NO_ESPECIFICADO">No especificado</option>
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="AB">AB</option>
              <option value="O">O</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Factor RH</label>
            <select
              name="factor_rh"
              value={form.factor_rh || "NO_ESPECIFICADO"}
              onChange={handleChange}
              className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="NO_ESPECIFICADO">No especificado</option>
              <option value="POSITIVO">Positivo</option>
              <option value="NEGATIVO">Negativo</option>
            </select>
          </div>
        </div>

        <div className="border border-blue-200 rounded-lg p-3 bg-blue-50">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h4 className="text-sm font-semibold text-blue-800">Acompañantes (opcional)</h4>
              <p className="text-xs text-gray-600">Puedes registrar hasta 2 acompañantes.</p>
            </div>
            <button
              type="button"
              onClick={handleAgregarAcompanante}
              disabled={acompanantes.length >= 2}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold px-3 py-2 rounded"
            >
              Agregar acompañante
            </button>
          </div>

          <div className="space-y-3">
            {acompanantes.length === 0 ? (
              <div className="text-xs text-gray-500">Sin acompañantes registrados.</div>
            ) : (
              acompanantes.map((a, idx) => (
                <div key={idx} className="bg-white border border-blue-100 rounded p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-blue-700">Acompañante {idx + 1}</span>
                    <button
                      type="button"
                      onClick={() => handleQuitarAcompanante(idx)}
                      className="text-xs text-red-600 hover:text-red-700 font-semibold"
                    >
                      Quitar
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-gray-700 mb-1">Nombre completo</label>
                      <input
                        value={a?.nombre_completo || ""}
                        onChange={(e) => handleAcompananteChange(idx, "nombre_completo", e.target.value)}
                        placeholder="Nombre del acompañante"
                        className="w-full border rounded px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Teléfono</label>
                      <input
                        value={a?.telefono || ""}
                        onChange={(e) => handleAcompananteChange(idx, "telefono", e.target.value)}
                        placeholder="Opcional"
                        className="w-full border rounded px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <label className="block text-xs font-medium text-gray-700 mb-1">Parentesco</label>
                      <select
                        value={a?.parentesco || ""}
                        onChange={(e) => handleAcompananteChange(idx, "parentesco", e.target.value)}
                        className="w-full border rounded px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="">Seleccione parentesco</option>
                        <option value="PADRE">Padre</option>
                        <option value="MADRE">Madre</option>
                        <option value="TUTOR">Tutor</option>
                        <option value="ABUELO_A">Abuelo(a)</option>
                        <option value="HERMANO_A">Hermano(a)</option>
                        <option value="OTRO">Otro</option>
                      </select>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default DatosAdicionales;
