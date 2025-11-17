import React from 'react';

function CajasCerradasTable({ cajas, page, rowsPerPage, userRole, onReabrir }) {
  return (
    <div className="bg-white rounded-lg shadow-md">
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">Cajas Cerradas Recientes</h2>
        <p className="text-sm text-gray-600">Últimas 20 cajas cerradas</p>
      </div>
      {/* Vista tipo card en móvil */}
      <div className="block md:hidden p-4">
        {cajas.length === 0 ? (
          <div className="text-center py-8 text-gray-500">No hay cajas cerradas</div>
        ) : (
          cajas.slice((page - 1) * rowsPerPage, page * rowsPerPage).map((caja) => (
            <div key={caja.id} className="rounded-xl shadow-lg border border-yellow-100 bg-gradient-to-br from-yellow-50 via-white to-yellow-100 p-4 flex flex-col gap-2 mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-yellow-800 text-lg">Caja #{caja.id}</span>
                <span className={`px-2 py-1 rounded-full text-xs font-semibold ${parseFloat(caja.diferencia || 0) === 0 ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                  Dif.: S/ {parseFloat(caja.diferencia || 0).toFixed(2)}
                </span>
              </div>
              <div className="text-sm text-gray-700 mb-1"><span className="font-bold">Fecha:</span> {caja.fecha}</div>
              <div className="text-sm text-gray-700 mb-1"><span className="font-bold">Usuario:</span> {caja.usuario_nombre || '-'}</div>
              <div className="flex gap-2 text-xs text-gray-500 mb-1">
                <span>Turno: {caja.turno || '-'}</span>
                <span>Hora cierre: {caja.hora_cierre ? caja.hora_cierre.substr(0, 8) : '-'}</span>
              </div>
              <div className="flex gap-2 text-xs text-gray-500 mb-1">
                <span>Monto cierre: <span className="font-bold text-yellow-800">S/ {parseFloat(caja.monto_cierre || 0).toFixed(2)}</span></span>
              </div>
              <div className="mt-2 flex justify-end">
                <button
                  onClick={() => onReabrir(caja)}
                  className={`p-2 rounded-full bg-yellow-600 hover:bg-yellow-700 text-white flex items-center justify-center shadow ${userRole !== 'administrador' ? 'opacity-50 cursor-not-allowed' : ''}`}
                  disabled={userRole !== 'administrador'}
                  title="Reabrir"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                </button>
              </div>
            </div>
          ))
        )}
        {/* Paginación móvil */}
        <div className="flex justify-center items-center mt-2 gap-2">
          <button
            className="px-3 py-1 rounded-full bg-yellow-100 text-yellow-700 disabled:opacity-50 hover:bg-yellow-200 transition-colors shadow-sm"
            disabled={page === 1}
            onClick={() => onReabrir('prev')}
          >Anterior</button>
          <span className="px-3 py-1 text-sm font-medium bg-gray-50 rounded">Página {page} de {Math.max(1, Math.ceil(cajas.length / rowsPerPage))}</span>
          <button
            className="px-3 py-1 rounded-full bg-yellow-100 text-yellow-700 disabled:opacity-50 hover:bg-yellow-200 transition-colors shadow-sm"
            disabled={page === Math.max(1, Math.ceil(cajas.length / rowsPerPage))}
            onClick={() => onReabrir('next')}
          >Siguiente</button>
        </div>
      </div>
      {/* Vista tabla en desktop */}
      <div className="hidden md:block overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Usuario</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Turno</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">H. Cierre</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Monto</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Diferencia</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Acciones</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {cajas.length === 0 ? (
              <tr>
                <td colSpan="6" className="px-4 py-8 text-center text-gray-500">
                  No hay cajas cerradas
                </td>
              </tr>
            ) : (
              cajas.slice((page - 1) * rowsPerPage, page * rowsPerPage).map((caja) => (
                <tr key={caja.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{caja.id}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{caja.fecha}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{caja.usuario_nombre || '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{caja.turno || '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {caja.hora_cierre ? caja.hora_cierre.substr(0, 8) : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    S/ {parseFloat(caja.monto_cierre || 0).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`inline-flex px-2 py-1 text-xs rounded-full ${
                      parseFloat(caja.diferencia || 0) === 0 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      S/ {parseFloat(caja.diferencia || 0).toFixed(2)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <button
                      onClick={() => onReabrir(caja)}
                      className={`bg-yellow-600 hover:bg-yellow-700 text-white px-3 py-1 rounded text-xs font-medium transition-colors ${userRole !== 'administrador' ? 'opacity-50 cursor-not-allowed' : ''}`}
                      disabled={userRole !== 'administrador'}
                    >
                      🔓 Reabrir
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {/* Paginación */}
        <div className="flex justify-between items-center mt-4">
          <div>
            Página {page} de {Math.max(1, Math.ceil(cajas.length / rowsPerPage))}
          </div>
          <div className="flex gap-2">
            <button
              className="btn btn-sm"
              disabled={page === 1}
              onClick={() => onReabrir('prev')}
            >Anterior</button>
            <button
              className="btn btn-sm"
              disabled={page === Math.max(1, Math.ceil(cajas.length / rowsPerPage))}
              onClick={() => onReabrir('next')}
            >Siguiente</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CajasCerradasTable;
