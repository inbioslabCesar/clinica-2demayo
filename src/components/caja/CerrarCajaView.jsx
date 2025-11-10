import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Swal from "sweetalert2";

// Modal SweetAlert2 para impresión tipo etiquetera
function mostrarEtiquetaImpresion(datos, totalesBackend = null) {
  // Usar los totales de métodos de pago del backend si están disponibles
  const total_efectivo = totalesBackend?.total_efectivo ?? datos.total_efectivo ?? 0;
  const total_yape = totalesBackend?.total_yape ?? datos.total_yape ?? 0;
  const total_plin = totalesBackend?.total_plin ?? datos.total_plin ?? 0;
  const total_tarjetas = totalesBackend?.total_tarjetas ?? datos.total_tarjetas ?? 0;
  const total_transferencias = totalesBackend?.total_transferencias ?? datos.total_transferencias ?? 0;
  // Egresos
  const egreso_honorarios = totalesBackend?.egreso_honorarios ?? datos.egreso_honorarios ?? 0;
  const egreso_lab_ref = totalesBackend?.egreso_lab_ref ?? datos.egreso_lab_ref ?? 0;
  const egreso_operativo = totalesBackend?.egreso_operativo ?? datos.egreso_operativo ?? 0;
  const total_egresos = totalesBackend?.total_egresos ?? (egreso_honorarios + egreso_lab_ref + egreso_operativo);
  // Lógica para explicación automática de diferencia negativa
  let explicacionDiferencia = "";
  const diferencia = (datos.monto_contado !== undefined ? parseFloat(datos.monto_contado) : 0) - total_egresos;
  if (diferencia < 0) {
    explicacionDiferencia = "<div style='color:red;font-weight:bold;margin-top:8px;'>No hay efectivo suficiente, egreso cubierto por Yape, Plin, transferencia, o se quedó debiendo tal egreso.</div>";
  }
  // Recibo compacto tipo etiquetera
  const recibo = `
    <div style="font-family: monospace; font-size: 13px; width: 320px;">
      <h3 style="text-align:center;margin-bottom:8px;">🧾 Cierre de Caja</h3>
      <hr>
      <div><b>Usuario:</b> ${datos.usuario_nombre || "-"}</div>
      <div><b>Rol:</b> ${datos.usuario_rol || "-"}</div>
      <div><b>Fecha:</b> ${datos.fecha || "-"}</div>
      <div><b>Apertura:</b> S/ ${(datos.monto_apertura||0).toFixed(2)}</div>
      <div><b>Hora apertura:</b> ${datos.hora_apertura || "-"}</div>
      <div><b>Hora cierre:</b> ${datos.hora_cierre || "-"}</div>
      <hr>
      <div><b>Ingresos por tipo:</b></div>
      <ul style="margin-left:10px;">
        <li>Efectivo: S/ ${total_efectivo.toFixed(2)}</li>
        <li>Yape: S/ ${total_yape.toFixed(2)}</li>
        <li>Plin: S/ ${total_plin.toFixed(2)}</li>
        <li>Tarjeta: S/ ${total_tarjetas.toFixed(2)}</li>
        <li>Transferencia: S/ ${total_transferencias.toFixed(2)}</li>
      </ul>
      <div><b>Egresos:</b></div>
      <ul style="margin-left:10px;">
        <li>Honorarios Médicos: S/ ${egreso_honorarios.toFixed(2)}</li>
        <li>Lab. Referencia: S/ ${egreso_lab_ref.toFixed(2)}</li>
        <li>Operativo: S/ ${egreso_operativo.toFixed(2)}</li>
        <li><b>Total egresos:</b> S/ ${total_egresos.toFixed(2)}</li>
      </ul>
      <div><b>Ocurrencias:</b></div>
      <div style="white-space:pre-line;">${datos.observaciones || ""}</div>
      ${explicacionDiferencia}
      <hr>
      <div style="text-align:center;font-size:12px;margin-top:8px;">Conserve este recibo para archivo</div>
    </div>
  `;
  Swal.fire({
    title: 'Cierre de Caja Procesado ✅',
    html: recibo,
    icon: 'success',
    confirmButtonText: 'Imprimir Recibo',
    showCancelButton: true,
    cancelButtonText: 'Solo Continuar'
  }).then((result) => {
    if (result.isConfirmed) {
      const ventanaImpresion = window.open('', '_blank');
      ventanaImpresion.document.write(recibo);
      ventanaImpresion.document.close();
      ventanaImpresion.print();
    }
  });
}

export default function CerrarCajaView() {
  const [observaciones, setObservaciones] = useState("");
  const [resumen, setResumen] = useState(null);
  const [montoContado, setMontoContado] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    // Obtener resumen de caja actual
    async function fetchResumen() {
      setLoading(true);
      try {
        const resp = await fetch("/api_resumen_diario.php", { credentials: "include" });
        const data = await resp.json();
        if (data.success) {
          setResumen(data);
          setError("");
        } else {
          setError(data.error || "Error al cargar resumen");
        }
      } catch (e) {
        setError("Error de conexión");
      } finally {
        setLoading(false);
      }
    }
    fetchResumen();
  }, []);

  const handleCerrarCaja = async () => {
    // Calcular totales por método de pago
    let total_yape = 0;
    let total_plin = 0;
    let total_tarjetas = 0;
    let total_transferencias = 0;
    if (resumen?.por_pago?.length) {
      resumen.por_pago.forEach(p => {
        const metodo = (p.metodo_pago || p.tipo_pago || '').toLowerCase();
        if (metodo === 'yape') total_yape = parseFloat(p.total_pago);
        if (metodo === 'plin') total_plin = parseFloat(p.total_pago);
        if (metodo === 'tarjeta') total_tarjetas = parseFloat(p.total_pago);
        if (metodo === 'transferencia') total_transferencias = parseFloat(p.total_pago);
      });
    }
    try {
      const resp = await fetch("/api_cerrar_caja.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          monto_contado: montoContado,
          observaciones,
          total_yape,
          total_plin,
          total_tarjetas,
          total_transferencias
        })
      });
      const data = await resp.json();
      if (data.success) {
        // Mostrar recibo tipo etiquetera con los totales de egresos del backend
        mostrarEtiquetaImpresion({
          ...resumen,
          observaciones,
          monto_contado: montoContado,
          hora_cierre: data.hora_cierre || new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true }),
          usuario_nombre: data.usuario_nombre || (window.sessionStorage.getItem('usuario') ? JSON.parse(window.sessionStorage.getItem('usuario')).nombre : ''),
          usuario_rol: data.usuario_rol || (window.sessionStorage.getItem('usuario') ? JSON.parse(window.sessionStorage.getItem('usuario')).rol : ''),
        }, data.totales);
        // Redirigir después de cerrar el modal
        setTimeout(() => navigate('/contabilidad'), 500);
      } else {
        alert("Error: " + (data.error || "No se pudo cerrar la caja"));
      }
    } catch (e) {
      alert("Error de conexión al cerrar caja");
    }
  };

  if (loading) return <div className="p-8 text-center">Cargando resumen...</div>;
  if (error) return <div className="p-8 text-center text-red-600">{error}</div>;
  if (!resumen) return null;

  // Definir variables seguras para evitar ReferenceError
  const efectivoCobrado = (() => {
    const efectivo = resumen?.por_pago?.find(p => (p.metodo_pago || p.tipo_pago)?.toLowerCase() === "efectivo");
    return efectivo ? parseFloat(efectivo.total_pago) : 0;
  })();

  // Calcular total egresos
  const totalEgresos = (resumen.egreso_honorarios ? resumen.egreso_honorarios : 0)
    + (resumen.egreso_lab_ref ? resumen.egreso_lab_ref : 0)
    + (resumen.egreso_operativo ? resumen.egreso_operativo : 0);

  // Efectivo esperado final: efectivo cobrado - total egresos
  const efectivoEsperado = efectivoCobrado - totalEgresos;

  // Diferencia: efectivo contado - efectivo esperado
  const diferencia = parseFloat(montoContado || 0) - efectivoEsperado;

  return (
    <>
      <div className="max-w-2xl mx-auto p-4 sm:p-8 bg-gradient-to-br from-red-50 via-white to-red-100 rounded-2xl shadow-2xl">
        <h2 className="text-3xl font-extrabold mb-6 text-red-700 flex items-center gap-3 drop-shadow">
          <span className="inline-block bg-red-100 text-red-700 rounded-full p-2 text-3xl">🧾</span>
          Cierre de Caja
        </h2>
        <div className="flex flex-wrap gap-4 mb-6 justify-center">
          <div className="bg-orange-100 rounded-xl px-6 py-3 flex flex-col items-center shadow-lg w-full sm:w-auto">
            <span className="text-xs text-orange-700 font-semibold">Fecha</span>
            <span className="font-bold text-orange-800 text-lg tracking-wide">{resumen.fecha}</span>
          </div>
          <div className="bg-blue-100 rounded-xl px-6 py-3 flex flex-col items-center shadow-lg w-full sm:w-auto">
            <span className="text-xs text-blue-700 font-semibold">Apertura</span>
            <span className="font-bold text-blue-800 text-lg tracking-wide">S/ {resumen.monto_apertura?.toFixed(2)}</span>
          </div>
        </div>
        <div className="mb-6">
          <span className="font-semibold text-gray-700 mb-2 block text-lg">Cobros por tipo de pago:</span>
          <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-blue-200 scrollbar-track-blue-50 snap-x snap-mandatory">
            {resumen.por_pago?.map((pago, i) => {
              let color = "green";
              if ((pago.metodo_pago || pago.tipo_pago).toLowerCase().includes("tarjeta")) color = "blue";
              else if ((pago.metodo_pago || pago.tipo_pago).toLowerCase().includes("yape") || (pago.metodo_pago || pago.tipo_pago).toLowerCase().includes("plin") || (pago.metodo_pago || pago.tipo_pago).toLowerCase().includes("transfer")) color = "purple";
              else if ((pago.metodo_pago || pago.tipo_pago).toLowerCase().includes("efectivo")) color = "yellow";
              return (
                <div key={i} className={`rounded-xl shadow-lg bg-white border-t-4 border-${color}-400 px-4 py-3 flex flex-col items-center gap-1 w-full sm:w-[140px] snap-center transition-all hover:scale-105`}>
                  <span className={`font-bold text-${color}-700 text-sm truncate`}>{(pago.metodo_pago || pago.tipo_pago).toUpperCase()}</span>
                  <span className={`text-base text-${color}-600 font-mono`}>S/ {parseFloat(pago.total_pago).toFixed(2)}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="flex flex-col gap-4 mb-6">
          <div className="bg-yellow-100 rounded-xl px-6 py-5 flex flex-col items-center shadow-lg">
            <span className="text-xs text-yellow-700 font-semibold">Efectivo cobrado</span>
            <span className="font-bold text-yellow-800 text-2xl">S/ {efectivoCobrado.toFixed(2)}</span>
          </div>
          {/* Comparativo de egresos */}
          <div className="flex gap-4 flex-wrap justify-center my-2">
            <div className="bg-orange-100 rounded-xl px-6 py-4 flex flex-col items-center shadow-lg min-w-[160px]">
              <span className="text-xs text-orange-700 font-semibold flex items-center gap-1">🩺 Honorarios Médicos</span>
              <span className="font-bold text-orange-800 text-lg">- S/ {(resumen.egreso_honorarios ? resumen.egreso_honorarios.toFixed(2) : "0.00")}</span>
            </div>
            <div className="bg-pink-100 rounded-xl px-6 py-4 flex flex-col items-center shadow-lg min-w-[160px]">
              <span className="text-xs text-pink-700 font-semibold flex items-center gap-1">🧑‍🔬 Honorarios Lab. Ref.</span>
              <span className="font-bold text-pink-800 text-lg">- S/ {(resumen.egreso_lab_ref ? resumen.egreso_lab_ref.toFixed(2) : "0.00")}</span>
            </div>
            <div className="bg-indigo-100 rounded-xl px-6 py-4 flex flex-col items-center shadow-lg min-w-[160px]">
              <span className="text-xs text-indigo-700 font-semibold flex items-center gap-1">🛠️ Egreso Operativo</span>
              <span className="font-bold text-indigo-800 text-lg">- S/ {(resumen.egreso_operativo ? resumen.egreso_operativo.toFixed(2) : "0.00")}</span>
            </div>
          </div>
          {/* Total egresos */}
          <div className="flex gap-2 flex-wrap justify-center my-2">
            <div className="bg-gray-100 rounded-xl px-6 py-3 flex flex-col items-center shadow-lg min-w-[160px]">
              <span className="text-xs text-gray-700 font-semibold">Total egresos</span>
              <span className="font-bold text-gray-800 text-lg">- S/ {((resumen.egreso_honorarios ? resumen.egreso_honorarios : 0) + (resumen.egreso_lab_ref ? resumen.egreso_lab_ref : 0) + (resumen.egreso_operativo ? resumen.egreso_operativo : 0)).toFixed(2)}</span>
            </div>
          </div>
          {/* Resumen comparativo */}
          <div className="flex flex-col sm:flex-row gap-4 mt-2">
            <div className="flex-1 bg-yellow-200 rounded-xl px-6 py-5 flex flex-col items-center shadow-lg">
              <span className="text-xs text-yellow-700 font-semibold">Efectivo esperado</span>
              <span className="font-bold text-yellow-800 text-3xl">S/ {efectivoEsperado.toFixed(2)}</span>
              <span className="text-xs text-gray-700 mt-1">(Efectivo cobrado - total egresos)</span>
            </div>
            <div className="flex-1 bg-green-100 rounded-xl px-6 py-5 flex flex-col items-center shadow-lg">
              <span className="text-xs text-green-700 font-semibold">Efectivo contado</span>
              <input
                type="number"
                value={montoContado}
                onChange={e => setMontoContado(e.target.value)}
                className="border-2 border-green-300 rounded-xl px-4 py-2 mt-2 text-xl text-center font-bold w-full max-w-[160px] focus:ring-2 focus:ring-green-400 bg-white"
                placeholder="S/ 0.00"
              />
            </div>
            <div className={`flex-1 rounded-xl px-6 py-5 flex flex-col items-center shadow-lg ${diferencia === 0 ? "bg-green-200" : diferencia > 0 ? "bg-blue-100" : "bg-red-100"}`}>
              <span className="text-xs font-semibold mb-1">Diferencia</span>
              <span className={`font-bold text-3xl ${diferencia === 0 ? "text-green-700" : diferencia > 0 ? "text-blue-700" : "text-red-700"}`}>S/ {diferencia.toFixed(2)}</span>
              {diferencia === 0 ? (
                <span className="text-green-700 text-xs font-semibold mt-1">¡Cuadre perfecto!</span>
              ) : diferencia > 0 ? (
                <span className="text-blue-700 text-xs font-semibold mt-1">Sobra efectivo</span>
              ) : (
                <span className="text-red-700 text-xs font-semibold mt-1">Falta efectivo</span>
              )}
            </div>
          </div>
        </div>
        <div className="mb-4">
          <label className="block text-base font-semibold text-gray-700 mb-2" htmlFor="observaciones">Ocurrencias / Observaciones</label>
          <textarea
            id="observaciones"
            value={observaciones}
            onChange={e => setObservaciones(e.target.value)}
            className="w-full border-2 border-red-300 rounded-xl px-4 py-3 min-h-[70px] resize-y focus:ring-2 focus:ring-red-400 bg-white text-base"
            placeholder="Escribe aquí cualquier ocurrencia, incidente o comentario relevante antes del cierre..."
          />
        </div>
        <button
          className="bg-gradient-to-r from-red-500 to-red-700 text-white px-10 py-4 rounded-2xl shadow-xl font-extrabold text-xl w-full mt-2 transition-all hover:scale-105 hover:from-red-600 hover:to-red-800"
          onClick={handleCerrarCaja}
        >
          Confirmar cierre de caja
        </button>
      </div>
    </>
  );
}
