import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { BASE_URL } from "../config/config";
import {
  FaMoneyBillWave,
  FaChartLine,
  FaHistory,
  FaPlus,
  FaClock,
  FaUsers,
  FaCalendarDay,
  FaSyncAlt,
  FaTimes,
} from "react-icons/fa";

export default function DashboardCajaAbierta({
  cajaActual,
  resumenHoy,
  onActualizar,
  egresosDiarios = [],
  honorariosPagados = 0,
}) {
  
  const navigate = useNavigate();
  const [ultimasTransacciones, setUltimasTransacciones] = useState([]);
  const [ingresosPorArea, setIngresosPorArea] = useState([]);
  const [loading, setLoading] = useState(false);
  const [mostrarDetalles, setMostrarDetalles] = useState(false);

  // Depuración: mostrar egresosDiarios cada vez que cambie
  useEffect(() => {
    console.log('egresosDiarios en DashboardCajaAbierta:', egresosDiarios);
  }, [egresosDiarios]);

  useEffect(() => {
    cargarDetalles();
  }, [cajaActual]);

  const cargarDetalles = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${BASE_URL}api_detalle_ingresos_hoy.php`, {
        credentials: "include",
      });
      const data = await response.json();

      if (data.success) {
        setUltimasTransacciones(data.ultimas_transacciones || []);
        setIngresosPorArea(data.ingresos_por_area || []);
      }
    } catch (error) {
      console.error("Error cargando detalles:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatearTiempo = (hora) => {
    return hora || "--:--";
  };

  const formatearMonto = (monto) => {
    return `S/ ${parseFloat(monto || 0).toFixed(2)}`;
  };

  const obtenerColorTipo = (tipo) => {
    const colores = {
      consulta: "bg-blue-100 text-blue-800",
      laboratorio: "bg-yellow-100 text-yellow-800",
      farmacia: "bg-purple-100 text-purple-800",
      ecografia: "bg-green-100 text-green-800",
      rayosx: "bg-red-100 text-red-800",
      procedimiento: "bg-gray-100 text-gray-800",
      otros: "bg-indigo-100 text-indigo-800",
    };
    return colores[tipo] || "bg-gray-100 text-gray-800";
  };

  const obtenerIconoMetodoPago = (metodo) => {
    const iconos = {
      efectivo: "💵",
      tarjeta_debito: "💳",
      tarjeta_credito: "💳",
      transferencia: "🏦",
      yape: "📱",
      plin: "📱",
      otros: "💰",
    };
    return iconos[metodo] || "💰";
  };

  // Calcular total egresos diarios si se provee
  const totalEgresosDiarios = Array.isArray(egresosDiarios)
    ? egresosDiarios.reduce((acc, e) => acc + parseFloat(e.monto), 0)
    : 0;

  return (
    <div className="space-y-6">
      {/* Estado de Caja - Header */}
      <div className="bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 rounded-xl p-4 md:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-3 md:gap-4">
            <div className="relative">
              <div className="w-12 h-12 md:w-16 md:h-16 bg-green-600 rounded-full flex items-center justify-center">
                <FaMoneyBillWave className="text-lg md:text-2xl text-white" />
              </div>
              <div className="absolute -top-1 -right-1 w-4 h-4 md:w-6 md:h-6 bg-green-400 rounded-full flex items-center justify-center">
                <div className="w-2 h-2 md:w-3 md:h-3 bg-white rounded-full animate-pulse"></div>
              </div>
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-green-700">
                Caja Abierta
              </h2>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 md:gap-6 text-green-600 mt-1 text-xs sm:text-sm">
                <div className="flex items-center gap-1">
                  <FaClock />
                  <span>Abierta desde: {cajaActual.hora_apertura}</span>
                </div>
                <div className="flex items-center gap-1">
                  <FaMoneyBillWave />
                  <span>
                    Inicial: {formatearMonto(cajaActual.monto_apertura)}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <FaCalendarDay />
                  <span>{new Date().toLocaleDateString("es-PE")}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            <button
              onClick={() => {
                onActualizar();
                cargarDetalles();
              }}
              className="bg-green-100 text-green-700 px-3 py-2 md:px-4 md:py-2 rounded-lg font-semibold hover:bg-green-200 transition-all flex items-center gap-1 md:gap-2 text-xs md:text-sm"
              disabled={loading}
            >
              <FaSyncAlt
                className={`${loading ? "animate-spin" : ""} text-sm`}
              />
              <span className="hidden sm:inline">Actualizar</span>
            </button>
            <button
              onClick={() => navigate("/contabilidad/cierre-caja")}
              className="bg-gradient-to-r from-red-500 to-red-600 text-white px-3 py-2 md:px-6 md:py-2 rounded-lg font-semibold hover:from-red-600 hover:to-red-700 transition-all flex items-center gap-1 md:gap-2 text-xs md:text-sm"
            >
              <FaTimes className="text-sm" />
              <span className="hidden sm:inline">Cerrar Caja</span>
            </button>
          </div>
        </div>
      </div>

      {/* Resumen Financiero - Cards Grandes */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-green-500 transform hover:scale-105 transition-all">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm font-medium uppercase tracking-wide">
                Efectivo
              </p>
              <p className="text-3xl font-bold text-green-600 mt-2">
                {formatearMonto(resumenHoy?.total_efectivo)}
              </p>
              <p className="text-green-500 text-sm mt-1">💵 En caja física</p>
            </div>
            <div className="text-5xl text-green-500 opacity-20">💵</div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-blue-500 transform hover:scale-105 transition-all">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm font-medium uppercase tracking-wide">
                Tarjetas
              </p>
              <p className="text-3xl font-bold text-blue-600 mt-2">
                {formatearMonto(resumenHoy?.total_tarjetas)}
              </p>
              <p className="text-blue-500 text-sm mt-1">💳 Débito/Crédito</p>
            </div>
            <div className="text-5xl text-blue-500 opacity-20">💳</div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-purple-500 transform hover:scale-105 transition-all">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm font-medium uppercase tracking-wide">
                Digital
              </p>
              <p className="text-3xl font-bold text-purple-600 mt-2">
                {formatearMonto(resumenHoy?.total_transferencias)}
              </p>
              <p className="text-purple-500 text-sm mt-1">
                📱 Yape/Plin/Transfer
              </p>
            </div>
            <div className="text-5xl text-purple-500 opacity-20">📱</div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-yellow-500 transform hover:scale-105 transition-all">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm font-medium uppercase tracking-wide">
                Total del Día
              </p>
              <p className="text-3xl font-bold text-yellow-600 mt-2">
                {formatearMonto(resumenHoy?.total_dia)}
              </p>
              <p className="text-yellow-500 text-sm mt-1">
                📊 Todos los ingresos
              </p>
            </div>
            <div className="text-5xl text-yellow-500 opacity-20">📊</div>
          </div>
        </div>

        {/* Card de egresos diarios */}
        <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-red-500 transform hover:scale-105 transition-all">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm font-medium uppercase tracking-wide">
                Egresos Diarios
              </p>
              <p className="text-3xl font-bold text-red-600 mt-2">
                S/ {totalEgresosDiarios.toFixed(2)}
              </p>
              <p className="text-red-500 text-sm mt-1">🧾 Pagos y salidas</p>
            </div>
            <div className="text-5xl text-red-500 opacity-20">🧾</div>
          </div>
        </div>

        {/* Card de honorarios médicos pagados */}
        <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-red-700 transform hover:scale-105 transition-all">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm font-medium uppercase tracking-wide">
                Honorarios Médicos Pagados
              </p>
              <p className="text-3xl font-bold text-red-700 mt-2">
                - S/ {parseFloat(honorariosPagados).toFixed(2)}
              </p>
              <p className="text-red-700 text-sm mt-1">👨‍⚕️ Pagos a médicos</p>
            </div>
            <div className="text-5xl text-red-700 opacity-20">👨‍⚕️</div>
          </div>
        </div>
      </div>

      {/* Secciones en dos columnas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Ingresos por Área */}
        {ingresosPorArea.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg p-6 h-96 dashboard-scroll-section">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <FaChartLine className="text-blue-600" />
                Ingresos por Área del Día
              </h3>
              <span className="text-sm text-gray-500">
                {ingresosPorArea.length} áreas activas
              </span>
            </div>
            <div className="overflow-y-auto h-72 pr-2">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {ingresosPorArea.map((area, index) => (
                  <div
                    key={index}
                    className="bg-gray-50 rounded-lg p-4 border hover:shadow-md transition-all"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold ${obtenerColorTipo(
                          area.tipo_ingreso
                        )}`}
                      >
                        {area.tipo_ingreso.toUpperCase()}
                      </span>
                      <span className="text-lg font-bold text-gray-800">
                        {formatearMonto(area.total_monto)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mb-1">{area.area}</p>
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <FaUsers />
                        {area.cantidad_transacciones} trans.
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        {/* Últimas Transacciones */}
        <div className="bg-white rounded-xl shadow-lg p-6 h-96 dashboard-scroll-section">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
              <FaHistory className="text-purple-600" />
              Últimas Transacciones
            </h3>
            <button
              onClick={() => navigate("/contabilidad/ingresos-detalle")}
              className="text-purple-600 hover:text-purple-800 font-semibold text-sm"
            >
              Ver todas →
            </button>
          </div>
          {ultimasTransacciones.length > 0 ? (
            <div className="overflow-y-auto h-72 pr-2">
              <div className="space-y-3">
                {ultimasTransacciones.map((transaccion, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">
                        {obtenerIconoMetodoPago(transaccion.metodo_pago)}
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-1 rounded text-xs font-semibold ${obtenerColorTipo(
                              transaccion.tipo_ingreso
                            )}`}
                          >
                            {transaccion.tipo_ingreso}
                          </span>
                          <span className="text-sm text-gray-600">
                            {transaccion.area}
                          </span>
                        </div>
                        <p className="text-sm text-gray-800 mt-1">
                          {transaccion.descripcion}
                        </p>
                        {transaccion.paciente_nombre && (
                          <p className="text-xs text-gray-500">
                            Paciente: {transaccion.paciente_nombre}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-green-600">
                        {formatearMonto(transaccion.monto)}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatearTiempo(transaccion.hora)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <FaHistory className="text-4xl mx-auto mb-2 opacity-50" />
              <p>No hay transacciones registradas hoy</p>
            </div>
          )}
        </div>
      </div>

      {/* Acciones Rápidas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <button
          onClick={() => navigate("/contabilidad/nuevo-ingreso")}
          className="bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-xl p-6 text-center font-semibold shadow-lg hover:from-blue-600 hover:to-blue-700 transition-all transform hover:scale-105"
        >
          <FaPlus className="text-3xl mx-auto mb-3" />
          <h3 className="text-lg font-bold mb-2">Registrar Ingreso</h3>
          <p className="text-blue-100 text-sm">Agregar nuevo ingreso manual</p>
        </button>

        <button
          onClick={() => navigate("/contabilidad/ingresos-detalle")}
          className="bg-gradient-to-br from-purple-500 to-purple-600 text-white rounded-xl p-6 text-center font-semibold shadow-lg hover:from-purple-600 hover:to-purple-700 transition-all transform hover:scale-105"
        >
          <FaHistory className="text-3xl mx-auto mb-3" />
          <h3 className="text-lg font-bold mb-2">Ver Detalle Completo</h3>
          <p className="text-purple-100 text-sm">Historial completo del día</p>
        </button>

        <button
          onClick={() => navigate("/contabilidad/reportes-ingresos")}
          className="bg-gradient-to-br from-green-500 to-green-600 text-white rounded-xl p-6 text-center font-semibold shadow-lg hover:from-green-600 hover:to-green-700 transition-all transform hover:scale-105"
        >
          <FaChartLine className="text-3xl mx-auto mb-3" />
          <h3 className="text-lg font-bold mb-2">Reportes y Análisis</h3>
          <p className="text-green-100 text-sm">
            Análisis detallado de ingresos
          </p>
        </button>
      </div>
    </div>
  );
}
