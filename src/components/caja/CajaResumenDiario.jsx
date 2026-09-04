import React from "react";

export default function CajaResumenDiario({ resumen, adminRecepConsolidado = null, adminControlRealConsolidado = null }) {
  // ...existing code...
  const tipoIngresoLabel = (tipo) => String(tipo || "").replace(/_/g, " ").toUpperCase();
  const hasPositive = (val) => val !== undefined && val !== null && parseFloat(val) > 0;
  const Check = () => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="w-5 h-5"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
  if (!resumen) return null;
  return (
    <div className="w-full rounded-3xl border border-slate-200 bg-gradient-to-b from-white via-slate-50 to-cyan-50 p-4 shadow-sm sm:p-6">
      <h2 className="mb-4 text-center text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">Resumen Diario de Caja</h2>
      {adminRecepConsolidado && (
        <div className="mb-4 rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 via-white to-cyan-50 p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Vista consolidada admin</div>
              <div className="text-lg sm:text-xl font-extrabold text-emerald-800">Ingreso total recepcionistas: S/ {Number(adminRecepConsolidado.totalIngresos || 0).toFixed(2)}</div>
              <div className="text-sm text-slate-600">Ganancia neta recepcionistas: S/ {Number(adminRecepConsolidado.totalGanancia || 0).toFixed(2)}</div>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-700">
                Cajas abiertas: {Number(adminRecepConsolidado.cajasAbiertas || 0)}
              </span>
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-700">
                Recepcionistas activos: {Number(adminRecepConsolidado.usuariosUnicos || 0)}
              </span>
              <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-100 px-2.5 py-1 font-semibold text-emerald-700">
                Tiempo real: 10s
              </span>
            </div>
          </div>
        </div>
      )}
      {adminControlRealConsolidado && (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 via-white to-orange-50 p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">Control real de cierre (recepcionistas)</div>
              <div className="text-base sm:text-lg font-extrabold text-amber-900">
                Efectivo esperado: S/ {Number(adminControlRealConsolidado.efectivoEsperadoTotal || 0).toFixed(2)}
                {" | "}
                Efectivo contado: S/ {Number(adminControlRealConsolidado.efectivoContadoTotal || 0).toFixed(2)}
              </div>
              <div className="text-sm text-slate-700">
                Diferencia neta: S/ {Number(adminControlRealConsolidado.diferenciaEfectivoTotal || 0).toFixed(2)}
                {" | "}
                Virtual cobrado: S/ {Number(adminControlRealConsolidado.virtualCobradoTotal || 0).toFixed(2)}
              </div>
              <div className="text-sm text-slate-700">
                Virtual contado: S/ {Number(adminControlRealConsolidado.virtualContadoTotal || 0).toFixed(2)}
                {" | "}
                Diferencia virtual neta: S/ {Number(adminControlRealConsolidado.diferenciaVirtualTotal || 0).toFixed(2)}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-700">
                Cajas cerradas: {Number(adminControlRealConsolidado.cajasCerradas || 0)}
              </span>
              <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-100 px-2.5 py-1 font-semibold text-rose-700">
                Autocierre pendiente: {Number(adminControlRealConsolidado.cajasPendientesRegularizacion || 0)}
              </span>
              <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-100 px-2.5 py-1 font-semibold text-emerald-700">
                Cuadre efectivo OK: {Number(adminControlRealConsolidado.cajasConCuadreEfectivo || 0)}
              </span>
              <span className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-100 px-2.5 py-1 font-semibold text-indigo-700">
                Virtual registrado: {Number(adminControlRealConsolidado.cajasConVirtualRegistrado || 0)}
              </span>
              <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-100 px-2.5 py-1 font-semibold text-sky-700">
                Cuadre virtual OK: {Number(adminControlRealConsolidado.cajasConCuadreVirtual || 0)}
              </span>
            </div>
          </div>
          <div className="mt-2 text-xs text-amber-800">
            Este bloque refleja solo cierres con cuadre real final. Los autocierres por corte de 24h quedan marcados como pendientes de regularizacion.
          </div>
        </div>
      )}
      <div className="mb-3 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-center shadow-sm">
        <span className="text-sm font-semibold text-slate-600 sm:text-base">Monto de apertura de caja:</span>
        <span className="ml-2 text-lg font-black text-slate-900 sm:text-xl">S/ {resumen.monto_apertura ? resumen.monto_apertura.toFixed(2) : "0.00"}</span>
      </div>
        {(resumen.fecha || resumen.hora_apertura) && (
          <div className="mb-4 text-center">
            <span className="text-sm font-semibold text-slate-600">Fecha y hora de apertura:</span>
            <span className="ml-2 text-sm font-bold text-slate-900 sm:text-base">
              {resumen.fecha ? resumen.fecha : ""}
              {resumen.hora_apertura ? (" " + resumen.hora_apertura) : ""}
            </span>
          </div>
        )}
      <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {/* Ingreso total */}
        <div className="rounded-2xl border border-yellow-100 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
          <span className="font-bold text-yellow-700 text-md flex items-center">INGRESO TOTAL DEL DÍA {hasPositive(resumen.total) && (<span className="ml-2 text-green-600"><Check /></span>)}</span>
          <div className="text-3xl font-extrabold text-yellow-600 drop-shadow">S/ {resumen.total.toFixed(2)}</div>
        </div>
        {/* Egreso honorarios médicos */}
        <div className="rounded-2xl border border-rose-100 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
          <span className="font-bold text-red-700 text-md flex items-center">EGRESO HONORARIOS MÉDICOS {hasPositive(resumen.egreso_honorarios) && (<span className="ml-2 text-green-600"><Check /></span>)}</span>
          <div className="text-3xl font-extrabold text-red-600 drop-shadow">S/ {resumen.egreso_honorarios ? resumen.egreso_honorarios.toFixed(2) : "0.00"}</div>
        </div>
        {/* Egreso laboratorio de referencia */}
        <div className="rounded-2xl border border-blue-100 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
          <span className="font-bold text-blue-700 text-md flex items-center">EGRESO LAB. REFERENCIA {hasPositive(resumen.egreso_lab_ref) && (<span className="ml-2 text-green-600"><Check /></span>)}</span>
          <div className="text-3xl font-extrabold text-blue-600 drop-shadow">S/ {resumen.egreso_lab_ref ? resumen.egreso_lab_ref.toFixed(2) : "0.00"}</div>
        </div>
        {/* Egreso operativo */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
          <span className="font-bold text-gray-700 text-md flex items-center">EGRESO OPERATIVO {hasPositive(resumen.egreso_operativo) && (<span className="ml-2 text-green-600"><Check /></span>)}</span>
          <div className="text-3xl font-extrabold text-gray-600 drop-shadow">S/ {resumen.egreso_operativo ? resumen.egreso_operativo.toFixed(2) : "0.00"}</div>
        </div>
        {/* Ganancia del día */}
        <div className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
          <span className="font-bold text-green-700 text-md flex items-center">GANANCIA DEL DÍA {hasPositive(resumen.ganancia_dia) && (<span className="ml-2 text-green-600"><Check /></span>)}</span>
          <div className="text-3xl font-extrabold text-green-600 drop-shadow">S/ {resumen.ganancia_dia ? resumen.ganancia_dia.toFixed(2) : "0.00"}</div>
        </div>
      </div>
      {/* Cards modernas para tipo de pago */}
      <div className="mb-6 rounded-2xl border border-blue-100 bg-blue-50/40 p-3 sm:p-4">
        <h3 className="mb-3 text-center text-lg font-extrabold text-blue-800 sm:text-xl">Ingresos por Tipo de Pago</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
          {resumen.por_pago && resumen.por_pago.length > 0 ? (
            resumen.por_pago.map((pago, idx) => (
              <div key={idx} className="rounded-2xl border border-green-100 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
                <span className="font-bold text-green-700 text-md flex items-center">{(pago.metodo_pago || pago.tipo_pago).toUpperCase()} {parseFloat(pago.total_pago) > 0 && (<span className="ml-2 text-green-600"><Check /></span>)}</span>
                <div className="text-2xl font-extrabold text-green-600 drop-shadow">S/ {parseFloat(pago.total_pago).toFixed(2)}</div>
              </div>
            ))
          ) : (
            <div className="col-span-4 text-gray-500 text-center">No hay ingresos registrados</div>
          )}
        </div>
      </div>
      {/* Cards modernas para tipo de servicio */}
      <div className="mb-2 rounded-2xl border border-fuchsia-100 bg-fuchsia-50/40 p-3 sm:p-4">
        <h3 className="mb-3 text-center text-lg font-extrabold text-fuchsia-800 sm:text-xl">Ingresos por Tipo de Servicio</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
          {resumen.por_servicio && resumen.por_servicio.length > 0 ? (
            resumen.por_servicio.map((serv, idx) => (
              <div key={idx} className="rounded-2xl border border-fuchsia-100 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
                <span className="font-bold text-purple-700 text-md flex items-center">{tipoIngresoLabel(serv.tipo_ingreso)} {parseFloat(serv.total_servicio) > 0 && (<span className="ml-2 text-green-600"><Check /></span>)}</span>
                <div className="text-2xl font-extrabold text-purple-600 drop-shadow">S/ {parseFloat(serv.total_servicio).toFixed(2)}</div>
              </div>
            ))
          ) : (
            <div className="col-span-4 text-gray-500 text-center">No hay ingresos registrados</div>
          )}
        </div>
      </div>
    </div>
  );
}