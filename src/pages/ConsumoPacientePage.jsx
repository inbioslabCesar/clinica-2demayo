import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { BASE_URL } from "../config/config";
import Spinner from "../components/Spinner";
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

  if (loading) return <Spinner />;
  if (error) return <div className="text-red-600 font-bold p-6">{error}</div>;

  // Filtrar por fecha (solo parte de la fecha, ignorando hora)
  let historialFiltrado = consumo.historial;
  function soloFecha(fechaStr) {
    // Si la fecha viene como 'YYYY-MM-DD' o 'YYYY-MM-DD HH:mm:ss', toma solo la parte de la fecha
    return fechaStr.split(' ')[0];
  }
  if (fechaInicio) {
    historialFiltrado = historialFiltrado.filter(item => soloFecha(item.fecha) >= fechaInicio);
  }
  if (fechaFin) {
    historialFiltrado = historialFiltrado.filter(item => soloFecha(item.fecha) <= fechaFin);
  }
  // Agrupar por cobro (por fecha y monto total)
  function agruparCobros(historial) {
    const grupos = {};
    historial.forEach(item => {
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
  }
  const cobrosAgrupados = agruparCobros(historialFiltrado);
  // Calcular paginación
  const totalItems = cobrosAgrupados.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  const startIdx = (page - 1) * itemsPerPage;
  const endIdx = startIdx + itemsPerPage;

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
            <table className="min-w-full border rounded mb-4">
              <thead>
                <tr className="bg-blue-100">
                  <th className="px-2 py-1 border text-left">Servicio</th>
                  <th className="px-2 py-1 border text-left">Descripción</th>
                  <th className="px-2 py-1 border text-right">Monto (S/)</th>
                </tr>
              </thead>
              <tbody>
                {modalDetallesCobro.map((d, i) => (
                  <tr key={i}>
                    <td className="border px-2 py-1">{d.servicio_tipo || modalDetalle.servicio}</td>
                    <td className="border px-2 py-1">{d.descripcion && d.descripcion !== "0" ? d.descripcion : <span className="italic text-gray-500">Sin detalle</span>}</td>
                    <td className="border px-2 py-1 text-right">{Number(d.subtotal || d.monto).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="font-bold text-right text-green-700 text-lg mb-4">
              Total: S/ {modalDetallesCobro.reduce((sum, d) => sum + Number(d.subtotal || d.monto), 0).toFixed(2)}
            </div>
            <button
              className="w-full py-2 bg-green-600 hover:bg-green-700 text-white font-bold rounded shadow"
              onClick={imprimirTicketCobro}
            >Imprimir ticket</button>
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
            {consumo.historial.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-center py-6 text-gray-500">No hay servicios registrados.</td>
              </tr>
            ) : (
              consumo.historial.slice(startIdx, endIdx).map((item, idx) => (
                <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-blue-50"}>
                  <td className="border px-3 py-2">{item.fecha}</td>
                  <td className="border px-3 py-2">
                    <span className={`inline-block px-2 py-1 rounded text-xs font-semibold ${
                      item.servicio === 'consulta' ? 'bg-green-100 text-green-700' :
                      item.servicio === 'laboratorio' ? 'bg-yellow-100 text-yellow-700' :
                      item.servicio === 'farmacia' ? 'bg-purple-100 text-purple-700' :
                      item.servicio === 'procedimiento' ? 'bg-blue-100 text-blue-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {item.servicio}
                      {/* Ícono de descarga si hay resultados de laboratorio */}
                      {item.servicio === 'laboratorio' && item.resultados_laboratorio && (
                        <button
                          className="ml-2 text-purple-700 hover:text-purple-900"
                          title="Descargar resultados"
                          onClick={() => window.open(item.resultados_laboratorio, '_blank')}
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
                        setModalDetalle(item);
                        setModalDetallesCobro(item.detalles);
                        setModalVisible(true);
                      }}
                    >Ver detalle</button>
                  </td>
                  <td className="border px-3 py-2 text-right font-semibold text-green-700">{Number(item.monto).toFixed(2)}</td>
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
