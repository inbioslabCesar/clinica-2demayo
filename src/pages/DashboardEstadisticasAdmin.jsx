import React, { useEffect, useState } from 'react';
import { exportToExcel, exportToPDF } from '../utils/exportTable';
import Resumen from '../components/DashboardEstadisticasAdmin/Resumen';
import GananciaUsuarioDiario from '../components/DashboardEstadisticasAdmin/GananciaUsuarioDiario';
import RankingRecepcionistas from '../components/DashboardEstadisticasAdmin/RankingRecepcionistas';
import ServiciosVendidos from '../components/DashboardEstadisticasAdmin/ServiciosVendidos';
import TendenciasIngresos from '../components/DashboardEstadisticasAdmin/TendenciasIngresos';
// Puedes usar Chart.js, Recharts o cualquier librería de gráficos para los charts
// Aquí solo se muestra la estructura y diseño base con Tailwind

const DashboardEstadisticasAdmin = () => {
  // Filtros para la tabla de servicios más vendidos
  const [filterTipo, setFilterTipo] = useState("");
  const [filterNombre, setFilterNombre] = useState("");

  // Funciones de exportación (placeholder)
  const handleExportExcel = () => {
    const datosFiltrados = servicios
      .filter(s => (!filterTipo || s.tipo === filterTipo) && (!filterNombre || s.nombre === filterNombre));
    exportToExcel(datosFiltrados);
  };
  const handleExportPDF = () => {
    const datosFiltrados = servicios
      .filter(s => (!filterTipo || s.tipo === filterTipo) && (!filterNombre || s.nombre === filterNombre));
    exportToPDF(datosFiltrados);
  };
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
            // crecimiento mensual (porcentaje) calculado en el backend; puede ser null
            crecimiento: data.resumen.crecimiento ?? null,
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
              <Resumen resumen={resumen} />
              <GananciaUsuarioDiario gananciaUsuarios={resumen.gananciaUsuarios} />
              <RankingRecepcionistas ranking={ranking} />
              <ServiciosVendidos
                servicios={servicios}
                filterTipo={filterTipo}
                setFilterTipo={setFilterTipo}
                filterNombre={filterNombre}
                setFilterNombre={setFilterNombre}
                handleExportExcel={handleExportExcel}
                handleExportPDF={handleExportPDF}
              />
              <TendenciasIngresos tendencias={tendencias} />
            </div>
        )}
      </div>
    </div>
  );
};

export default DashboardEstadisticasAdmin;
