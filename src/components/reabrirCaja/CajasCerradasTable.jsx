import React from 'react';

function CajasCerradasTable({ cajas, page, rowsPerPage, userRole, onReabrir }) {
  return (
    <div className="bg-white rounded-lg shadow-md">
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">Cajas Cerradas Recientes</h2>
        <p className="text-sm text-gray-600">Últimas 20 cajas cerradas</p>
      </div>
      <div className="overflow-x-auto">
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
