import React, { useEffect, useState } from 'react';
// Puedes usar Chart.js, Recharts o cualquier librería de gráficos para los charts
// Aquí solo se muestra la estructura y diseño base con Tailwind

const DashboardEstadisticasAdmin = () => {
  const [loading, setLoading] = useState(true);
  const [resumen, setResumen] = useState({});
  const [ranking, setRanking] = useState([]);
  const [servicios, setServicios] = useState([]);
  const [tendencias, setTendencias] = useState([]);

  useEffect(() => {
    fetch('/api_dashboard_estadisticas.php', { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setResumen({
            gananciaDia: data.resumen.gananciaDia,
            gananciaMes: data.resumen.gananciaMes,
            gananciaTrimestre: data.resumen.gananciaTrimestre,
            gananciaAnio: data.resumen.gananciaAnio,
            pacientes: data.resumen.pacientes,
            gananciaUsuarios: data.resumen.gananciaUsuarios,
            // El crecimiento se puede calcular si tienes datos del mes anterior
            crecimiento: null,
            ticketPromedio: data.resumen.pacientes > 0 ? (data.resumen.gananciaMes / data.resumen.pacientes).toFixed(2) : 0
          });
          setRanking(data.ranking);
          setServicios(data.servicios.map(s => ({ tipo: s.tipo_servicio, nombre: s.nombre_servicio, cantidad: s.cantidad_total, total: s.monto_total })));
          setTendencias(data.tendencias);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-purple-800 mb-6 flex items-center gap-3">
          <span>📊</span> Dashboard Estadístico Administrativo
        </h1>
        {loading ? (
          <div className="flex justify-center items-center h-96">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
            <span className="ml-4 text-purple-600">Cargando estadísticas...</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Resumen Diario/Mensual/Trimestral/Anual */}
            <div className="bg-white rounded-lg shadow-md p-6 flex flex-col gap-2">
              <h2 className="text-lg font-semibold text-gray-800 mb-2">Resumen</h2>
              <div className="flex flex-col gap-1">
                <span>Ganancia hoy: <span className="font-bold text-green-600">S/ {resumen.gananciaDia}</span></span>
                <span>Ganancia mes: <span className="font-bold text-blue-600">S/ {resumen.gananciaMes}</span></span>
                <span>Ganancia trimestre: <span className="font-bold text-indigo-600">S/ {resumen.gananciaTrimestre}</span></span>
                <span>Ganancia año: <span className="font-bold text-pink-600">S/ {resumen.gananciaAnio}</span></span>
                <span>Crecimiento: <span className={`font-bold ${resumen.crecimiento >= 0 ? 'text-green-600' : 'text-red-600'}`}>{resumen.crecimiento}%</span></span>
                <span>Pacientes atendidos: <span className="font-bold text-purple-600">{resumen.pacientes}</span></span>
                <span>Ticket promedio: <span className="font-bold text-yellow-600">S/ {resumen.ticketPromedio}</span></span>
              </div>
            </div>
            {/* Ganancia por usuario por día */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-2">Ganancia por Usuario (Diario)</h2>
              <ul className="space-y-2">
                {Array.isArray(resumen.gananciaUsuarios) && resumen.gananciaUsuarios.map((g, i) => (
                  <li key={g.fecha + '-' + g.usuario_id} className="flex items-center gap-2">
                    <span className="text-gray-500">{g.fecha}</span>
                    <span className="font-semibold">{g.usuario_nombre} ({g.rol})</span>
                    <span className="ml-auto text-green-700 font-bold">S/ {g.ganancia}</span>
                  </li>
                ))}
              </ul>
            </div>
            {/* Ranking Recepcionistas */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-2">Ranking Recepcionistas</h2>
              <ul className="space-y-2">
                {ranking.map((r, i) => (
                  <li key={r.nombre} className="flex items-center gap-2">
                    <span className={`text-xl ${i === 0 ? 'text-yellow-500' : 'text-gray-400'}`}>{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</span>
                    <span className="font-semibold">{r.nombre}</span>
                    <span className="ml-auto text-green-700 font-bold">S/ {r.ingresos}</span>
                  </li>
                ))}
              </ul>
            </div>
            {/* Servicios más vendidos */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-2">Servicios más vendidos</h2>
              <ul className="space-y-2">
                {servicios.map(s => (
                  <li key={s.tipo + '-' + s.nombre} className="flex flex-col md:flex-row md:justify-between">
                    <span><span className="font-semibold">{s.nombre}</span> <span className="text-xs text-gray-500">({s.tipo})</span></span>
                    <span className="text-sm text-gray-700">Cantidad: <span className="font-bold">{s.cantidad}</span></span>
                    <span className="font-bold text-blue-700">S/ {s.total}</span>
                  </li>
                ))}
              </ul>
            </div>
            {/* Tendencias (placeholder) */}
            <div className="bg-white rounded-lg shadow-md p-6 col-span-1 md:col-span-2 lg:col-span-3">
              <h2 className="text-lg font-semibold text-gray-800 mb-2">Tendencias de Ingresos</h2>
              <div className="h-40 flex items-center justify-center text-gray-400">[Gráfica de línea aquí]</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DashboardEstadisticasAdmin;
