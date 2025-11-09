import React from "react";

export default function CajaResumenDiario({ resumen }) {
  console.log('caja resumen', resumen);
  if (resumen && resumen.debug_lab_ref_movs) {
    console.log('Movimientos laboratorio referencia sumados:', resumen.debug_lab_ref_movs);
  }
  if (!resumen) return null;
  return (
    <div className="bg-purple-50 border-2 border-purple-200 rounded-xl p-8 shadow mb-8">
      <h2 className="text-2xl font-bold text-purple-800 mb-6">Resumen Diario de Caja admin/recepcionista</h2>
      {/* Fecha eliminada para evitar confusión */}
      <div className="mb-6">
        <span className="text-lg font-semibold text-blue-700">Monto de apertura de caja admin/recep:</span> S/ {resumen.monto_apertura ? resumen.monto_apertura.toFixed(2) : "0.00"}
      </div>
      <div className="mb-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Ingreso total */}
        <div className="rounded-xl shadow bg-white border-t-4 border-yellow-400 p-4 flex flex-col items-start gap-2">
          <span className="font-bold text-yellow-700 text-md">INGRESO TOTAL DEL DÍA</span>
          <div className="text-3xl font-extrabold text-yellow-600">S/ {resumen.total.toFixed(2)}</div>
        </div>
        {/* Egreso honorarios médicos */}
        <div className="rounded-xl shadow bg-white border-t-4 border-red-400 p-4 flex flex-col items-start gap-2">
          <span className="font-bold text-red-700 text-md">EGRESO HONORARIOS MÉDICOS</span>
          <div className="text-3xl font-extrabold text-red-600">S/ {resumen.egreso_honorarios ? resumen.egreso_honorarios.toFixed(2) : "0.00"}</div>
        </div>
        {/* Egreso laboratorio de referencia */}
        <div className="rounded-xl shadow bg-white border-t-4 border-blue-400 p-4 flex flex-col items-start gap-2">
          <span className="font-bold text-blue-700 text-md">EGRESO LAB. REFERENCIA</span>
          <div className="text-3xl font-extrabold text-blue-600">S/ {resumen.egreso_lab_ref ? resumen.egreso_lab_ref.toFixed(2) : "0.00"}</div>
        </div>
        {/* Egreso operativo */}
        <div className="rounded-xl shadow bg-white border-t-4 border-gray-400 p-4 flex flex-col items-start gap-2">
          <span className="font-bold text-gray-700 text-md">EGRESO OPERATIVO</span>
          <div className="text-3xl font-extrabold text-gray-600">S/ {resumen.egreso_operativo ? resumen.egreso_operativo.toFixed(2) : "0.00"}</div>
        </div>
        {/* Ganancia del día */}
        <div className="rounded-xl shadow bg-white border-t-4 border-green-400 p-4 flex flex-col items-start gap-2">
          <span className="font-bold text-green-700 text-md">GANANCIA DEL DÍA</span>
          <div className="text-3xl font-extrabold text-green-600">S/ {resumen.ganancia_dia ? resumen.ganancia_dia.toFixed(2) : "0.00"}</div>
        </div>
      </div>
      {/* Cards modernas para tipo de pago */}
      <div className="mb-8">
        <h3 className="text-lg font-bold text-blue-700 mb-4">Ingresos por Tipo de Pago</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          {resumen.por_pago && resumen.por_pago.length > 0 ? (
            resumen.por_pago.map((pago, idx) => (
              <div key={idx} className="rounded-xl shadow bg-white border-t-4 border-green-400 p-4 flex flex-col items-start gap-2">
                <span className="font-bold text-green-700 text-md">{(pago.metodo_pago || pago.tipo_pago).toUpperCase()}</span>
                <div className="text-2xl font-extrabold text-green-600">S/ {parseFloat(pago.total_pago).toFixed(2)}</div>
              </div>
            ))
          ) : (
            <div className="col-span-4 text-gray-500">No hay ingresos registrados</div>
          )}
        </div>
      </div>
      {/* Cards modernas para tipo de servicio */}
      <div className="mb-8">
        <h3 className="text-lg font-bold text-purple-700 mb-4">Ingresos por Tipo de Servicio</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          {resumen.por_servicio && resumen.por_servicio.length > 0 ? (
            resumen.por_servicio.map((serv, idx) => (
              <div key={idx} className="rounded-xl shadow bg-white border-t-4 border-purple-400 p-4 flex flex-col items-start gap-2">
                <span className="font-bold text-purple-700 text-md">{serv.tipo_ingreso.toUpperCase()}</span>
                <div className="text-2xl font-extrabold text-purple-600">S/ {parseFloat(serv.total_servicio).toFixed(2)}</div>
              </div>
            ))
          ) : (
            <div className="col-span-4 text-gray-500">No hay ingresos registrados</div>
          )}
        </div>
      </div>
    </div>
  );
}