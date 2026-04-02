// Tabla de exámenes de laboratorio
export default function ExamenesTable({ paginated, handleEdit, handleDelete }) {
  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl shadow-lg border border-white/20 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="text-white" style={{ background: "linear-gradient(90deg, var(--color-primary), var(--color-secondary))" }}>
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium">Nombre</th>
              <th className="px-4 py-3 text-left text-sm font-medium hidden md:table-cell">Metodología</th>
              <th className="px-4 py-3 text-left text-sm font-medium hidden md:table-cell">Categoría</th>
              <th className="px-4 py-3 text-left text-sm font-medium hidden lg:table-cell">Tubo/Frasco</th>
              <th className="px-4 py-3 text-left text-sm font-medium hidden lg:table-cell">Tiempo</th>
              <th className="px-4 py-3 text-left text-sm font-medium">Precios</th>
              <th className="px-4 py-3 text-left text-sm font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {paginated.map((ex) => (
              <tr key={ex.id} className="border-b border-gray-100 transition-colors" onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-primary-light)"; }} onMouseLeave={(e) => { e.currentTarget.style.background = ""; }}>
                <td className="px-4 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm" style={{ background: "var(--color-primary-light)", color: "var(--color-secondary)" }}>🧪</div>
                    <div>
                      {ex.titulo && (
                        <div className={`text-sm ${ex.es_subtitulo ? "font-bold text-gray-900" : "font-semibold text-gray-700"}`}>{ex.titulo}</div>
                      )}
                      <div className="font-medium text-gray-900">{ex.nombre}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4 text-sm text-gray-600 hidden md:table-cell">{ex.metodologia}</td>
                <td className="px-4 py-4 text-sm text-gray-600 hidden md:table-cell">{ex.categoria || <span className="text-gray-400">-</span>}</td>
                <td className="px-4 py-4 text-sm text-gray-600 hidden lg:table-cell">
                  <div className="space-y-1">
                    {ex.tipo_tubo && <div>📍 {ex.tipo_tubo}</div>}
                    {ex.tipo_frasco && <div>🧪 {ex.tipo_frasco}</div>}
                  </div>
                </td>
                <td className="px-4 py-4 text-sm text-gray-600 hidden lg:table-cell">
                  <div className="space-y-1">
                    {ex.tiempo_resultado && <div>⏱️ {ex.tiempo_resultado}</div>}
                    {ex.condicion_paciente && <div>👤 {ex.condicion_paciente}</div>}
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="space-y-1">
                    <div className="text-sm">
                      <span className="text-gray-600">Público:</span>
                      <span className="font-semibold text-green-600 ml-1">S/ {ex.precio_publico}</span>
                    </div>
                    <div className="text-sm">
                      <span className="text-gray-600">Convenio:</span>
                      <span className="font-semibold text-blue-600 ml-1">S/ {ex.precio_convenio}</span>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEdit(ex)}
                      className="px-3 py-1.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors text-sm font-medium shadow-md"
                    >
                      ✏️ Editar
                    </button>
                    <button
                      onClick={() => handleDelete(ex.id)}
                      className="px-3 py-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors text-sm font-medium shadow-md"
                    >
                      🗑️ Eliminar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
