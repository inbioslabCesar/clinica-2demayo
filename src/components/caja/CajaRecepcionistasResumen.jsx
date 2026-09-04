import React from "react";

export default function CajaRecepcionistasResumen({ cajasRecep }) {
  const tipoIngresoLabel = (tipo) => String(tipo || "").replace(/_/g, " ").toUpperCase();
  if (!cajasRecep || cajasRecep.length === 0) {
    return <div className="text-gray-500">No hay cajas registradas hoy</div>;
  }
  return (
    <div>
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <h3 className="text-2xl font-black tracking-tight text-slate-900">Cajas del Día por Recepcionista</h3>
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Detalle operativo y control real</span>
      </div>
  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cajasRecep.map((caja, idx) => {
          const ingresosPorPago = Array.isArray(caja.por_pago) ? caja.por_pago : [];
          const ingresosPorServicio = Array.isArray(caja.por_servicio) ? caja.por_servicio : [];
          const cierrePendienteCuadre = Number(caja.cierre_pendiente_cuadre || 0) === 1;
          const cierreAutomatico = Number(caja.cierre_automatico || 0) === 1;
          const controlRealDisponible = Number(caja.control_real_disponible || 0) === 1 && !cierrePendienteCuadre;
          const diferenciaEfectivo = Number(caja.diferencia || 0);
          const efectivoEsperado = Number(caja.efectivo_esperado_cierre || 0);
          const efectivoContado = Number(caja.monto_contado || 0);
          const virtualCobrado = Number(caja.virtual_cobrado_cierre || 0);
          const virtualContado = caja.virtual_contado_cierre === null || caja.virtual_contado_cierre === undefined
            ? null
            : Number(caja.virtual_contado_cierre || 0);
          const diferenciaVirtual = caja.diferencia_virtual_cierre === null || caja.diferencia_virtual_cierre === undefined
            ? null
            : Number(caja.diferencia_virtual_cierre || 0);
          const badgeDiferenciaEfectivo = Math.abs(diferenciaEfectivo) < 0.01
            ? "bg-emerald-100 text-emerald-700 border-emerald-200"
            : diferenciaEfectivo > 0
              ? "bg-sky-100 text-sky-700 border-sky-200"
              : "bg-rose-100 text-rose-700 border-rose-200";
          return (
            <div key={idx} className="flex min-w-0 max-w-full flex-col gap-2 overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg">
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
              <div className="mb-2 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-amber-700">Control real de cierre</span>
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${controlRealDisponible ? badgeDiferenciaEfectivo : (cierrePendienteCuadre ? "bg-rose-100 text-rose-700 border-rose-200" : "bg-slate-100 text-slate-600 border-slate-200")}`}>
                    {controlRealDisponible ? `Dif. efectivo: S/ ${diferenciaEfectivo.toFixed(2)}` : (cierrePendienteCuadre ? "Autocierre pendiente" : "Sin cierre final")}
                  </span>
                </div>
                {controlRealDisponible ? (
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div className="rounded border border-amber-200 bg-white px-2 py-1.5">
                      <div className="text-slate-500">Efectivo esperado</div>
                      <div className="font-bold text-amber-800">S/ {efectivoEsperado.toFixed(2)}</div>
                    </div>
                    <div className="rounded border border-emerald-200 bg-white px-2 py-1.5">
                      <div className="text-slate-500">Efectivo contado</div>
                      <div className="font-bold text-emerald-700">S/ {efectivoContado.toFixed(2)}</div>
                    </div>
                    <div className="rounded border border-indigo-200 bg-white px-2 py-1.5">
                      <div className="text-slate-500">Virtual cobrado</div>
                      <div className="font-bold text-indigo-700">S/ {virtualCobrado.toFixed(2)}</div>
                    </div>
                    <div className="rounded border border-slate-200 bg-white px-2 py-1.5">
                      <div className="text-slate-500">Virtual contado</div>
                      <div className="font-bold text-slate-700">{virtualContado === null ? "No registrado" : `S/ ${virtualContado.toFixed(2)}`}</div>
                    </div>
                    <div className="rounded border border-slate-200 bg-white px-2 py-1.5 sm:col-span-2">
                      <div className="text-slate-500">Diferencia virtual</div>
                      <div className="font-bold text-slate-700">{diferenciaVirtual === null ? "No disponible" : `S/ ${diferenciaVirtual.toFixed(2)}`}</div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 text-xs text-amber-800">
                    {cierrePendienteCuadre
                      ? "Caja autocerrada por corte de 24h: falta registrar efectivo/virtual contado para completar cuadre real."
                      : (cierreAutomatico
                        ? "Caja cerrada automaticamente: pendiente de regularizacion de cuadre."
                        : "Caja abierta: se muestran datos operativos, el cuadre real aparece al cerrar caja.")}
                  </div>
                )}
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
                    } else if (serv.tipo_ingreso.toLowerCase().includes("contrato_abono")) {
                      color = "teal";
                      icon = (<svg width="18" height="18" fill="none" viewBox="0 0 24 24"><circle cx="9" cy="9" r="8" fill="#0d9488"/><text x="9" y="13" textAnchor="middle" fontSize="8" fill="#fff">A</text></svg>);
                    }
                    return (
                      <div key={j} className={`rounded-lg shadow bg-white border-t-4 border-${color}-400 px-2 py-1 flex items-center gap-1 w-full sm:w-[120px] snap-center`}>
                        {icon}
                        <div className="truncate">
                          <div className={`font-bold text-${color}-700 text-xs truncate`}>{tipoIngresoLabel(serv.tipo_ingreso)}</div>
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
