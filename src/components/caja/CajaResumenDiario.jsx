import React from "react";

export default function CajaResumenDiario({ resumen }) {
  // ...existing code...
  if (!resumen) return null;
  return (
    <div className="bg-gradient-to-br from-purple-50 via-white to-purple-100 border-2 border-purple-200 rounded-2xl p-4 sm:p-8 shadow-xl mb-8 w-full">
      <h2 className="text-2xl sm:text-3xl font-extrabold text-purple-800 mb-4 text-center tracking-tight drop-shadow">Resumen Diario de Caja</h2>
      <div className="mb-4 text-center">
        <span className="text-base sm:text-lg font-semibold text-blue-700">Monto de apertura de caja:</span>
        <span className="text-lg sm:text-xl font-bold text-blue-900 ml-2">S/ {resumen.monto_apertura ? resumen.monto_apertura.toFixed(2) : "0.00"}</span>
      </div>
        {(resumen.fecha || resumen.hora_apertura) && (
          <div className="mb-4 text-center">
            <span className="text-base font-semibold text-gray-700">Fecha y hora de apertura:</span>
            <span className="text-base font-bold text-gray-900 ml-2">
              {resumen.fecha ? resumen.fecha : ""}
              {resumen.hora_apertura ? (" " + resumen.hora_apertura) : ""}
            </span>
          </div>
        )}
      <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {/* Ingreso total */}
        <div className="rounded-2xl shadow-lg bg-white border-t-4 border-yellow-400 p-4 flex flex-col items-center gap-2 hover:scale-[1.03] transition-all">
          <span className="font-bold text-yellow-700 text-md">INGRESO TOTAL DEL DÍA</span>
          <div className="text-3xl font-extrabold text-yellow-600 drop-shadow">S/ {resumen.total.toFixed(2)}</div>
        </div>
        {/* Egreso honorarios médicos */}
        <div className="rounded-2xl shadow-lg bg-white border-t-4 border-red-400 p-4 flex flex-col items-center gap-2 hover:scale-[1.03] transition-all">
          <span className="font-bold text-red-700 text-md">EGRESO HONORARIOS MÉDICOS</span>
          <div className="text-3xl font-extrabold text-red-600 drop-shadow">S/ {resumen.egreso_honorarios ? resumen.egreso_honorarios.toFixed(2) : "0.00"}</div>
        </div>
        {/* Egreso laboratorio de referencia */}
        <div className="rounded-2xl shadow-lg bg-white border-t-4 border-blue-400 p-4 flex flex-col items-center gap-2 hover:scale-[1.03] transition-all">
          <span className="font-bold text-blue-700 text-md">EGRESO LAB. REFERENCIA</span>
          <div className="text-3xl font-extrabold text-blue-600 drop-shadow">S/ {resumen.egreso_lab_ref ? resumen.egreso_lab_ref.toFixed(2) : "0.00"}</div>
        </div>
        {/* Egreso operativo */}
        <div className="rounded-2xl shadow-lg bg-white border-t-4 border-gray-400 p-4 flex flex-col items-center gap-2 hover:scale-[1.03] transition-all">
          <span className="font-bold text-gray-700 text-md">EGRESO OPERATIVO</span>
          <div className="text-3xl font-extrabold text-gray-600 drop-shadow">S/ {resumen.egreso_operativo ? resumen.egreso_operativo.toFixed(2) : "0.00"}</div>
        </div>
        {/* Ganancia del día */}
        <div className="rounded-2xl shadow-lg bg-white border-t-4 border-green-400 p-4 flex flex-col items-center gap-2 hover:scale-[1.03] transition-all">
          <span className="font-bold text-green-700 text-md">GANANCIA DEL DÍA</span>
          <div className="text-3xl font-extrabold text-green-600 drop-shadow">S/ {resumen.ganancia_dia ? resumen.ganancia_dia.toFixed(2) : "0.00"}</div>
        </div>
      </div>
      {/* Cards modernas para tipo de pago */}
      <div className="mb-6">
        <h3 className="text-lg sm:text-xl font-bold text-blue-700 mb-2 text-center">Ingresos por Tipo de Pago</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
          {resumen.por_pago && resumen.por_pago.length > 0 ? (
            resumen.por_pago.map((pago, idx) => (
              <div key={idx} className="rounded-2xl shadow-lg bg-white border-t-4 border-green-400 p-4 flex flex-col items-center gap-2 hover:scale-[1.03] transition-all">
                <span className="font-bold text-green-700 text-md">{(pago.metodo_pago || pago.tipo_pago).toUpperCase()}</span>
                <div className="text-2xl font-extrabold text-green-600 drop-shadow">S/ {parseFloat(pago.total_pago).toFixed(2)}</div>
              </div>
            ))
          ) : (
            <div className="col-span-4 text-gray-500 text-center">No hay ingresos registrados</div>
          )}
        </div>
      </div>
      {/* Cards modernas para tipo de servicio */}
      <div className="mb-2">
        <h3 className="text-lg sm:text-xl font-bold text-purple-700 mb-2 text-center">Ingresos por Tipo de Servicio</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
          {resumen.por_servicio && resumen.por_servicio.length > 0 ? (
            resumen.por_servicio.map((serv, idx) => (
              <div key={idx} className="rounded-2xl shadow-lg bg-white border-t-4 border-purple-400 p-4 flex flex-col items-center gap-2 hover:scale-[1.03] transition-all">
                <span className="font-bold text-purple-700 text-md">{serv.tipo_ingreso.toUpperCase()}</span>
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