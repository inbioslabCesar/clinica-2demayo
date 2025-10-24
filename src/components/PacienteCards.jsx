import React from "react";

function PacienteCards({ pacientes, onEditar, onEliminar, onDescargarCaratula, onNavigate }) {
  return (
    <div className="lg:hidden grid grid-cols-1 md:grid-cols-2 gap-4">
      {pacientes.map(p => (
        <div key={p.id} className="bg-gradient-to-br from-blue-50 to-purple-50 border border-blue-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
          {/* Header con HC y acciones */}
          <div className="flex justify-between items-start mb-3">
            <div>
              <div className="text-lg font-bold text-purple-800">HC: {p.historia_clinica}</div>
              <div className="text-sm text-gray-600">DNI: {p.dni}</div>
            </div>
            <div className="flex gap-1">
              <button onClick={() => onEditar(p)} className="bg-yellow-400 hover:bg-yellow-500 text-white p-2 rounded-full transition-colors" title="Editar paciente">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
              <button onClick={() => onEliminar(p)} className="bg-red-500 hover:bg-red-600 text-white p-2 rounded-full transition-colors" title="Eliminar paciente">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
              <button onClick={() => onNavigate(`/consumo-paciente/${p.id}`)} className="bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-full transition-colors" title="Ver consumo total">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none" />
                  <text x="12" y="16" textAnchor="middle" fontSize="10" fill="currentColor">C</text>
                </svg>
              </button>
              <button onClick={() => onDescargarCaratula(p)} className="bg-purple-600 hover:bg-purple-700 text-white p-2 rounded-full transition-colors" title="Descargar carátula">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </button>
            </div>
          </div>
          {/* Información del paciente */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="font-medium text-blue-800">{p.nombre} {p.apellido}</span>
              <span className="text-sm bg-blue-100 px-2 py-1 rounded">
                {p.edad !== null ? `${p.edad} años` : 'Edad no registrada'}
              </span>
            </div>
            {p.tipo_seguro && (
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <span className="text-sm text-green-700 font-medium">{p.tipo_seguro}</span>
              </div>
            )}
            {(p.telefono || p.email) && (
              <div className="pt-2 border-t border-blue-200">
                {p.telefono && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    {p.telefono}
                  </div>
                )}
                {p.email && (
                  <div className="flex items-center gap-2 text-sm text-gray-600 mt-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    {p.email}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default PacienteCards;
