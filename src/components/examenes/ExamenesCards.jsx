// Vista de tarjetas para exámenes de laboratorio
export default function ExamenesCards({ paginated, handleEdit, handleDelete }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {paginated.map((ex) => (
        <div key={ex.id} className="bg-white/80 backdrop-blur-sm rounded-xl shadow-lg border border-white/20 p-6 hover:shadow-xl transition-all transform hover:scale-105">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center text-purple-600">🧪</div>
              <div className="text-lg font-bold text-gray-900 line-clamp-1">{ex.nombre}</div>
            </div>
          </div>
          <div className="space-y-3">
            {ex.titulo && (
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Título</p>
                <p className={`text-sm ${ex.es_subtitulo ? "font-bold text-gray-900" : "font-semibold text-gray-700"}`}>{ex.titulo}</p>
              </div>
            )}
            {ex.categoria && (
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Categoría</p>
                <p className="text-sm text-gray-700">{ex.categoria}</p>
              </div>
            )}
            {ex.metodologia && (
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Metodología</p>
                <p className="text-sm text-gray-700">{ex.metodologia}</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Precio Público</p>
                <p className="text-lg font-bold text-green-600">S/ {ex.precio_publico}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Precio Convenio</p>
                <p className="text-lg font-bold text-blue-600">S/ {ex.precio_convenio}</p>
              </div>
            </div>
            {(ex.tipo_tubo || ex.tipo_frasco) && (
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Muestras</p>
                <div className="space-y-1">
                  {ex.tipo_tubo && <p className="text-sm text-gray-700">📍 {ex.tipo_tubo}</p>}
                  {ex.tipo_frasco && <p className="text-sm text-gray-700">🧪 {ex.tipo_frasco}</p>}
                </div>
              </div>
            )}
            {(ex.tiempo_resultado || ex.condicion_paciente) && (
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Información</p>
                <div className="space-y-1">
                  {ex.tiempo_resultado && <p className="text-sm text-gray-700">⏱️ {ex.tiempo_resultado}</p>}
                  {ex.condicion_paciente && <p className="text-sm text-gray-700">👤 {ex.condicion_paciente}</p>}
                </div>
              </div>
            )}
          </div>
          <div className="mt-6 pt-4 border-t border-gray-200 flex gap-3">
            <button
              onClick={() => handleEdit(ex)}
              className="flex-1 bg-gradient-to-r from-amber-500 to-orange-500 text-white py-2.5 px-4 rounded-lg hover:from-amber-600 hover:to-orange-600 transition-all font-medium text-sm shadow-md"
            >
              ✏️ Editar
            </button>
            <button
              onClick={() => handleDelete(ex.id)}
              className="flex-1 bg-gradient-to-r from-red-500 to-pink-500 text-white py-2.5 px-4 rounded-lg hover:from-red-600 hover:to-pink-600 transition-all font-medium text-sm shadow-md"
            >
              🗑️ Eliminar
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
