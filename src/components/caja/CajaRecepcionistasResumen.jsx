import React, { useState } from "react";

export default function CajaRecepcionistasResumen({ cajasRecep }) {
  const tipoIngresoLabel = (tipo) => String(tipo || "").replace(/_/g, " ").toUpperCase();
  const [mostrarAuditoriaAtenciones, setMostrarAuditoriaAtenciones] = useState(false);
  if (!cajasRecep || cajasRecep.length === 0) {
    return <div className="text-gray-500">No hay cajas registradas hoy</div>;
  }
  return (
    <div>
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <h3 className="text-2xl font-black tracking-tight text-slate-900">Cajas del Día por Recepcionista</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Detalle operativo y control real</span>
          <button
            type="button"
            onClick={() => setMostrarAuditoriaAtenciones((v) => !v)}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${mostrarAuditoriaAtenciones ? "border-amber-300 bg-amber-50 text-amber-800" : "border-slate-300 bg-white text-slate-600"}`}
          >
            {mostrarAuditoriaAtenciones ? "Ocultar auditoría" : "Mostrar auditoría"}
          </button>
        </div>
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
          const honorariosCaja = Number((caja.egreso_honorarios_caja ?? caja.egreso_honorarios) || 0);
          const honorariosDiaOperativo = Number(caja.egreso_honorarios_dia_operativo || 0);
          const honorariosArrastre = Number(caja.egreso_honorarios_arrastre ?? Math.max(0, honorariosCaja - honorariosDiaOperativo));
          const totalAtencionesDia = Number(caja.total_atenciones_dia || 0);
          const cobradoTurno = Number(caja.cobrado_turno ?? caja.total_caja ?? 0);
          const diferenciaConciliacion = Number(caja.diferencia_conciliacion ?? (totalAtencionesDia - cobradoTurno));
          const montoSinAsientoCaja = Number(caja.monto_sin_asiento_caja || 0);
          const montoCobrosInexistentes = Number(caja.monto_cobros_inexistentes || 0);
          const totalCobradoOperativo = controlRealDisponible
            ? (
              Number(caja.total_efectivo || 0)
              + Number(caja.total_yape || 0)
              + Number(caja.total_plin || 0)
              + Number(caja.total_tarjetas || 0)
              + Number(caja.total_transferencias || 0)
            )
            : Number(caja.total_caja || 0);
          const ingresosPorPagoOperativo = controlRealDisponible
            ? [
                { metodo_pago: "efectivo", total_pago: Number(caja.total_efectivo || 0) },
                { metodo_pago: "yape", total_pago: Number(caja.total_yape || 0) },
                { metodo_pago: "plin", total_pago: Number(caja.total_plin || 0) },
                { metodo_pago: "tarjeta", total_pago: Number(caja.total_tarjetas || 0) },
                { metodo_pago: "transferencia", total_pago: Number(caja.total_transferencias || 0) },
              ].filter((pago) => Number(pago.total_pago || 0) > 0)
            : ingresosPorPago;
          const sumaServiciosOperativo = ingresosPorServicio.reduce((acc, serv) => acc + Number(serv?.total_servicio || 0), 0);
          const ajusteServiciosOperativo = Number((totalCobradoOperativo - sumaServiciosOperativo).toFixed(2));
          const ingresosPorServicioOperativo = (() => {
            if (!controlRealDisponible || Math.abs(ajusteServiciosOperativo) < 0.01) {
              return ingresosPorServicio;
            }
            return [
              ...ingresosPorServicio,
              {
                tipo_ingreso: "ajuste_regularizacion",
                total_servicio: ajusteServiciosOperativo,
              },
            ];
          })();
          const badgeConciliacion = Math.abs(diferenciaConciliacion) < 0.01
            ? "bg-emerald-100 text-emerald-700 border-emerald-200"
            : diferenciaConciliacion > 0
              ? "bg-amber-100 text-amber-700 border-amber-200"
              : "bg-sky-100 text-sky-700 border-sky-200";
          const badgeDiferenciaEfectivo = Math.abs(diferenciaEfectivo) < 0.01
            ? "bg-emerald-100 text-emerald-700 border-emerald-200"
            : diferenciaEfectivo > 0
              ? "bg-sky-100 text-sky-700 border-sky-200"
              : "bg-rose-100 text-rose-700 border-rose-200";
          return (
            <div key={idx} className="flex min-w-0 max-w-full flex-col gap-2 overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg">
              <div className="mb-2 space-y-2">
                <span className="block font-bold text-orange-800 text-base truncate">{caja.usuario_nombre || "Sin usuario"}</span>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-blue-200 bg-blue-50 px-2 py-1.5 text-center">
                    <div className="text-[11px] font-semibold text-blue-700">Turno</div>
                    <div className="text-xs font-bold text-blue-800">{caja.turno}</div>
                  </div>
                  <div className={`rounded-xl border px-2 py-1.5 text-center ${caja.estado === "abierta" ? "border-green-200 bg-green-50" : "border-slate-200 bg-slate-50"}`}>
                    <div className={`text-[11px] font-semibold ${caja.estado === "abierta" ? "text-green-700" : "text-slate-700"}`}>Estado</div>
                    <div className={`text-xs font-bold ${caja.estado === "abierta" ? "text-green-800" : "text-slate-800"}`}>{caja.estado}</div>
                  </div>
                </div>
              </div>
              <div className="mb-2 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-orange-200 bg-orange-50 px-2 py-2 text-center">
                    <div className="text-[11px] font-semibold text-orange-700">Apertura</div>
                    <div className="text-base font-extrabold text-orange-800">S/ {parseFloat(caja.monto_apertura || 0).toFixed(0)}</div>
                  </div>
                  <div className="rounded-xl border border-green-200 bg-green-50 px-2 py-2 text-center">
                    <div className="text-[11px] font-semibold text-green-700">Total cobrado</div>
                    <div className="text-base font-extrabold text-green-800">S/ {totalCobradoOperativo.toFixed(0)}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="rounded-xl border border-pink-200 bg-pink-50 px-2 py-2 text-center">
                    <div className="text-[11px] font-semibold text-pink-700">Honor. caja</div>
                    <div className="text-base font-extrabold text-pink-800">S/ {honorariosCaja.toFixed(0)}</div>
                  </div>
                  <div className="rounded-xl border border-blue-200 bg-blue-50 px-2 py-2 text-center">
                    <div className="text-[11px] font-semibold text-blue-700">Lab. ref</div>
                    <div className="text-base font-extrabold text-blue-800">S/ {parseFloat(caja.egreso_lab_ref || 0).toFixed(0)}</div>
                  </div>
                  <div className="rounded-xl border border-slate-300 bg-slate-50 px-2 py-2 text-center">
                    <div className="text-[11px] font-semibold text-slate-700">Operativo</div>
                    <div className="text-base font-extrabold text-slate-800">S/ {parseFloat(caja.egreso_operativo || 0).toFixed(0)}</div>
                  </div>
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-2 py-2 text-center">
                    <div className="text-[11px] font-semibold text-emerald-700">Ganancia</div>
                    <div className="text-base font-extrabold text-emerald-800">S/ {parseFloat(caja.ganancia_dia || 0).toFixed(0)}</div>
                  </div>
                </div>
              </div>
              <div className="mb-2 rounded-xl border border-rose-200 bg-rose-50/70 p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-rose-700">Conciliación honorarios</div>
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                  <div className="rounded border border-rose-200 bg-white px-2 py-1.5">
                    <div className="text-slate-500">Pagado en caja</div>
                    <div className="font-bold text-rose-700">S/ {honorariosCaja.toFixed(2)}</div>
                  </div>
                  <div className="rounded border border-emerald-200 bg-white px-2 py-1.5">
                    <div className="text-slate-500">Atenciones del día</div>
                    <div className="font-bold text-emerald-700">S/ {honorariosDiaOperativo.toFixed(2)}</div>
                  </div>
                  <div className="rounded border border-amber-200 bg-white px-2 py-1.5">
                    <div className="text-slate-500">Arrastre liquidado</div>
                    <div className="font-bold text-amber-700">S/ {honorariosArrastre.toFixed(2)}</div>
                  </div>
                </div>
              </div>
              {mostrarAuditoriaAtenciones && (
                <div className="mb-2 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Conciliación de atenciones (auditoría)</span>
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${badgeConciliacion}`}>
                      Dif: S/ {diferenciaConciliacion.toFixed(2)}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div className="rounded border border-emerald-200 bg-white px-2 py-1.5">
                      <div className="text-slate-500">Atenciones pagadas (día)</div>
                      <div className="font-bold text-emerald-700">S/ {totalAtencionesDia.toFixed(2)}</div>
                    </div>
                    <div className="rounded border border-green-200 bg-white px-2 py-1.5">
                      <div className="text-slate-500">Cobrado en caja (turno)</div>
                      <div className="font-bold text-green-700">S/ {cobradoTurno.toFixed(2)}</div>
                    </div>
                    <div className="rounded border border-amber-200 bg-white px-2 py-1.5">
                      <div className="text-slate-500">Monto sin asiento en caja</div>
                      <div className="font-bold text-amber-700">S/ {montoSinAsientoCaja.toFixed(2)}</div>
                    </div>
                    <div className="rounded border border-rose-200 bg-white px-2 py-1.5">
                      <div className="text-slate-500">Cobros referenciados inexistentes</div>
                      <div className="font-bold text-rose-700">S/ {montoCobrosInexistentes.toFixed(2)}</div>
                    </div>
                  </div>
                </div>
              )}
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
                  {ingresosPorPagoOperativo.length > 0 ? ingresosPorPagoOperativo.map((pago, i) => {
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
                  {ingresosPorServicioOperativo.length > 0 ? ingresosPorServicioOperativo.map((serv, j) => {
                    const tipoIngresoRaw = String(serv?.tipo_ingreso || "otros");
                    const tipoIngresoLower = tipoIngresoRaw.toLowerCase();
                    let color = "purple";
                    let icon = (<svg width="18" height="18" fill="none" viewBox="0 0 24 24"><circle cx="9" cy="9" r="8" fill="#a855f7"/><text x="9" y="13" textAnchor="middle" fontSize="8" fill="#fff">{tipoIngresoRaw[0] || "O"}</text></svg>);
                    if (tipoIngresoLower.includes("consulta")) {
                      color = "blue";
                      icon = (<svg width="18" height="18" fill="none" viewBox="0 0 24 24"><circle cx="9" cy="9" r="8" fill="#3b82f6"/><text x="9" y="13" textAnchor="middle" fontSize="8" fill="#fff">C</text></svg>);
                    } else if (tipoIngresoLower.includes("laboratorio")) {
                      color = "green";
                      icon = (<svg width="18" height="18" fill="none" viewBox="0 0 24 24"><circle cx="9" cy="9" r="8" fill="#22c55e"/><text x="9" y="13" textAnchor="middle" fontSize="8" fill="#fff">L</text></svg>);
                    } else if (tipoIngresoLower.includes("farmacia")) {
                      color = "yellow";
                      icon = (<svg width="18" height="18" fill="none" viewBox="0 0 24 24"><circle cx="9" cy="9" r="8" fill="#fbbf24"/><text x="9" y="13" textAnchor="middle" fontSize="8" fill="#fff">F</text></svg>);
                    } else if (tipoIngresoLower.includes("procedimiento")) {
                      color = "pink";
                      icon = (<svg width="18" height="18" fill="none" viewBox="0 0 24 24"><circle cx="9" cy="9" r="8" fill="#ec4899"/><text x="9" y="13" textAnchor="middle" fontSize="8" fill="#fff">P</text></svg>);
                    } else if (tipoIngresoLower.includes("contrato_abono")) {
                      color = "teal";
                      icon = (<svg width="18" height="18" fill="none" viewBox="0 0 24 24"><circle cx="9" cy="9" r="8" fill="#0d9488"/><text x="9" y="13" textAnchor="middle" fontSize="8" fill="#fff">A</text></svg>);
                    } else if (tipoIngresoLower.includes("ajuste_regularizacion")) {
                      color = "orange";
                      icon = (<svg width="18" height="18" fill="none" viewBox="0 0 24 24"><circle cx="9" cy="9" r="8" fill="#f97316"/><text x="9" y="13" textAnchor="middle" fontSize="8" fill="#fff">R</text></svg>);
                    }
                    return (
                      <div key={j} className={`rounded-lg shadow bg-white border-t-4 border-${color}-400 px-2 py-1 flex items-center gap-1 w-full sm:w-[120px] snap-center`}>
                        {icon}
                        <div className="truncate">
                          <div className={`font-bold text-${color}-700 text-xs truncate`}>{tipoIngresoLabel(tipoIngresoRaw)}</div>
                          <div className={`text-xs text-${color}-600 font-mono`}>S/ {parseFloat(serv.total_servicio || 0).toFixed(2)}</div>
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
