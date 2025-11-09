import React from "react";

export default function CajaRecepcionistasResumen({ cajasRecep }) {
  if (!cajasRecep || cajasRecep.length === 0) {
    return <div className="text-gray-500">No hay cajas registradas hoy</div>;
  }
  return (
    <div className="mb-8">
      <h3 className="text-2xl font-bold text-orange-700 mb-6">Cajas del Día por Recepcionista en los cards de la vista Admin</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {cajasRecep.map((caja, idx) => {
          const ingresosPorPago = Array.isArray(caja.por_pago) ? caja.por_pago : [];
          const ingresosPorServicio = Array.isArray(caja.por_servicio) ? caja.por_servicio : [];
          return (
            <div key={idx} className="bg-orange-50 border-2 border-orange-200 rounded-xl p-6 shadow flex flex-col gap-2">
              <div className="flex items-center gap-3 mb-2">
                <span className="font-bold text-orange-800 text-lg">{caja.usuario_nombre || "Sin usuario"}</span>
                <span className="px-2 py-1 rounded bg-blue-100 text-blue-700 text-xs font-semibold">Turno: {caja.turno}</span>
                <span className={`px-2 py-1 rounded text-xs font-semibold ${caja.estado === "abierta" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>Estado: {caja.estado}</span>
              </div>
              <div className="flex gap-6 mb-2">
                <span className="text-yellow-700 font-semibold">Apertura: S/ {parseFloat(caja.monto_apertura || 0).toFixed(2)}</span>
                <span className="text-purple-700 font-semibold">Total cobrado: S/ {parseFloat(caja.total_caja || 0).toFixed(2)}</span>
                <span className="text-red-700 font-semibold">Egreso honorarios médicos: S/ {parseFloat(caja.egreso_honorarios || 0).toFixed(2)}</span>
                <span className="text-blue-700 font-semibold">Egreso lab. referencia: S/ {parseFloat(caja.egreso_lab_ref || 0).toFixed(2)}</span>
                <span className="text-gray-700 font-semibold">Egreso operativo: S/ {parseFloat(caja.egreso_operativo || 0).toFixed(2)}</span>
                <span className="text-green-700 font-semibold">Ganancia: S/ {parseFloat(caja.ganancia_dia || 0).toFixed(2)}</span>
              </div>
              <div>
                <span className="font-semibold text-blue-700 mb-2 block">Ingresos por Tipo de Pago recep:</span>
                <div className="flex flex-wrap gap-2">
                  {ingresosPorPago.length > 0 ? ingresosPorPago.map((pago, i) => {
                    let color = "green";
                    let icon = (<svg width="20" height="20" fill="none" viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="10" rx="2" fill="#22c55e"/><rect x="7" y="11" width="10" height="2" rx="1" fill="#fff"/></svg>);
                    if ((pago.metodo_pago || pago.tipo_pago).toLowerCase().includes("tarjeta")) {
                      color = "blue";
                      icon = (<svg width="20" height="20" fill="none" viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="10" rx="2" fill="#3b82f6"/><rect x="7" y="11" width="10" height="2" rx="1" fill="#fff"/></svg>);
                    } else if ((pago.metodo_pago || pago.tipo_pago).toLowerCase().includes("yape") || (pago.metodo_pago || pago.tipo_pago).toLowerCase().includes("plin") || (pago.metodo_pago || pago.tipo_pago).toLowerCase().includes("transfer")) {
                      color = "purple";
                      icon = (<svg width="20" height="20" fill="none" viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="18" rx="2" fill="#a855f7"/><rect x="9" y="7" width="6" height="2" rx="1" fill="#fff"/></svg>);
                    }
                    return (
                      <div key={i} className={`rounded-lg shadow bg-white border-t-4 border-${color}-400 px-3 py-2 flex items-center gap-2 min-w-[120px]`}>
                        {icon}
                        <div>
                          <div className={`font-bold text-${color}-700 text-sm`}>{(pago.metodo_pago || pago.tipo_pago).toUpperCase()}</div>
                          <div className={`text-xs text-${color}-600`}>S/ {parseFloat(pago.total_pago).toFixed(2)}</div>
                        </div>
                      </div>
                    );
                  }) : null}
                </div>
              </div>
              <div>
                <span className="font-semibold text-purple-700 mb-2 block">Ingresos por Tipo de Servicio recep:</span>
                <div className="flex flex-wrap gap-2">
                  {ingresosPorServicio.length > 0 ? ingresosPorServicio.map((serv, j) => {
                    let color = "purple";
                    let icon = (<svg width="20" height="20" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#a855f7"/><text x="12" y="16" textAnchor="middle" fontSize="10" fill="#fff">{serv.tipo_ingreso[0]}</text></svg>);
                    if (serv.tipo_ingreso.toLowerCase().includes("consulta")) {
                      color = "blue";
                      icon = (<svg width="20" height="20" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#3b82f6"/><text x="12" y="16" textAnchor="middle" fontSize="10" fill="#fff">C</text></svg>);
                    } else if (serv.tipo_ingreso.toLowerCase().includes("laboratorio")) {
                      color = "green";
                      icon = (<svg width="20" height="20" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#22c55e"/><text x="12" y="16" textAnchor="middle" fontSize="10" fill="#fff">L</text></svg>);
                    } else if (serv.tipo_ingreso.toLowerCase().includes("farmacia")) {
                      color = "yellow";
                      icon = (<svg width="20" height="20" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#fbbf24"/><text x="12" y="16" textAnchor="middle" fontSize="10" fill="#fff">F</text></svg>);
                    }
                    return (
                      <div key={j} className={`rounded-lg shadow bg-white border-t-4 border-${color}-400 px-3 py-2 flex items-center gap-2 min-w-[120px]`}>
                        {icon}
                        <div>
                          <div className={`font-bold text-${color}-700 text-sm`}>{serv.tipo_ingreso.toUpperCase()}</div>
                          <div className={`text-xs text-${color}-600`}>S/ {parseFloat(serv.total_servicio).toFixed(2)}</div>
                        </div>
                      </div>
                    );
                  }) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
