// Barra de búsqueda y filtros para exámenes de laboratorio
export default function ExamenesFilterBar({ search, setSearch, categoriaFilter, setCategoriaFilter, categorias, onNew, onExportPDF, onExportExcel }) {
  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl shadow-lg border border-white/20 p-6 mb-6">
      <div className="flex flex-col lg:flex-row gap-4 justify-between items-center">
        <div className="flex-1 max-w-md">
          <div className="relative mb-2">
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); }}
              placeholder="🔍 Buscar por nombre o metodología..."
              className="w-full px-4 py-3 pl-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
            />
          </div>
          <div className="relative">
            <select
              value={categoriaFilter}
              onChange={e => setCategoriaFilter(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
            >
              <option value="">Todas las categorías</option>
              {categorias.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          {onExportPDF && (
            <button
              onClick={onExportPDF}
              className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors shadow-md"
            >
              📄 PDF
            </button>
          )}
          {onExportExcel && (
            <button
              onClick={onExportExcel}
              className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors shadow-md"
            >
              📊 Excel
            </button>
          )}
          {onNew && (
            <button
              onClick={onNew}
              className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all font-medium shadow-lg transform hover:scale-105"
            >
              ➕ Nuevo Examen
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
