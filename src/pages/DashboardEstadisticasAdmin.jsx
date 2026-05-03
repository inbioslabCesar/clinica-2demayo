import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { exportToExcel, exportToPDF } from '../utils/exportTable';
import { authFetch } from '../utils/apiClient';
import Resumen from '../components/DashboardEstadisticasAdmin/Resumen';
import GananciaUsuarioDiario from '../components/DashboardEstadisticasAdmin/GananciaUsuarioDiario';
import RankingRecepcionistas from '../components/DashboardEstadisticasAdmin/RankingRecepcionistas';
import ServiciosVendidos from '../components/DashboardEstadisticasAdmin/ServiciosVendidos';
import TendenciasIngresos from '../components/DashboardEstadisticasAdmin/TendenciasIngresos';

const EMPTY_RESUMEN = { gananciaDia: 0, gananciaMes: 0, gananciaTrimestre: 0, gananciaAnio: 0, pacientes: 0, crecimiento: null, ticketPromedio: 0, gananciaUsuarios: [] };
const EMPTY_PRODUCCION_DETALLE = {
  habilitado: false,
  modo: 'todos',
  resumen: {
    monto_total: 0,
    monto_produccion_medica: 0,
    monto_venta_directa: 0,
    monto_produccion_real: 0,
    monto_produccion_proyectada: 0,
    items_total: 0,
    items_produccion_medica: 0,
    items_venta_directa: 0,
    items_produccion_real: 0,
    items_produccion_proyectada: 0,
  },
  ranking_medicos: [],
  ranking_medicos_origen: [],
  ranking_medicos_ejecucion: [],
  ranking_venta_directa: [],
};

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const DashboardEstadisticasAdmin = () => {
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1); // 1-12
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [resumen, setResumen] = useState(EMPTY_RESUMEN);
  const [ranking, setRanking] = useState([]);
  const [servicios, setServicios] = useState([]);
  const [tendencias, setTendencias] = useState([]);
  const [modoProduccion, setModoProduccion] = useState('todos');
  const [produccionDetalle, setProduccionDetalle] = useState(EMPTY_PRODUCCION_DETALLE);
  const [modoRankingMedico, setModoRankingMedico] = useState('origen');
  const [filterTipo, setFilterTipo] = useState("");
  const [filterNombre, setFilterNombre] = useState("");
  const [filterMedico, setFilterMedico] = useState("");

  const navegarMes = (delta) => {
    setSelectedMonth(prev => {
      let m = prev + delta;
      let y = selectedYear;
      if (m < 1) { m = 12; setSelectedYear(y - 1); }
      else if (m > 12) { m = 1; setSelectedYear(y + 1); }
      else { setSelectedYear(y); }
      return m;
    });
  };

  const fetchData = useCallback((isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    authFetch(`api_dashboard_estadisticas.php?mes=${selectedMonth}&anio=${selectedYear}&modo_produccion=${modoProduccion}`)
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
            medico: s.medico_solicitante || 'Sin médico',
            medicoId: s.medico_id ?? null,
            clasificacionOrigen: s.clasificacion_origen || '',
            cantidad: s.cantidad_total,
            total: s.monto_total,
          })));
          setTendencias(data.tendencias ?? []);
          setProduccionDetalle(data.produccion_medica_detalle ?? { ...EMPTY_PRODUCCION_DETALLE, modo: modoProduccion });
        } else {
          setError(data.error || 'Error al cargar estadísticas');
          setProduccionDetalle(EMPTY_PRODUCCION_DETALLE);
        }
      })
      .catch(() => {
        setError('No se pudieron cargar las estadísticas. Verifica la conexión.');
        setProduccionDetalle(EMPTY_PRODUCCION_DETALLE);
      })
      .finally(() => { setLoading(false); setRefreshing(false); });
  }, [selectedMonth, selectedYear, modoProduccion]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Filtrado memoizado – evita recalcular en cada render
  const serviciosFiltrados = useMemo(
    () => servicios.filter(s =>
      (!filterTipo || s.tipo === filterTipo) &&
      (!filterNombre || s.nombre === filterNombre) &&
      (!filterMedico || s.medico === filterMedico)
    ),
    [servicios, filterTipo, filterNombre, filterMedico]
  );

  const handleExportExcel = useCallback(() => exportToExcel(serviciosFiltrados), [serviciosFiltrados]);
  const handleExportPDF   = useCallback(() => exportToPDF(serviciosFiltrados),   [serviciosFiltrados]);

  const esMesActual = selectedYear === now.getFullYear() && selectedMonth === (now.getMonth() + 1);
  const labelPeriodo = `${MESES[selectedMonth - 1]} De ${selectedYear}`;
  const money = useCallback((value) => Number(value || 0).toLocaleString('es-PE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }), []);
  const rankingMedicosActivo = useMemo(() => {
    if (modoRankingMedico === 'ejecucion') {
      return produccionDetalle?.ranking_medicos_ejecucion || [];
    }
    return produccionDetalle?.ranking_medicos_origen || produccionDetalle?.ranking_medicos || [];
  }, [modoRankingMedico, produccionDetalle]);

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
            <p className="text-purple-200 text-sm mt-1">Período: {labelPeriodo}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Navegador de mes */}
            <div className="flex items-center gap-1 bg-white/15 border border-white/30 rounded-lg overflow-hidden">
              <button
                onClick={() => navegarMes(-1)}
                className="px-3 py-2 hover:bg-white/20 transition text-base font-bold"
                title="Mes anterior"
              >‹</button>
              <select
                value={selectedMonth}
                onChange={e => setSelectedMonth(Number(e.target.value))}
                className="bg-transparent text-white text-sm font-medium px-1 py-2 focus:outline-none cursor-pointer"
              >
                {MESES.map((m, i) => <option key={i+1} value={i+1} className="text-gray-800">{m}</option>)}
              </select>
              <select
                value={selectedYear}
                onChange={e => setSelectedYear(Number(e.target.value))}
                className="bg-transparent text-white text-sm font-medium px-1 py-2 focus:outline-none cursor-pointer"
              >
                {Array.from({ length: 5 }, (_, i) => now.getFullYear() - 4 + i).map(y => (
                  <option key={y} value={y} className="text-gray-800">{y}</option>
                ))}
              </select>
              <button
                onClick={() => navegarMes(1)}
                disabled={esMesActual}
                className="px-3 py-2 hover:bg-white/20 transition text-base font-bold disabled:opacity-40"
                title="Mes siguiente"
              >›</button>
            </div>
            {!esMesActual && (
              <button
                onClick={() => { setSelectedYear(now.getFullYear()); setSelectedMonth(now.getMonth() + 1); }}
                className="px-3 py-2 bg-white/15 hover:bg-white/25 border border-white/30 rounded-lg text-xs font-medium transition"
              >Hoy</button>
            )}
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
        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-5">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-800">Producción Médica vs Venta Directa</h2>
              <p className="text-xs sm:text-sm text-slate-500">Clasificación por item cobrado para trazabilidad operativa.</p>
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="modo-produccion" className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Modo</label>
              <select
                id="modo-produccion"
                value={modoProduccion}
                onChange={(e) => setModoProduccion(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="todos">Todos</option>
                <option value="produccion_medica">Solo producción médica</option>
                <option value="venta_directa">Solo venta directa</option>
              </select>
            </div>
          </div>

          {!produccionDetalle?.habilitado ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              La tabla analítica aun no está disponible en este entorno.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs text-slate-500">Monto total clasificado</p>
                  <p className="text-xl font-bold text-slate-800">S/ {money(produccionDetalle?.resumen?.monto_total)}</p>
                  <p className="text-xs text-slate-500 mt-1">Items: {Number(produccionDetalle?.resumen?.items_total || 0)}</p>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <p className="text-xs text-emerald-700">Producción médica</p>
                  <p className="text-xl font-bold text-emerald-800">S/ {money(produccionDetalle?.resumen?.monto_produccion_medica)}</p>
                  <p className="text-xs text-emerald-700 mt-1">Items: {Number(produccionDetalle?.resumen?.items_produccion_medica || 0)}</p>
                  <p className="text-[11px] text-emerald-700 mt-2">
                    Real: S/ {money(produccionDetalle?.resumen?.monto_produccion_real)}
                    {' · '}
                    Proyectada: S/ {money(produccionDetalle?.resumen?.monto_produccion_proyectada)}
                  </p>
                  <p className="text-[11px] text-emerald-700 mt-1">
                    Items real: {Number(produccionDetalle?.resumen?.items_produccion_real || 0)}
                    {' · '}
                    Items proyectados: {Number(produccionDetalle?.resumen?.items_produccion_proyectada || 0)}
                  </p>
                </div>
                <div className="rounded-xl border border-sky-200 bg-sky-50 p-4">
                  <p className="text-xs text-sky-700">Venta directa</p>
                  <p className="text-xl font-bold text-sky-800">S/ {money(produccionDetalle?.resumen?.monto_venta_directa)}</p>
                  <p className="text-xs text-sky-700 mt-1">Items: {Number(produccionDetalle?.resumen?.items_venta_directa || 0)}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-4 py-3 bg-slate-100 border-b border-slate-200">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="font-semibold text-slate-800">Ranking producción por médico</h3>
                      <select
                        value={modoRankingMedico}
                        onChange={(e) => setModoRankingMedico(e.target.value)}
                        className="px-2 py-1 rounded-md border border-slate-300 bg-white text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
                      >
                        <option value="origen">Por origen</option>
                        <option value="ejecucion">Por ejecución</option>
                      </select>
                    </div>
                  </div>
                  <div className="max-h-72 overflow-auto">
                    {rankingMedicosActivo.length === 0 ? (
                      <p className="p-4 text-sm text-slate-500">Sin datos para este período.</p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead className="text-left bg-white sticky top-0">
                          <tr className="border-b border-slate-200">
                            <th className="px-4 py-2">Médico</th>
                            <th className="px-4 py-2">Especialidad</th>
                            <th className="px-4 py-2 text-right">Items</th>
                            <th className="px-4 py-2 text-right">Real</th>
                            <th className="px-4 py-2 text-right">Proyectado</th>
                            <th className="px-4 py-2 text-right">Monto</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rankingMedicosActivo.map((row, idx) => (
                            <tr key={`${row.medico_id || 'm'}-${idx}`} className="border-b border-slate-100 last:border-b-0">
                              <td className="px-4 py-2 font-medium text-slate-800">{row.medico_nombre || `Médico #${row.medico_id}`}</td>
                              <td className="px-4 py-2 text-slate-600">{row.especialidad || '-'}</td>
                              <td className="px-4 py-2 text-right text-slate-700">{Number(row.items || 0)}</td>
                              <td className="px-4 py-2 text-right font-medium text-emerald-700">S/ {money(row.monto_real)}</td>
                              <td className="px-4 py-2 text-right font-medium text-amber-700">S/ {money(row.monto_proyectado)}</td>
                              <td className="px-4 py-2 text-right font-semibold text-slate-800">S/ {money(row.monto_total)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-4 py-3 bg-slate-100 border-b border-slate-200">
                    <h3 className="font-semibold text-slate-800">Ranking venta directa por servicio</h3>
                  </div>
                  <div className="max-h-72 overflow-auto">
                    {(produccionDetalle?.ranking_venta_directa || []).length === 0 ? (
                      <p className="p-4 text-sm text-slate-500">Sin datos para este período.</p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead className="text-left bg-white sticky top-0">
                          <tr className="border-b border-slate-200">
                            <th className="px-4 py-2">Servicio</th>
                            <th className="px-4 py-2">Tipo</th>
                            <th className="px-4 py-2 text-right">Cantidad</th>
                            <th className="px-4 py-2 text-right">Monto</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(produccionDetalle?.ranking_venta_directa || []).map((row, idx) => (
                            <tr key={`${row.servicio_tipo || 's'}-${idx}`} className="border-b border-slate-100 last:border-b-0">
                              <td className="px-4 py-2 font-medium text-slate-800">{row.servicio_nombre || '-'}</td>
                              <td className="px-4 py-2 text-slate-600">{row.servicio_tipo || '-'}</td>
                              <td className="px-4 py-2 text-right text-slate-700">{Number(row.cantidad_total || 0)}</td>
                              <td className="px-4 py-2 text-right font-semibold text-slate-800">S/ {money(row.monto_total)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </section>

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
          filterMedico={filterMedico}
          setFilterMedico={setFilterMedico}
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
