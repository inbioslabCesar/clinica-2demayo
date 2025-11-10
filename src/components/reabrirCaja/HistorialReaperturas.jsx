import React from 'react';

function HistorialReaperturas({ historial }) {
  return (
    <div className="bg-white rounded-lg shadow-md">
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">Historial de Reaperturas</h2>
        <p className="text-sm text-gray-600">Últimas 10 reaperturas</p>
      </div>
      <div className="p-4 space-y-3">
        {historial.length === 0 ? (
          <p className="text-gray-500 text-center py-4">No hay reaperturas registradas</p>
        ) : (
          historial.map((reapertura, index) => (
            <div key={index} className="border-l-4 border-yellow-400 pl-3 py-2">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    Caja ID {reapertura.caja_id}
                  </p>
                  <p className="text-xs text-gray-600">
                    {reapertura.usuario_nombre}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {reapertura.motivo}
                  </p>
                </div>
                <span className="text-xs text-gray-400">
                  {new Date(reapertura.fecha_reapertura).toLocaleString()}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default HistorialReaperturas;
