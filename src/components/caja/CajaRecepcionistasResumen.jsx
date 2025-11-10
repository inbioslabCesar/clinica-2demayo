import React from "react";

export default function CajaRecepcionistasResumen({ cajasRecep }) {
  if (!cajasRecep || cajasRecep.length === 0) {
    return <div className="text-gray-500">No hay cajas registradas hoy</div>;
  }
  return (
    <div className="mb-8">
      <h3 className="text-2xl font-bold text-orange-700 mb-6">Cajas del Día por Recepcionista</h3>
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {cajasRecep.map((caja, idx) => {
          const ingresosPorPago = Array.isArray(caja.por_pago) ? caja.por_pago : [];
          const ingresosPorServicio = Array.isArray(caja.por_servicio) ? caja.por_servicio : [];
          return (
            <div key={idx} className="bg-white border border-orange-200 rounded-2xl shadow-md ring-1 ring-orange-100 p-4 flex flex-col gap-2 min-w-0 max-w-full overflow-hidden">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="font-bold text-orange-800 text-base truncate max-w-[160px]">{caja.usuario_nombre || "Sin usuario"}</span>
                <span className="px-2 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold ring-2 ring-blue-200">Turno: {caja.turno}</span>
                <span className={`px-2 py-1 rounded-full text-xs font-semibold ring-2 ${caja.estado === "abierta" ? "bg-green-100 text-green-700 ring-green-200" : "bg-gray-100 text-gray-600 ring-gray-200"}`}>Estado: {caja.estado}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <div className="flex flex-col items-center gap-1">
                  <div className="flex gap-2">
                    <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-r from-orange-500 to-orange-400 text-white text-base font-bold shadow-md">{parseFloat(caja.monto_apertura || 0).toFixed(0)}</span>
                    <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-r from-green-500 to-green-400 text-white text-base font-bold shadow-md">{parseFloat(caja.total_caja || 0).toFixed(0)}</span>
                  </div>
                  <div className="flex gap-2 mt-1 flex-wrap justify-center">
                    <span className="flex items-center gap-1 text-xs text-orange-700"><span className="w-3 h-3 rounded-full bg-orange-500 inline-block"></span> Apertura</span>
                    <span className="flex items-center gap-1 text-xs text-green-700"><span className="w-3 h-3 rounded-full bg-green-500 inline-block"></span> Total Cobrado</span>
                  </div>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <div className="flex gap-2">
                    <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-r from-pink-500 to-pink-400 text-white text-base font-bold shadow-md">{parseFloat(caja.egreso_honorarios || 0).toFixed(0)}</span>
                    <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-r from-blue-500 to-blue-400 text-white text-base font-bold shadow-md">{parseFloat(caja.egreso_lab_ref || 0).toFixed(0)}</span>
                    <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-r from-gray-700 to-gray-500 text-white text-base font-bold shadow-md">{parseFloat(caja.egreso_operativo || 0).toFixed(0)}</span>
                    <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 text-white text-base font-bold shadow-md">{parseFloat(caja.ganancia_dia || 0).toFixed(0)}</span>
                  </div>
                  <div className="flex gap-2 mt-1 flex-wrap justify-center">
                    <span className="flex items-center gap-1 text-xs text-pink-700"><span className="w-3 h-3 rounded-full bg-pink-500 inline-block"></span> Honorarios</span>
                    <span className="flex items-center gap-1 text-xs text-blue-700"><span className="w-3 h-3 rounded-full bg-blue-500 inline-block"></span> Lab. ref</span>
                    <span className="flex items-center gap-1 text-xs text-gray-700"><span className="w-3 h-3 rounded-full bg-gray-700 inline-block"></span> Operativo</span>
                    <span className="flex items-center gap-1 text-xs text-emerald-700"><span className="w-3 h-3 rounded-full bg-emerald-500 inline-block"></span> Ganancia</span>
                  </div>
                </div>
              </div>
              <div className="mb-2">
                <span className="font-semibold text-blue-700 mb-1 block">Ingresos por Tipo de Pago:</span>
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-blue-200 scrollbar-track-blue-50 snap-x snap-mandatory">
                  {ingresosPorPago.length > 0 ? ingresosPorPago.map((pago, i) => {
                    let color = "green";
                    let icon = (<svg width="18" height="18" fill="none" viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="10" rx="2" fill="#22c55e"/><rect x="7" y="11" width="10" height="2" rx="1" fill="#fff"/></svg>);
                    if ((pago.metodo_pago || pago.tipo_pago).toLowerCase().includes("tarjeta")) {
                      color = "blue";
                      icon = (<svg width="18" height="18" fill="none" viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="10" rx="2" fill="#3b82f6"/><rect x="7" y="11" width="10" height="2" rx="1" fill="#fff"/></svg>);
                    } else if ((pago.metodo_pago || pago.tipo_pago).toLowerCase().includes("yape") || (pago.metodo_pago || pago.tipo_pago).toLowerCase().includes("plin") || (pago.metodo_pago || pago.tipo_pago).toLowerCase().includes("transfer")) {
                      color = "purple";
                      icon = (<svg width="18" height="18" fill="none" viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="18" rx="2" fill="#a855f7"/><rect x="9" y="7" width="6" height="2" rx="1" fill="#fff"/></svg>);
                    }
                    return (
                      <div key={i} className={`rounded-lg shadow bg-white border-t-4 border-${color}-400 px-2 py-1 flex items-center gap-1 w-full sm:w-[120px] snap-center`}>
                        {icon}
                        <div className="truncate">
                          <div className={`font-bold text-${color}-700 text-xs truncate`}>{(pago.metodo_pago || pago.tipo_pago).toUpperCase()}</div>
                          <div className={`text-xs text-${color}-600 font-mono`}>S/ {parseFloat(pago.total_pago).toFixed(2)}</div>
                        </div>
                      </div>
                    );
                  }) : null}
                </div>
              </div>
              <div>
                <span className="font-semibold text-purple-700 mb-1 block">Ingresos por Tipo de Servicio:</span>
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-purple-200 scrollbar-track-purple-50 snap-x snap-mandatory">
                  {ingresosPorServicio.length > 0 ? ingresosPorServicio.map((serv, j) => {
                    let color = "purple";
                    let icon = (<svg width="18" height="18" fill="none" viewBox="0 0 24 24"><circle cx="9" cy="9" r="8" fill="#a855f7"/><text x="9" y="13" textAnchor="middle" fontSize="8" fill="#fff">{serv.tipo_ingreso[0]}</text></svg>);
                    if (serv.tipo_ingreso.toLowerCase().includes("consulta")) {
                      color = "blue";
                      icon = (<svg width="18" height="18" fill="none" viewBox="0 0 24 24"><circle cx="9" cy="9" r="8" fill="#3b82f6"/><text x="9" y="13" textAnchor="middle" fontSize="8" fill="#fff">C</text></svg>);
                    } else if (serv.tipo_ingreso.toLowerCase().includes("laboratorio")) {
                      color = "green";
                      icon = (<svg width="18" height="18" fill="none" viewBox="0 0 24 24"><circle cx="9" cy="9" r="8" fill="#22c55e"/><text x="9" y="13" textAnchor="middle" fontSize="8" fill="#fff">L</text></svg>);
                    } else if (serv.tipo_ingreso.toLowerCase().includes("farmacia")) {
                      color = "yellow";
                      icon = (<svg width="18" height="18" fill="none" viewBox="0 0 24 24"><circle cx="9" cy="9" r="8" fill="#fbbf24"/><text x="9" y="13" textAnchor="middle" fontSize="8" fill="#fff">F</text></svg>);
                    } else if (serv.tipo_ingreso.toLowerCase().includes("procedimiento")) {
                      color = "pink";
                      icon = (<svg width="18" height="18" fill="none" viewBox="0 0 24 24"><circle cx="9" cy="9" r="8" fill="#ec4899"/><text x="9" y="13" textAnchor="middle" fontSize="8" fill="#fff">P</text></svg>);
                    }
                    return (
                      <div key={j} className={`rounded-lg shadow bg-white border-t-4 border-${color}-400 px-2 py-1 flex items-center gap-1 w-full sm:w-[120px] snap-center`}>
                        {icon}
                        <div className="truncate">
                          <div className={`font-bold text-${color}-700 text-xs truncate`}>{serv.tipo_ingreso.toUpperCase()}</div>
                          <div className={`text-xs text-${color}-600 font-mono`}>S/ {parseFloat(serv.total_servicio).toFixed(2)}</div>
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
