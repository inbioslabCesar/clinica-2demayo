// Barra de estadísticas para exámenes de laboratorio
export default function ExamenesStatsBar({ stats }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <div className="rounded-xl p-4 text-white" style={{ background: "linear-gradient(90deg, var(--color-primary), var(--color-secondary))" }}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-white/80 text-sm">Total Exámenes</p>
            <p className="text-2xl font-bold">{stats.total}</p>
          </div>
          <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center text-xl">🧪</div>
        </div>
      </div>
      <div className="rounded-xl p-4 text-white" style={{ background: "linear-gradient(90deg, var(--color-secondary), var(--color-accent))" }}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-white/80 text-sm">Con Parámetros</p>
            <p className="text-2xl font-bold">{stats.conParametros}</p>
          </div>
          <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center text-xl">📊</div>
        </div>
      </div>
      <div className="rounded-xl p-4 text-white" style={{ background: "linear-gradient(90deg, var(--color-accent), var(--color-primary))" }}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-white/80 text-sm">Precio Promedio</p>
            <p className="text-2xl font-bold">S/ {stats.precioPromedio}</p>
          </div>
          <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center text-xl">💰</div>
        </div>
      </div>
      <div className="rounded-xl p-4 text-white" style={{ background: "linear-gradient(90deg, var(--color-primary-dark), var(--color-primary))" }}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-white/80 text-sm">Metodologías</p>
            <p className="text-2xl font-bold">{stats.metodologias}</p>
          </div>
          <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center text-xl">🔬</div>
        </div>
      </div>
    </div>
  );
}
