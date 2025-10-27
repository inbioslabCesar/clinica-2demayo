import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { BASE_URL } from "../config/config";
import { 
  FaLock, 
  FaArrowLeft, 
  FaCalculator,
  FaMoneyBillWave,
  FaCreditCard,
  FaExchangeAlt,
  FaListAlt
} from "react-icons/fa";
import Swal from 'sweetalert2';
import Spinner from "../components/Spinner";

export default function CierreCajaPage() {
  const [honorariosPagados, setHonorariosPagados] = useState(0);
  useEffect(() => {
    console.log('Honorarios Médicos Pagados:', honorariosPagados);
  }, [honorariosPagados]);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [procesando, setProcesando] = useState(false);
  const [cajaActual, setCajaActual] = useState(null);
  const [resumenIngresos, setResumenIngresos] = useState(null);
  const [ingresosDiarios, setIngresosDiarios] = useState([]);
  // Paginación para la tabla de ingresos diarios
  const [pageSize, setPageSize] = useState(3);
  const [currentPage, setCurrentPage] = useState(1);
  // Estados para el formulario de cierre
  const [montosCierre, setMontosCierre] = useState({
    efectivo_contado: '',
    tarjetas_contado: '',
    transferencias_contado: '',
    otros_contado: ''
  });
  const [observacionesCierre, setObservacionesCierre] = useState('');
  // Egresos diarios reales desde backend
  const [egresosDiarios, setEgresosDiarios] = useState([]);
  const totalEgresosDiarios = Array.isArray(egresosDiarios)
    ? egresosDiarios.reduce((acc, e) => acc + parseFloat(e.monto), 0)
    : 0;

  useEffect(() => {
    const cargarDatos = async () => {
    try {
      setLoading(true);

      // Verificar que hay una caja abierta
      const cajaResp = await fetch(`${BASE_URL}api_caja_actual.php`, { 
        credentials: 'include' 
      });
      const cajaData = await cajaResp.json();

      if (!cajaData.success || !cajaData.caja) {
        Swal.fire({
          icon: 'warning',
          title: 'No hay caja abierta',
          text: 'No se puede realizar el cierre porque no hay una caja abierta',
          confirmButtonText: 'Volver a Ingresos'
        }).then(() => {
          navigate('/contabilidad/ingresos');
        });
        return;
      }

      setCajaActual(cajaData.caja);

      // Cargar resumen de ingresos del día
      const resumenResp = await fetch(`${BASE_URL}api_resumen_ingresos.php?caja_id=${cajaData.caja.id}`, { 
        credentials: 'include' 
      });
      const resumenData = await resumenResp.json();
      if (resumenData.success) {
        setResumenIngresos(resumenData.resumen);
      }

      // Cargar honorarios médicos pagados
      const honorariosResp = await fetch(`${BASE_URL}api_honorarios_pagados_caja.php?caja_id=${cajaData.caja.id}`, { credentials: 'include' });
      const honorariosData = await honorariosResp.json();
      if (honorariosData.success) {
        setHonorariosPagados(honorariosData.total_honorarios);
      }

      // Cargar detalles de ingresos diarios
      const ingresosResp = await fetch(`${BASE_URL}api_ingresos_detalle.php?caja_id=${cajaData.caja.id}`, { 
        credentials: 'include' 
      });
      const ingresosData = await ingresosResp.json();
      if (ingresosData.success) {
        setIngresosDiarios(ingresosData.ingresos || []);
      }

      // Cargar egresos diarios reales
      const egresosResp = await fetch(`${BASE_URL}api_egresos.php?caja_id=${cajaData.caja.id}`, { credentials: 'include' });
      const egresosData = await egresosResp.json();
      if (egresosData.success) {
        setEgresosDiarios(egresosData.egresos || []);
      }

    } catch (error) {
      console.error('Error cargando datos:', error);
      Swal.fire('Error', 'Error al cargar los datos del cierre', 'error');
    } finally {
      setLoading(false);
    }
  };
  cargarDatos();
  }, [navigate]);

  

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setMontosCierre(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const calcularDiferencias = () => {
  if (!resumenIngresos) return {};

  const diferencias = {};
  // Descontar honorarios pagados y egresos diarios del efectivo del sistema
  const efectivoSistema = Math.max(0, parseFloat(resumenIngresos.total_efectivo || 0) - honorariosPagados - totalEgresosDiarios);
  const tarjetasSistema = parseFloat(resumenIngresos.total_tarjetas || 0);
  const transferenciasSistema = parseFloat(resumenIngresos.total_transferencias || 0);
  const otrosSistema = parseFloat(resumenIngresos.total_otros || 0);

  diferencias.efectivo = parseFloat(montosCierre.efectivo_contado || 0) - efectivoSistema;
  diferencias.tarjetas = parseFloat(montosCierre.tarjetas_contado || 0) - tarjetasSistema;
  diferencias.transferencias = parseFloat(montosCierre.transferencias_contado || 0) - transferenciasSistema;
  diferencias.otros = parseFloat(montosCierre.otros_contado || 0) - otrosSistema;
  diferencias.total = diferencias.efectivo + diferencias.tarjetas + diferencias.transferencias + diferencias.otros;

  return diferencias;
  };

  const procesarCierre = async () => {
    // Validaciones
    if (!montosCierre.efectivo_contado) {
      Swal.fire('Error', 'Debe ingresar el monto de efectivo contado', 'error');
      return;
    }

    const diferencias = calcularDiferencias();
    
    // Confirmar cierre
    const confirmacion = await Swal.fire({
      title: 'Confirmar Cierre de Caja',
      html: `
        <div class="text-left">
          <p><strong>Fecha:</strong> ${cajaActual?.fecha}</p>
          <p><strong>Usuario:</strong> ${cajaActual?.usuario_nombre}</p>
          <br>
          <p><strong>Resumen de diferencias:</strong></p>
          <ul>
            <li>Efectivo: S/ ${diferencias.efectivo.toFixed(2)}</li>
            <li>Tarjetas: S/ ${diferencias.tarjetas.toFixed(2)}</li>
            <li>Transferencias: S/ ${diferencias.transferencias.toFixed(2)}</li>
            <li>Otros: S/ ${diferencias.otros.toFixed(2)}</li>
          </ul>
          <p><strong>Diferencia Total: S/ ${diferencias.total.toFixed(2)}</strong></p>
        </div>
      `,
      icon: Math.abs(diferencias.total) > 10 ? 'warning' : 'question',
      showCancelButton: true,
      confirmButtonText: 'Confirmar Cierre',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: diferencias.total < 0 ? '#d33' : '#3085d6'
    });

    if (!confirmacion.isConfirmed) return;

    try {
      setProcesando(true);

      const response = await fetch(`${BASE_URL}api_cerrar_caja.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          caja_id: cajaActual.id,
          efectivo_contado: parseFloat(montosCierre.efectivo_contado),
          tarjetas_contado: parseFloat(montosCierre.tarjetas_contado || 0),
          transferencias_contado: parseFloat(montosCierre.transferencias_contado || 0),
          otros_contado: parseFloat(montosCierre.otros_contado || 0),
          observaciones: observacionesCierre.trim(),
          diferencias: diferencias
        })
      });

      const data = await response.json();

      if (data.success) {
        Swal.fire({
          icon: 'success',
          title: '¡Caja Cerrada Exitosamente!',
          html: `
            <div class="text-left">
              <p>La caja ha sido cerrada correctamente.</p>
              <p><strong>Diferencia final:</strong> S/ ${diferencias.total.toFixed(2)}</p>
              <br>
              <p>Se ha generado el reporte de cierre.</p>
            </div>
          `,
          confirmButtonText: 'Continuar'
        }).then(() => {
          navigate('/contabilidad/ingresos');
        });
      } else {
        Swal.fire('Error', data.error || 'Error al cerrar la caja', 'error');
      }

    } catch (error) {
      console.error('Error:', error);
      Swal.fire('Error', 'Error de conexión', 'error');
    } finally {
      setProcesando(false);
    }
  };

  if (loading) return <Spinner />;

  if (!cajaActual) {
    return (
      <div className="max-w-4xl mx-auto p-6 text-center">
        <h1 className="text-2xl font-bold text-gray-800 mb-4">No hay caja abierta</h1>
        <button
          onClick={() => navigate('/contabilidad/ingresos')}
          className="bg-blue-500 text-white px-6 py-3 rounded-lg hover:bg-blue-600"
        >
          Volver a Ingresos
        </button>
      </div>
    );
  }

  const diferencias = calcularDiferencias();

  return (
  <div className="max-w-[1600px] mx-auto p-8">
      {/* Header */}
      <div className="mb-8">
        <button 
          onClick={() => navigate('/contabilidad/ingresos')}
          className="mb-4 bg-gradient-to-r from-gray-200 to-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:from-gray-300 hover:to-gray-400 flex items-center gap-2 font-semibold transition-all"
        >
          <FaArrowLeft />
          Volver a Ingresos
        </button>

        <div className="flex items-center gap-3 mb-6">
          <FaLock className="text-4xl text-red-600" />
          <div>
            <h1 className="text-3xl font-bold text-gray-800">Cierre de Caja</h1>
            <p className="text-gray-600">Finalizar jornada y generar reporte de cierre</p>
          </div>
        </div>

        {/* Info de la caja */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <span className="font-semibold text-blue-800">Fecha:</span>
              <p className="text-blue-700">{cajaActual.fecha}</p>
            </div>
            <div>
              <span className="font-semibold text-blue-800">Hora apertura:</span>
              <p className="text-blue-700">{cajaActual.hora_apertura}</p>
            </div>
            <div>
              <span className="font-semibold text-blue-800">Monto apertura:</span>
              <p className="text-blue-700">S/ {parseFloat(cajaActual.monto_apertura || 0).toFixed(2)}</p>
            </div>
          </div>
          {/* Monto total del día antes de descontar honorarios */}
          {resumenIngresos && (
            <div className="mt-4 p-5 bg-yellow-100 border-2 border-yellow-400 rounded-xl flex flex-col items-center justify-center shadow-lg">
              <span className="font-bold text-yellow-900 text-xl mb-2 tracking-wide">Monto Total del Día</span>
              <span className="text-4xl font-extrabold text-yellow-700 drop-shadow-lg">S/ {parseFloat(resumenIngresos.total_dia || 0).toFixed(2)}</span>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Resumen del sistema */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
            <FaCalculator />
            Resumen del Sistema
          </h2>

          {resumenIngresos && (
            <div className="space-y-4">
              <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <FaMoneyBillWave className="text-green-600" />
                  <span className="font-semibold">Efectivo</span>
                </div>
                <span className="font-bold text-green-700">
                  S/ {parseFloat(resumenIngresos.total_efectivo || 0).toFixed(2)}
                </span>
              </div>

              <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <FaCreditCard className="text-blue-600" />
                  <span className="font-semibold">Tarjetas</span>
                </div>
                <span className="font-bold text-blue-700">
                  S/ {parseFloat(resumenIngresos.total_tarjetas || 0).toFixed(2)}
                </span>
              </div>

              <div className="flex justify-between items-center p-3 bg-purple-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <FaExchangeAlt className="text-purple-600" />
                  <span className="font-semibold">Transferencias</span>
                </div>
                <span className="font-bold text-purple-700">
                  S/ {parseFloat(resumenIngresos.total_transferencias || 0).toFixed(2)}
                </span>
              </div>

              <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <FaListAlt className="text-gray-600" />
                  <span className="font-semibold">Otros</span>
                </div>
                <span className="font-bold text-gray-700">
                  S/ {parseFloat(resumenIngresos.total_otros || 0).toFixed(2)}
                </span>
              </div>

              <div className="flex justify-between items-center p-3 bg-red-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-red-700">Honorarios Médicos Pagados</span>
                </div>
                <span className="font-bold text-red-700">
                  - S/ {honorariosPagados.toFixed(2)}
                </span>
              </div>

              {/* Card de egresos diarios */}
              <div className="flex justify-between items-center p-3 bg-red-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-red-700">Egresos Diarios</span>
                </div>
                <span className="font-bold text-red-700">
                  - S/ {totalEgresosDiarios.toFixed(2)}
                </span>
              </div>

              <div className="border-t pt-4">
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between items-center text-lg font-bold">
                    <span>Total del Sistema:</span>
                    <span className="text-blue-600">
                      S/ {(
                        Math.max(0, parseFloat(resumenIngresos.total_dia || 0) - honorariosPagados - totalEgresosDiarios)
                      ).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-lg font-bold mt-4 p-3 bg-blue-50 rounded-lg shadow">
                    <span>Saldo esperado en caja física al cierre:</span>
                    <span className="text-blue-900 text-2xl font-extrabold">
                      S/ {(
                        parseFloat(cajaActual?.monto_apertura || 0) + Math.max(0, parseFloat(resumenIngresos.total_dia || 0) - honorariosPagados - totalEgresosDiarios)
                      ).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Formulario de cierre */}
  <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-xl font-bold text-gray-800 mb-6">Conteo Real</h2>

          <div className="space-y-4">
            {/* Efectivo */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Efectivo Contado *
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">S/</span>
                <input
                  type="number"
                  name="efectivo_contado"
                  value={montosCierre.efectivo_contado}
                  onChange={handleInputChange}
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  className="w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
              {resumenIngresos && montosCierre.efectivo_contado && (
                <div className={`text-sm mt-1 ${diferencias.efectivo === 0 ? 'text-green-600' : 'text-red-600'}`}>
                  Diferencia: S/ {diferencias.efectivo.toFixed(2)}
                </div>
              )}
            </div>

            {/* Tarjetas */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Tarjetas Reportadas
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">S/</span>
                <input
                  type="number"
                  name="tarjetas_contado"
                  value={montosCierre.tarjetas_contado}
                  onChange={handleInputChange}
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  className="w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              {resumenIngresos && montosCierre.tarjetas_contado && (
                <div className={`text-sm mt-1 ${diferencias.tarjetas === 0 ? 'text-green-600' : 'text-red-600'}`}>
                  Diferencia: S/ {diferencias.tarjetas.toFixed(2)}
                </div>
              )}
            </div>

            {/* Transferencias */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Transferencias Confirmadas
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">S/</span>
                <input
                  type="number"
                  name="transferencias_contado"
                  value={montosCierre.transferencias_contado}
                  onChange={handleInputChange}
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  className="w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              {resumenIngresos && montosCierre.transferencias_contado && (
                <div className={`text-sm mt-1 ${diferencias.transferencias === 0 ? 'text-green-600' : 'text-red-600'}`}>
                  Diferencia: S/ {diferencias.transferencias.toFixed(2)}
                </div>
              )}
            </div>

            {/* Otros */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Otros Métodos
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">S/</span>
                <input
                  type="number"
                  name="otros_contado"
                  value={montosCierre.otros_contado}
                  onChange={handleInputChange}
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  className="w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              {resumenIngresos && montosCierre.otros_contado && (
                <div className={`text-sm mt-1 ${diferencias.otros === 0 ? 'text-green-600' : 'text-red-600'}`}>
                  Diferencia: S/ {diferencias.otros.toFixed(2)}
                </div>
              )}
            </div>

            {/* Diferencia total */}
            {resumenIngresos && Object.values(montosCierre).some(v => v) && (
              <div className={`p-4 rounded-lg ${Math.abs(diferencias.total) <= 1 ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                <div className="text-center">
                  <span className="font-semibold">Diferencia Total:</span>
                  <div className={`text-2xl font-bold ${diferencias.total >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    S/ {diferencias.total.toFixed(2)}
                  </div>
                </div>
              </div>
            )}

            {/* Observaciones */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Observaciones del Cierre
              </label>
              <textarea
                value={observacionesCierre}
                onChange={(e) => setObservacionesCierre(e.target.value)}
                rows="3"
                placeholder="Notas sobre diferencias, incidencias, etc."
                className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
              />
            </div>

            {/* Botón de cierre */}
            <button
              onClick={procesarCierre}
              disabled={!montosCierre.efectivo_contado || procesando}
              className="w-full px-6 py-4 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg font-semibold hover:from-red-600 hover:to-red-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-lg"
            >
              {procesando ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
                  Procesando Cierre...
                </>
              ) : (
                <>
                  <FaLock />
                  Cerrar Caja
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Detalle de ingresos con paginación */}
      {ingresosDiarios.length > 0 && (
  <div className="mt-8 bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-xl font-bold text-gray-800 mb-4">Detalle de Ingresos del Día</h2>
          {/* Selector de tamaño de página */}
          <div className="mb-4 flex items-center gap-3">
            <label className="font-semibold text-gray-700">Filas por página:</label>
            <select
              value={pageSize}
              onChange={e => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="border rounded px-2 py-1"
            >
              <option value={3}>3</option>
              <option value={5}>5</option>
              <option value={10}>10</option>
            </select>
          </div>
          {/* Tabla paginada */}
          <div className="overflow-x-auto" style={{ maxHeight: '340px', overflowY: 'auto' }}>
            <table className="w-full">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left p-3">Hora</th>
                  <th className="text-left p-3">Tipo</th>
                  <th className="text-left p-3">Área</th>
                  <th className="text-left p-3">Descripción</th>
                  <th className="text-left p-3">Método</th>
                  <th className="text-right p-3">Monto</th>
                </tr>
              </thead>
              <tbody>
                {ingresosDiarios
                  .slice((currentPage - 1) * pageSize, currentPage * pageSize)
                  .map((ingreso, index) => (
                    <tr key={index} className="border-b hover:bg-gray-50">
                      <td className="p-3">
                        {new Date(ingreso.fecha_hora).toLocaleTimeString('es-PE', { 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        })}
                      </td>
                      <td className="p-3 capitalize">{ingreso.tipo_ingreso}</td>
                      <td className="p-3">{ingreso.area}</td>
                      <td className="p-3">{ingreso.descripcion}</td>
                      <td className="p-3 capitalize">{ingreso.metodo_pago}</td>
                      <td className="p-3 text-right font-semibold">
                        S/ {parseFloat(ingreso.monto).toFixed(2)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {/* Controles de paginación */}
          <div className="mt-4 flex justify-between items-center">
            <span className="text-sm text-gray-600">
              Mostrando {Math.min(pageSize, ingresosDiarios.length - (currentPage - 1) * pageSize)} de {ingresosDiarios.length} ingresos
            </span>
            <div className="flex items-center gap-2">
              <button
                className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 disabled:opacity-50"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(currentPage - 1)}
              >Anterior</button>
              <span className="text-sm">Página {currentPage} de {Math.ceil(ingresosDiarios.length / pageSize)}</span>
              <button
                className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 disabled:opacity-50"
                disabled={currentPage === Math.ceil(ingresosDiarios.length / pageSize)}
                onClick={() => setCurrentPage(currentPage + 1)}
              >Siguiente</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}