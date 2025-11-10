import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

// Modal simple para impresión tipo etiquetera
function EtiquetaModal({ open, onClose, datos }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl p-6 w-[350px] max-w-full text-xs font-mono">
        <h3 className="text-center font-bold text-lg mb-2">Cierre de Caja</h3>
        <div className="mb-2 border-b pb-2">
          <div><b>Usuario:</b> {datos.usuario_nombre}</div>
          <div><b>Rol:</b> {datos.usuario_rol}</div>
          <div><b>Fecha:</b> {datos.fecha}</div>
          <div><b>Apertura:</b> S/ {datos.monto_apertura?.toFixed(2)}</div>
          <div><b>Hora apertura:</b> {datos.hora_apertura}</div>
          <div><b>Hora cierre:</b> {datos.hora_cierre || '--:--'}</div>
        </div>
        <div className="mb-2">
          <b>Ingresos por tipo:</b>
          <ul className="ml-2">
            {datos.por_pago?.map((p, i) => (
              <li key={i}>{(p.metodo_pago || p.tipo_pago).toUpperCase()}: S/ {parseFloat(p.total_pago).toFixed(2)}</li>
            ))}
          </ul>
        </div>
        <div className="mb-2">
          <b>Egresos:</b>
          <ul className="ml-2">
            <li>Honorarios Médicos: S/ {datos.egreso_honorarios?.toFixed(2)}</li>
            <li>Lab. Referencia: S/ {datos.egreso_lab_ref?.toFixed(2)}</li>
            <li>Operativo: S/ {datos.egreso_operativo?.toFixed(2)}</li>
            <li><b>Total egresos:</b> S/ {((datos.egreso_honorarios||0)+(datos.egreso_lab_ref||0)+(datos.egreso_operativo||0)).toFixed(2)}</li>
          </ul>
        </div>
        <div className="mb-2">
          <b>Ocurrencias:</b>
          <div className="whitespace-pre-line">{datos.observaciones}</div>
        </div>
        <div className="mt-4 flex gap-2">
          <button className="bg-blue-600 text-white px-4 py-1 rounded font-bold w-full" onClick={()=>window.print()}>Imprimir</button>
          <button className="bg-gray-300 px-4 py-1 rounded w-full" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}

export default function CerrarCajaView() {
  const [observaciones, setObservaciones] = useState("");
  const [resumen, setResumen] = useState(null);
  const [montoContado, setMontoContado] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showEtiqueta, setShowEtiqueta] = useState(false);
  const [datosEtiqueta, setDatosEtiqueta] = useState(null);
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
    try {
      const resp = await fetch("/api_cerrar_caja.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ monto_contado: montoContado, observaciones })
      });
      const data = await resp.json();
      if (data.success) {
        // Mostrar modal de impresión tipo etiquetera
        setDatosEtiqueta({
          ...resumen,
          observaciones,
          hora_cierre: data.hora_cierre || new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true }),
          usuario_nombre: data.usuario_nombre || (window.sessionStorage.getItem('usuario') ? JSON.parse(window.sessionStorage.getItem('usuario')).nombre : ''),
          usuario_rol: data.usuario_rol || (window.sessionStorage.getItem('usuario') ? JSON.parse(window.sessionStorage.getItem('usuario')).rol : ''),
        });
        setShowEtiqueta(true);
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
      <EtiquetaModal open={showEtiqueta} onClose={()=>{setShowEtiqueta(false);navigate('/contabilidad')}} datos={datosEtiqueta || {}} />
    </>
  );
}
