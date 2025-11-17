import React from "react";


export default function LiquidacionLaboratorioReferenciaTable({ movimientos, paginated, onVerDetalles, onMarcarPagado }) {
  return (
    <div className="w-full">
      {/* Vista tipo card en móvil */}
      <div className="block md:hidden">
        <div className="space-y-4">
          {paginated.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No hay movimientos para mostrar.</div>
          ) : paginated.map((m, idx) => (
            <div key={m.id} className="rounded-xl shadow-lg border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-blue-100 p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-blue-800 text-lg">{m.laboratorio}</span>
                <span className={`text-xs px-2 py-1 rounded font-bold ${m.estado === 'pendiente' ? 'bg-yellow-200 text-yellow-800' : 'bg-green-200 text-green-800'}`}>{m.estado}</span>
              </div>
              <div className="flex gap-2 text-xs text-gray-500 mb-1">
                <span>Fecha: <span className="font-bold">{m.fecha}</span></span>
                <span>Turno: {m.turno_cobro || '-'}</span>
                <span>Hora: {m.hora_cobro || '-'}</span>
              </div>
              <div className="flex gap-2 text-xs text-gray-500 mb-1">
                <span>Tipo: {m.tipo === 'monto' ? 'Monto fijo' : 'Porcentaje'}</span>
                <span>Monto: {m.tipo === 'monto' ? `S/ ${parseFloat(m.monto).toFixed(2)}` : `${parseFloat(m.monto).toFixed(2)} %`}</span>
              </div>
              <div className="flex gap-2 text-xs text-gray-500 mb-1">
                <span>Usuario Cobro: {m.cobrado_por || '-'}</span>
                <span>Usuario Liquidó: {m.liquidado_por || '-'}</span>
              </div>
              <div className="flex gap-2 text-xs text-gray-500 mb-1">
                <span>Turno Liquidación: {m.turno_liquidacion || '-'}</span>
                <span>Hora Liquidación: {m.hora_liquidacion || '-'}</span>
              </div>
              <div className="flex gap-2 text-xs text-gray-500 mb-1 items-center">
                <span>Exámenes:</span>
                <button
                  title="Ver detalles"
                  className="p-2 rounded-full bg-blue-100 hover:bg-blue-200 text-blue-700 shadow-sm"
                  onClick={() => onVerDetalles(m)}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </button>
              </div>
              <div className="mt-2 flex justify-end">
                {m.estado === 'pendiente' && (
                  <button
                    title="Marcar como pagado"
                    onClick={() => onMarcarPagado(m.id)}
                    className="px-4 py-1 rounded bg-green-600 text-white font-bold"
                  >Marcar pagado</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* Vista tabla en desktop */}
      <div className="hidden md:block">
        <table className="w-full table-auto border-separate border-spacing-0 bg-white shadow-lg rounded-xl text-xs sm:text-sm">
          <thead>
            <tr className="bg-gradient-to-r from-blue-100 to-blue-300 text-blue-900">
              <th className="px-3 py-2 font-semibold border-b border-gray-200">Fecha</th>
              <th className="px-3 py-2 font-semibold border-b border-gray-200">Laboratorio</th>
              <th className="hidden sm:table-cell px-3 py-2 font-semibold border-b border-gray-200">Tipo</th>
              <th className="hidden sm:table-cell px-3 py-2 font-semibold border-b border-gray-200">Monto/Porcentaje</th>
              <th className="hidden sm:table-cell px-3 py-2 font-semibold border-b border-gray-200">Usuario Cobro</th>
              <th className="hidden sm:table-cell px-3 py-2 font-semibold border-b border-gray-200">Turno Cobro</th>
              <th className="hidden sm:table-cell px-3 py-2 font-semibold border-b border-gray-200">Hora Cobro</th>
              <th className="hidden sm:table-cell px-3 py-2 font-semibold border-b border-gray-200">Usuario Liquidó</th>
              <th className="hidden sm:table-cell px-3 py-2 font-semibold border-b border-gray-200">Turno Liquidación</th>
              <th className="hidden sm:table-cell px-3 py-2 font-semibold border-b border-gray-200">Hora Liquidación</th>
              <th className="px-3 py-2 font-semibold border-b border-gray-200">Exámenes</th>
              <th className="px-3 py-2 font-semibold border-b border-gray-200">Estado</th>
              <th className="px-3 py-2 font-semibold border-b border-gray-200">Acción</th>
            </tr>
          </thead>
          <tbody>
            {paginated.map((m, idx) => (
              <tr key={m.id} className={idx % 2 === 0 ? "bg-white" : "bg-blue-50 hover:bg-blue-100 transition"}>
                <td className="px-2 py-2 border-b border-gray-100 break-words max-w-[120px]">{m.fecha}</td>
                <td className="px-2 py-2 border-b border-gray-100 break-words max-w-[120px]">{m.laboratorio}</td>
                <td className="hidden sm:table-cell px-3 py-2 border-b border-gray-100 whitespace-nowrap">{m.tipo === 'monto' ? 'Monto fijo' : 'Porcentaje'}</td>
                <td className="hidden sm:table-cell px-3 py-2 border-b border-gray-100 whitespace-nowrap">{m.tipo === 'monto' ? `S/ ${parseFloat(m.monto).toFixed(2)}` : `${parseFloat(m.monto).toFixed(2)} %`}</td>
                <td className="hidden sm:table-cell px-3 py-2 border-b border-gray-100 whitespace-nowrap">{m.cobrado_por || '-'}</td>
                <td className="hidden sm:table-cell px-3 py-2 border-b border-gray-100 whitespace-nowrap">{m.turno_cobro || '-'}</td>
                <td className="hidden sm:table-cell px-3 py-2 border-b border-gray-100 whitespace-nowrap">{m.hora_cobro || '-'}</td>
                <td className="hidden sm:table-cell px-3 py-2 border-b border-gray-100 whitespace-nowrap">{m.liquidado_por || '-'}</td>
                <td className="hidden sm:table-cell px-3 py-2 border-b border-gray-100 whitespace-nowrap">{m.turno_liquidacion || '-'}</td>
                <td className="hidden sm:table-cell px-3 py-2 border-b border-gray-100 whitespace-nowrap">{m.hora_liquidacion || '-'}</td>
                <td className="px-2 py-2 border-b border-gray-100">
                  <button
                    title="Ver detalles"
                    className="p-2 rounded-full bg-blue-100 hover:bg-blue-200 text-blue-700 shadow-sm"
                    onClick={() => onVerDetalles(m)}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  </button>
                </td>
                <td className={`px-2 py-2 border-b border-gray-100 font-bold ${m.estado === 'pendiente' ? 'text-yellow-600' : 'text-green-700'}`}>{m.estado}</td>
                <td className="px-2 py-2 border-b border-gray-100 text-center">
                  {m.estado === 'pendiente' ? (
                    <button
                      title="Marcar como pagado"
                      onClick={() => onMarcarPagado(m.id)}
                      className="p-2 rounded-full bg-green-100 hover:bg-green-200 text-green-700 shadow-sm"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
