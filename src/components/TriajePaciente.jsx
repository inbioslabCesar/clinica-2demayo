

export default function TriajePaciente({ triaje }) {
  if (!triaje) return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
      <div className="flex items-center justify-center gap-2 text-yellow-700">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
        <span className="font-medium">No hay datos de triaje registrados</span>
      </div>
      <p className="text-sm text-yellow-600 mt-2">El triaje debe ser realizado por el personal de enfermería</p>
    </div>
  );
  
  return (
    <div className="space-y-4">
      {/* Motivo de Consulta - Principal y destacado */}
      {triaje.motivo && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-blue-900 mb-2">📋 Motivo de Consulta</h4>
              <p className="text-blue-800 leading-relaxed">{triaje.motivo}</p>
            </div>
          </div>
        </div>
      )}

      {/* Síntomas Principales */}
      {triaje.sintomas && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-orange-900 mb-2">🩺 Síntomas Principales</h4>
              <p className="text-orange-800 leading-relaxed">{triaje.sintomas}</p>
            </div>
          </div>
        </div>
      )}

      {/* Signos Vitales en Grid Responsivo */}
      <div className="bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 rounded-lg p-4">
        <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
          ❤️ Signos Vitales
        </h4>
        
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {triaje.presion_arterial && (
            <div className="bg-white rounded-lg p-3 shadow-sm border">
              <div className="text-xs text-gray-500 font-medium uppercase">Presión Arterial</div>
              <div className="text-lg font-bold text-red-600">{triaje.presion_arterial}</div>
              <div className="text-xs text-gray-400">mmHg</div>
            </div>
          )}
          
          {triaje.frecuencia_cardiaca && (
            <div className="bg-white rounded-lg p-3 shadow-sm border">
              <div className="text-xs text-gray-500 font-medium uppercase">Freq. Cardíaca</div>
              <div className="text-lg font-bold text-pink-600">{triaje.frecuencia_cardiaca}</div>
              <div className="text-xs text-gray-400">lpm</div>
            </div>
          )}
          
          {triaje.frecuencia_respiratoria && (
            <div className="bg-white rounded-lg p-3 shadow-sm border">
              <div className="text-xs text-gray-500 font-medium uppercase">Freq. Respiratoria</div>
              <div className="text-lg font-bold text-blue-600">{triaje.frecuencia_respiratoria}</div>
              <div className="text-xs text-gray-400">rpm</div>
            </div>
          )}
          
          {triaje.temperatura && (
            <div className="bg-white rounded-lg p-3 shadow-sm border">
              <div className="text-xs text-gray-500 font-medium uppercase">Temperatura</div>
              <div className="text-lg font-bold text-orange-600">{triaje.temperatura}</div>
              <div className="text-xs text-gray-400">°C</div>
            </div>
          )}
          
          {triaje.saturacion && (
            <div className="bg-white rounded-lg p-3 shadow-sm border">
              <div className="text-xs text-gray-500 font-medium uppercase">Sat. O₂</div>
              <div className="text-lg font-bold text-cyan-600">{triaje.saturacion}</div>
              <div className="text-xs text-gray-400">%</div>
            </div>
          )}
          
          {triaje.peso && (
            <div className="bg-white rounded-lg p-3 shadow-sm border">
              <div className="text-xs text-gray-500 font-medium uppercase">Peso</div>
              <div className="text-lg font-bold text-purple-600">{triaje.peso}</div>
              <div className="text-xs text-gray-400">kg</div>
            </div>
          )}
          
          {triaje.talla && (
            <div className="bg-white rounded-lg p-3 shadow-sm border">
              <div className="text-xs text-gray-500 font-medium uppercase">Talla</div>
              <div className="text-lg font-bold text-indigo-600">{triaje.talla}</div>
              <div className="text-xs text-gray-400">cm</div>
            </div>
          )}
          
          {/* IMC calculado si hay peso y talla */}
          {triaje.peso && triaje.talla && (
            <div className="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-lg p-3 shadow-sm border border-emerald-200">
              <div className="text-xs text-emerald-700 font-medium uppercase">IMC</div>
              <div className="text-lg font-bold text-emerald-600">
                {(parseFloat(triaje.peso) / Math.pow(parseFloat(triaje.talla) / 100, 2)).toFixed(1)}
              </div>
              <div className="text-xs text-emerald-500">kg/m²</div>
            </div>
          )}
        </div>
      </div>

      {/* Estado General del Paciente */}
      {(triaje.nivel_conciencia || triaje.hidratacion || triaje.coloracion) && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <h4 className="font-semibold text-purple-900 mb-3 flex items-center gap-2">
            <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            👤 Estado General
          </h4>
          
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {triaje.nivel_conciencia && (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-purple-700">Conciencia:</span>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                  triaje.nivel_conciencia === 'Alerta' ? 'bg-green-100 text-green-800' :
                  triaje.nivel_conciencia === 'Somnoliento' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-red-100 text-red-800'
                }`}>
                  {triaje.nivel_conciencia}
                </span>
              </div>
            )}
            
            {triaje.hidratacion && (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-purple-700">Hidratación:</span>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                  triaje.hidratacion === 'Normal' ? 'bg-green-100 text-green-800' :
                  'bg-orange-100 text-orange-800'
                }`}>
                  {triaje.hidratacion}
                </span>
              </div>
            )}
            
            {triaje.coloracion && (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-purple-700">Coloración:</span>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                  triaje.coloracion === 'Normal' ? 'bg-green-100 text-green-800' :
                  triaje.coloracion === 'Cianosis' ? 'bg-blue-100 text-blue-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {triaje.coloracion}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
