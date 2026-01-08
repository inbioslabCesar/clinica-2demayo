import React, { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { BASE_URL } from "../config/config";
import Spinner from "../components/comunes/Spinner";
import { FaMoneyBillWave, FaUserCircle, FaClipboardList } from "react-icons/fa";
import Swal from 'sweetalert2';

export default function ConsumoPacientePage() {
  const [modalVisible, setModalVisible] = useState(false);
  const [modalDetalle, setModalDetalle] = useState(null);
  const [modalDetallesCobro, setModalDetallesCobro] = useState([]);
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const { pacienteId } = useParams();
  const navigate = useNavigate();
  const [consumo, setConsumo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(3);

  // Reiniciar página al cambiar cantidad de filas
  useEffect(() => { setPage(1); }, [itemsPerPage]);

  useEffect(() => {
  fetch(`${BASE_URL}api_consumos_paciente.php?paciente_id=${pacienteId}`, { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        if (data.success) setConsumo(data);
        else setError(data.error || "Error al cargar consumo");
        setLoading(false);
      })
      .catch(() => {
        setError("Error de conexión con el servidor");
        setLoading(false);
      });
  }, [pacienteId]);
  
  // Memo: base del historial
  const historialBase = useMemo(() => (
    Array.isArray(consumo?.historial) ? consumo.historial : []
  ), [consumo]);
  // Filtrar por fecha (solo parte de la fecha, ignorando hora)
  function soloFecha(fechaStr) {
    // Si la fecha viene como 'YYYY-MM-DD' o 'YYYY-MM-DD HH:mm:ss', toma solo la parte de la fecha
    return fechaStr.split(' ')[0];
  }
  const historialFiltrado = useMemo(() => {
    let arr = historialBase;
    if (fechaInicio) arr = arr.filter(item => soloFecha(item.fecha) >= fechaInicio);
    if (fechaFin) arr = arr.filter(item => soloFecha(item.fecha) <= fechaFin);
    return arr;
  }, [historialBase, fechaInicio, fechaFin]);
  // Agrupar por cobro (por fecha y monto total)
  const cobrosAgrupados = useMemo(() => {
    const grupos = {};
    historialFiltrado.forEach(item => {
      const key = soloFecha(item.fecha) + '_' + item.monto + '_' + item.servicio;
      if (!grupos[key]) {
        grupos[key] = {
          fecha: item.fecha,
          servicio: item.servicio,
          montoTotal: 0,
          detalles: []
        };
      }
      grupos[key].detalles.push(item);
      grupos[key].montoTotal += Number(item.monto);
    });
    return Object.values(grupos);
  }, [historialFiltrado]);
    if (loading) return <Spinner />;
    if (error) return <div className="text-red-600 font-bold p-6">{error}</div>;
  // Calcular paginación
  const totalItems = cobrosAgrupados.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  const startIdx = (page - 1) * itemsPerPage;
  const endIdx = startIdx + itemsPerPage;
  const gruposPagina = cobrosAgrupados.slice(startIdx, endIdx);

  function imprimirTicketCobro() {
    if (!modalDetalle || !modalDetallesCobro) return;
    const fechaHora = new Date(modalDetalle.fecha).toLocaleString('es-PE');
    const nombreCompleto = consumo.apellido ? `${consumo.nombre} ${consumo.apellido}` : consumo.nombre;
    const tipoPago = modalDetalle.tipo_pago ? modalDetalle.tipo_pago.toUpperCase() : (modalDetalle.detalles && modalDetalle.detalles[0]?.tipo_pago ? modalDetalle.detalles[0].tipo_pago.toUpperCase() : 'EFECTIVO');
    const cobertura = modalDetalle.cobertura ? modalDetalle.cobertura.toUpperCase() : (modalDetalle.detalles && modalDetalle.detalles[0]?.cobertura ? modalDetalle.detalles[0].cobertura.toUpperCase() : 'PARTICULAR');
    const ticketHtml = `
      <div style="font-family: monospace; width: 320px; margin: 0 auto;">
        <h3 style="text-align: center; margin-bottom: 10px;">🏥 CLÍNICA 2 DE MAYO</h3>
        <hr>
        <p><strong>COMPROBANTE DE PAGO #${modalDetalle.cobro_id || ''}</strong></p>
        <p>Fecha: ${fechaHora}</p>
        <p>Paciente: ${nombreCompleto}</p>
        <p>DNI: ${consumo.dni}</p>
        <p>H.C.: ${consumo.historia_clinica}</p>
        <hr>
        <p><strong>DETALLE:</strong></p>
        ${modalDetallesCobro.map(d => 
          `<p>${d.descripcion} x${d.cantidad || 1} .... S/ ${(d.subtotal || d.monto).toFixed(2)}</p>`
        ).join('')}
        <hr>
        <p style="font-weight:bold; font-size:17px; color:#008000;">TOTAL: S/ ${modalDetallesCobro.reduce((sum, d) => sum + Number(d.subtotal || d.monto), 0).toFixed(2)}</p>
        <p>Tipo de pago: ${tipoPago}</p>
        <p>Cobertura: ${cobertura}</p>
        <hr>
        <div style="text-align: center; font-size: 12px;">Gracias por su preferencia<br>Conserve este comprobante</div>
      </div>
    `;
    Swal.fire({
      title: 'Ticket de Cobro',
      html: ticketHtml,
      icon: 'info',
      confirmButtonText: 'Imprimir',
      showCancelButton: true,
      cancelButtonText: 'Cerrar'
    }).then((result) => {
      if (result.isConfirmed) {
        const ventana = window.open('', '_blank', 'width=400,height=600');
        ventana.document.write(`<html><head><title>Ticket</title></head><body>${ticketHtml}</body></html>`);
        ventana.document.close();
        ventana.print();
      }
    });
  }

  function navegarEditarCotizacion() {
    if (!modalDetalle) return;
    const servicio = String(modalDetalle.servicio || '').toLowerCase();
    const map = {
      laboratorio: '/cotizar-laboratorio',
      ecografia: '/cotizar-ecografia',
      rayosx: '/cotizar-rayosx',
      'rayos_x': '/cotizar-rayosx',
      procedimiento: '/cotizar-procedimientos',
      procedimientos: '/cotizar-procedimientos',
      operacion: '/cotizar-operacion',
      operaciones: '/cotizar-operacion',
      farmacia: '/cotizar-farmacia',
      consulta: '/agendar-consulta' // ir directo a agendar consulta cuando es consulta
    };
    const base = map[servicio] || '/seleccionar-servicio';
    // Incluir cotizacion_id si está disponible en los detalles
    const cotizacionId = (modalDetalle.detalles && modalDetalle.detalles[0] && modalDetalle.detalles[0].cotizacion_id) ? modalDetalle.detalles[0].cotizacion_id : null;
    const queryParams = new URLSearchParams();
    if (modalDetalle.cobro_id) queryParams.set('cobro_id', modalDetalle.cobro_id);
    if (cotizacionId) queryParams.set('cotizacion_id', cotizacionId);
    // Las rutas de cotización esperan :pacienteId
    const path = base.includes('/cotizar-')
      ? `${base}/${pacienteId}?${queryParams.toString()}`
      : `${base}?${queryParams.toString()}&paciente_id=${pacienteId}`;
    setModalVisible(false);
    navigate(path);
  }

  return (
    <div className="max-w-3xl mx-auto p-6 bg-white rounded-xl shadow-lg mt-8 font-sans">
      {/* Modal de detalle de servicio */}
      {modalVisible && modalDetalle && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 max-w-lg w-full relative">
            <button
              className="absolute top-2 right-2 text-gray-500 hover:text-red-600 text-xl font-bold"
              onClick={() => setModalVisible(false)}
            >×</button>
            <h3 className="text-lg font-bold mb-2 text-blue-800">Detalle del Cobro</h3>
            <div className="mb-2">
              <span className="font-semibold">Fecha:</span> {modalDetalle.fecha}<br />
            </div>
            <div className="max-h-[50vh] overflow-y-auto rounded mb-4 border">
              <table className="min-w-full">
              <thead>
                <tr className="bg-blue-100">
                  <th className="px-2 py-1 border text-left">Servicio</th>
                  <th className="px-2 py-1 border text-left">Descripción</th>
                  <th className="px-2 py-1 border text-right">Monto (S/)</th>
                  <th className="px-2 py-1 border text-center">Acción</th>
                </tr>
              </thead>
              <tbody>
                {modalDetallesCobro.map((d, i) => {
                  const servicioTipo = d.servicio_tipo || modalDetalle.servicio;
                  return (
                    <tr key={i}>
                      <td className="border px-2 py-1">{servicioTipo}</td>
                      <td className="border px-2 py-1">{d.descripcion && d.descripcion !== "0" ? d.descripcion : <span className="italic text-gray-500">Sin detalle</span>}</td>
                      <td className="border px-2 py-1 text-right">{Number(d.subtotal || d.monto).toFixed(2)}</td>
                      <td className="border px-2 py-1 text-center">
                        <button
                          className="text-red-600 hover:text-red-800 text-xs font-semibold"
                          onClick={async () => {
                            const monto = Number(d.subtotal || d.monto || 0);
                            const confirma = await Swal.fire({
                              title: monto >= 500 ? 'Eliminar ítem de alto impacto' : 'Eliminar ítem',
                              text: servicioTipo === 'farmacia' ? '¿Eliminar y reponer stock?' : '¿Eliminar este servicio del cobro?',
                              icon: 'warning',
                              showCancelButton: true,
                              confirmButtonText: 'Continuar',
                              cancelButtonText: 'Cancelar',
                              input: 'text',
                              inputLabel: 'Motivo de la eliminación',
                              inputPlaceholder: 'Ej. error de registro, duplicado, ajuste',
                              inputValidator: (value) => {
                                if (!value || value.trim().length < 4) {
                                  return 'Ingresa un motivo (mínimo 4 caracteres)';
                                }
                                return undefined;
                              }
                            });
                            if (!confirma.isConfirmed) return;
                            const motivo = (confirma.value || '').trim();

                            if (monto >= 500) {
                              const confirma2 = await Swal.fire({
                                title: 'Confirmación final',
                                html: `<div style='font-size:1.05em'>Este ítem tiene un monto de <b>S/ ${monto.toFixed(2)}</b>.<br/>Es una eliminación de alto impacto.</div>`,
                                icon: 'warning',
                                showCancelButton: true,
                                confirmButtonText: 'Eliminar definitivamente',
                                cancelButtonText: 'Cancelar',
                                input: 'text',
                                inputPlaceholder: 'Escribe ELIMINAR para confirmar',
                                inputValidator: (value) => {
                                  if (value !== 'ELIMINAR') return 'Debes escribir ELIMINAR';
                                  return undefined;
                                }
                              });
                              if (!confirma2.isConfirmed) return;
                            }
                            try {
                              const resp = await fetch(`${BASE_URL}api_cobro_eliminar_item.php`, {
                                method: 'POST',
                                credentials: 'include',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  cobro_id: modalDetalle.cobro_id,
                                  servicio_tipo: servicioTipo,
                                  motivo,
                                  item: {
                                    servicio_id: d.servicio_id,
                                    descripcion: d.descripcion,
                                    cantidad: d.cantidad,
                                    precio_unitario: d.precio_unitario,
                                    subtotal: d.subtotal || d.monto,
                                    derivado: d.derivado,
                                    tipo_derivacion: d.tipo_derivacion,
                                    valor_derivacion: d.valor_derivacion,
                                    laboratorio_referencia: d.laboratorio_referencia
                                  }
                                })
                              });
                              const data = await resp.json();
                              if (data.success) {
                                Swal.fire('Eliminado', 'Ítem eliminado correctamente.', 'success');
                                setModalDetallesCobro(prev => prev.filter((_, idx) => idx !== i));
                                fetch(`${BASE_URL}api_consumos_paciente.php?paciente_id=${pacienteId}`, { credentials: 'include' })
                                  .then(r => r.json())
                                  .then(n => { if (n.success) setConsumo(n); });
                              } else {
                                Swal.fire('Error', data.error || 'No se pudo eliminar', 'error');
                              }
                            } catch {
                              Swal.fire('Error', 'Fallo de conexión con el servidor', 'error');
                            }
                          }}
                        >Eliminar</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              </table>
            </div>
            <div className="font-bold text-right text-green-700 text-lg mb-4">
              Total: S/ {modalDetallesCobro.reduce((sum, d) => sum + Number(d.subtotal || d.monto), 0).toFixed(2)}
            </div>
            {String(modalDetalle.servicio).toLowerCase() === 'consulta' && (
              <div className="mb-3 p-2 bg-blue-50 border border-blue-200 rounded text-blue-800 text-sm">
                Las consultas no admiten edición. Solo puedes eliminar este ítem.
                Para reprogramar, agenda una nueva cita desde "Consulta Médica".
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {String(modalDetalle.servicio).toLowerCase() !== 'consulta' && (
                <button
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded shadow"
                  onClick={navegarEditarCotizacion}
                >Editar cotización</button>
              )}
              <button
                className="w-full py-2 bg-green-600 hover:bg-green-700 text-white font-bold rounded shadow"
                onClick={imprimirTicketCobro}
              >Imprimir ticket</button>
            </div>
          </div>
        </div>
      )}
      <button onClick={() => navigate(-1)} className="mb-4 bg-gradient-to-r from-blue-200 to-purple-200 px-4 py-2 rounded hover:bg-blue-300 flex items-center gap-2 text-blue-900 font-semibold">
        ← Volver
      </button>
      <div className="flex items-center gap-3 mb-4">
        <FaUserCircle className="text-3xl text-blue-700" />
        <h2 className="text-2xl font-bold text-blue-800">Consumo del Paciente</h2>
      </div>
      <div className="mb-6 grid grid-cols-2 gap-4 bg-blue-50 rounded-lg p-4">
        <div>
          <span className="font-semibold text-gray-700">ID:</span> {consumo.paciente_id} <br />
          <span className="font-semibold text-gray-700">Nombre:</span> {consumo.nombre} {consumo.apellido} <br />
          <span className="font-semibold text-gray-700">DNI:</span> {consumo.dni}
        </div>
        <div>
          <span className="font-semibold text-gray-700">Historia Clínica:</span> {consumo.historia_clinica} <br />
          <span className="inline-flex items-center gap-2 font-bold text-green-700 text-lg mt-2">
            <FaMoneyBillWave className="text-2xl" />
            Consumo Total: S/ {consumo.consumo_total.toFixed(2)}
          </span>
          {consumo.deuda_total > 0 && (
            <span className="inline-flex items-center gap-2 font-bold text-red-600 text-lg mt-2 ml-4">
              <FaMoneyBillWave className="text-2xl" />
              Deuda: S/ {consumo.deuda_total.toFixed(2)}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 mt-8 mb-2">
        <FaClipboardList className="text-xl text-purple-700" />
        <h4 className="font-semibold text-lg text-purple-800">Historial de Servicios</h4>
      </div>
      {/* Filtros por fecha */}
      <div className="flex flex-wrap gap-4 mb-4 items-center">
        <div className="flex items-center gap-2">
          <label htmlFor="fechaInicio" className="font-semibold text-gray-700">Desde:</label>
          <input
            type="date"
            id="fechaInicio"
            value={fechaInicio}
            onChange={e => setFechaInicio(e.target.value)}
            className="border rounded px-2 py-1 text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="fechaFin" className="font-semibold text-gray-700">Hasta:</label>
          <input
            type="date"
            id="fechaFin"
            value={fechaFin}
            onChange={e => setFechaFin(e.target.value)}
            className="border rounded px-2 py-1 text-sm"
          />
        </div>
        <button
          onClick={() => { setFechaInicio(""); setFechaFin(""); }}
          className="bg-gray-200 text-gray-700 px-4 py-2 rounded hover:bg-gray-300 font-semibold"
        >Limpiar Filtros</button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full border rounded-lg shadow-sm">
          <thead>
            <tr className="bg-gradient-to-r from-blue-100 to-purple-100">
              <th className="px-3 py-2 border text-left">Fecha</th>
              <th className="px-3 py-2 border text-left">Servicio</th>
              <th className="px-3 py-2 border text-left">Descripción</th>
              <th className="px-3 py-2 border text-right">Monto (S/)</th>
            </tr>
          </thead>
          <tbody>
            {cobrosAgrupados.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-center py-6 text-gray-500">No hay servicios registrados.</td>
              </tr>
            ) : (
              gruposPagina.map((grupo, idx) => (
                <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-blue-50"}>
                  <td className="border px-3 py-2">{grupo.fecha}</td>
                  <td className="border px-3 py-2">
                    <span className={`inline-block px-2 py-1 rounded text-xs font-semibold ${
                      grupo.servicio === 'consulta' ? 'bg-green-100 text-green-700' :
                      grupo.servicio === 'laboratorio' ? 'bg-yellow-100 text-yellow-700' :
                      grupo.servicio === 'farmacia' ? 'bg-purple-100 text-purple-700' :
                      grupo.servicio === 'procedimiento' ? 'bg-blue-100 text-blue-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {grupo.servicio}
                      {/* Ícono de descarga si hay resultados de laboratorio */}
                      {grupo.servicio === 'laboratorio' && grupo.detalles && grupo.detalles.some(d => d.resultados_laboratorio) && (
                        <button
                          className="ml-2 text-purple-700 hover:text-purple-900"
                          title="Descargar resultados"
                          onClick={() => {
                            const link = grupo.detalles.find(d => d.resultados_laboratorio)?.resultados_laboratorio;
                            if (link) window.open(link, '_blank');
                          }}
                        >
                          <span role="img" aria-label="descargar">📥</span>
                        </button>
                      )}
                    </span>
                  </td>
                  <td className="border px-3 py-2">
                    <button
                      className="px-3 py-1 bg-blue-100 hover:bg-blue-200 rounded text-blue-900 font-semibold text-xs shadow"
                      onClick={() => {
                        const detallesFlatten = (grupo.detalles || []).flatMap(it => Array.isArray(it.detalles) ? it.detalles : []);
                        setModalDetalle({
                          ...grupo,
                          cobro_id: grupo.detalles?.[0]?.cobro_id,
                          tipo_pago: detallesFlatten?.[0]?.tipo_pago,
                          cobertura: detallesFlatten?.[0]?.cobertura,
                          detalles: detallesFlatten
                        });
                        setModalDetallesCobro(detallesFlatten);
                        setModalVisible(true);
                      }}
                    >Ver detalle</button>
                  </td>
                  <td className="border px-3 py-2 text-right font-semibold text-green-700">{Number(grupo.montoTotal).toFixed(2)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {/* Selector de filas por página y controles de paginación */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 mt-4">
        <div className="flex items-center gap-2">
          <label htmlFor="itemsPerPage" className="font-semibold text-gray-700">Filas por página:</label>
          <select
            id="itemsPerPage"
            value={itemsPerPage}
            onChange={e => setItemsPerPage(Number(e.target.value))}
            className="border rounded px-2 py-1 text-sm"
          >
            <option value={3}>3</option>
            <option value={5}>5</option>
            <option value={10}>10</option>
          </select>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center gap-4">
            <button
              className={`px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 text-sm font-semibold ${page === 1 ? 'opacity-50 cursor-not-allowed' : ''}`}
              onClick={() => setPage(page - 1)}
              disabled={page === 1}
            >Anterior</button>
            <span className="font-semibold text-blue-700">Página {page} de {totalPages}</span>
            <button
              className={`px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 text-sm font-semibold ${page === totalPages ? 'opacity-50 cursor-not-allowed' : ''}`}
              onClick={() => setPage(page + 1)}
              disabled={page === totalPages}
            >Siguiente</button>
          </div>
        )}
      </div>
    </div>
  );
}
