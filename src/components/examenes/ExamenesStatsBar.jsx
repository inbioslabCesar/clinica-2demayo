// Barra de estadísticas para exámenes de laboratorio
export default function ExamenesStatsBar({ stats }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <div className="bg-gradient-to-r from-purple-500 to-indigo-500 rounded-xl p-4 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-purple-100 text-sm">Total Exámenes</p>
            <p className="text-2xl font-bold">{stats.total}</p>
          </div>
          <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center text-xl">🧪</div>
        </div>
      </div>
      <div className="bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl p-4 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-blue-100 text-sm">Con Parámetros</p>
            <p className="text-2xl font-bold">{stats.conParametros}</p>
          </div>
          <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center text-xl">📊</div>
        </div>
      </div>
      <div className="bg-gradient-to-r from-emerald-500 to-green-500 rounded-xl p-4 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-emerald-100 text-sm">Precio Promedio</p>
            <p className="text-2xl font-bold">S/ {stats.precioPromedio}</p>
          </div>
          <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center text-xl">💰</div>
        </div>
      </div>
      <div className="bg-gradient-to-r from-amber-500 to-orange-500 rounded-xl p-4 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-amber-100 text-sm">Metodologías</p>
            <p className="text-2xl font-bold">{stats.metodologias}</p>
          </div>
          <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center text-xl">🔬</div>
        </div>
      </div>
    </div>
  );
}
