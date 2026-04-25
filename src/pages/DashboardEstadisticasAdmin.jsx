import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { exportToExcel, exportToPDF } from '../utils/exportTable';
import Resumen from '../components/DashboardEstadisticasAdmin/Resumen';
import GananciaUsuarioDiario from '../components/DashboardEstadisticasAdmin/GananciaUsuarioDiario';
import RankingRecepcionistas from '../components/DashboardEstadisticasAdmin/RankingRecepcionistas';
import ServiciosVendidos from '../components/DashboardEstadisticasAdmin/ServiciosVendidos';
import TendenciasIngresos from '../components/DashboardEstadisticasAdmin/TendenciasIngresos';

const EMPTY_RESUMEN = { gananciaDia: 0, gananciaMes: 0, gananciaTrimestre: 0, gananciaAnio: 0, pacientes: 0, crecimiento: null, ticketPromedio: 0, gananciaUsuarios: [] };

const DashboardEstadisticasAdmin = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [resumen, setResumen] = useState(EMPTY_RESUMEN);
  const [ranking, setRanking] = useState([]);
  const [servicios, setServicios] = useState([]);
  const [tendencias, setTendencias] = useState([]);
  const [filterTipo, setFilterTipo] = useState("");
  const [filterNombre, setFilterNombre] = useState("");

  const fetchData = useCallback((isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    fetch('/api_dashboard_estadisticas.php', { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          const r = data.resumen;
          setResumen({
            gananciaDia: r.gananciaDia ?? 0,
            gananciaMes: r.gananciaMes ?? 0,
            gananciaTrimestre: r.gananciaTrimestre ?? 0,
            gananciaAnio: r.gananciaAnio ?? 0,
            pacientes: r.pacientes ?? 0,
            gananciaUsuarios: r.gananciaUsuarios ?? [],
            crecimiento: r.crecimiento ?? null,
            ticketPromedio: (r.pacientes > 0) ? (r.gananciaMes / r.pacientes) : 0,
          });
          setRanking(data.ranking ?? []);
          setServicios((data.servicios ?? []).map(s => ({
            tipo: s.tipo_servicio,
            nombre: s.nombre_servicio,
            cantidad: s.cantidad_total,
            total: s.monto_total,
          })));
          setTendencias(data.tendencias ?? []);
        } else {
          setError(data.error || 'Error al cargar estadísticas');
        }
      })
      .catch(() => setError('No se pudieron cargar las estadísticas. Verifica la conexión.'))
      .finally(() => { setLoading(false); setRefreshing(false); });
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Filtrado memoizado – evita recalcular en cada render
  const serviciosFiltrados = useMemo(
    () => servicios.filter(s => (!filterTipo || s.tipo === filterTipo) && (!filterNombre || s.nombre === filterNombre)),
    [servicios, filterTipo, filterNombre]
  );

  const handleExportExcel = useCallback(() => exportToExcel(serviciosFiltrados), [serviciosFiltrados]);
  const handleExportPDF   = useCallback(() => exportToPDF(serviciosFiltrados),   [serviciosFiltrados]);

  const mesActual = new Date().toLocaleString('es-ES', { month: 'long', year: 'numeric' });

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-14 h-14 rounded-full border-4 border-purple-200 border-t-purple-600 animate-spin" />
          <p className="text-purple-700 font-medium">Cargando estadísticas…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow p-8 max-w-md text-center border border-red-100">
          <div className="text-4xl mb-3">⚠️</div>
          <p className="text-red-700 font-semibold mb-4">{error}</p>
          <button onClick={() => fetchData()} className="px-5 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition">
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-700 via-purple-600 to-indigo-600 text-white px-6 py-6 shadow-lg">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
              📊 Dashboard Estadístico
            </h1>
            <p className="text-purple-200 text-sm mt-1 capitalize">Período: {mesActual}</p>
          </div>
          <button
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 bg-white/15 hover:bg-white/25 border border-white/30 rounded-lg text-sm font-medium transition disabled:opacity-60"
          >
            <span className={refreshing ? 'animate-spin inline-block' : ''}>🔄</span>
            {refreshing ? 'Actualizando…' : 'Actualizar'}
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
        {/* Fila 1: KPI cards + Ranking */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Resumen resumen={resumen} />
          </div>
          <RankingRecepcionistas ranking={ranking} />
        </div>

        {/* Fila 2: Ganancia por usuario (ancho completo) */}
        <GananciaUsuarioDiario gananciaUsuarios={resumen.gananciaUsuarios} />

        {/* Fila 3: Servicios más vendidos (ancho completo) */}
        <ServiciosVendidos
          servicios={servicios}
          serviciosFiltrados={serviciosFiltrados}
          filterTipo={filterTipo}
          setFilterTipo={setFilterTipo}
          filterNombre={filterNombre}
          setFilterNombre={setFilterNombre}
          handleExportExcel={handleExportExcel}
          handleExportPDF={handleExportPDF}
        />

        {/* Fila 4: Tendencias (ancho completo) */}
        <TendenciasIngresos tendencias={tendencias} />
      </div>
    </div>
  );
};

export default DashboardEstadisticasAdmin;
