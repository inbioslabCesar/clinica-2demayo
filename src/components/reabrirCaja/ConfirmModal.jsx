import React from 'react';

function ConfirmModal({ caja, motivo, setMotivo, onClose, onConfirm, procesando }) {
  if (!caja) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="p-6">
          <div className="flex items-center mb-4">
            <svg className="w-8 h-8 text-yellow-600 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <h3 className="text-lg font-semibold text-gray-900">Confirmar Reapertura</h3>
          </div>
          <div className="mb-4 p-3 bg-gray-50 rounded">
            <p className="text-sm"><strong>Caja ID:</strong> {caja.id}</p>
            <p className="text-sm"><strong>Fecha:</strong> {caja.fecha}</p>
            <p className="text-sm"><strong>Cerrada:</strong> {caja.hora_cierre}</p>
            <p className="text-sm"><strong>Monto:</strong> S/ {parseFloat(caja.monto_cierre || 0).toFixed(2)}</p>
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Motivo de la reapertura *
            </label>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows="3"
              placeholder="Describe el motivo de esta reapertura..."
            />
          </div>
          <div className="flex justify-end space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-200 rounded hover:bg-gray-300 transition-colors"
              disabled={procesando}
            >
              Cancelar
            </button>
            <button
              onClick={onConfirm}
              disabled={procesando || !motivo.trim()}
              className="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700 disabled:opacity-50 transition-colors"
            >
              {procesando ? 'Reabriendo...' : '🔓 Reabrir Caja'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ConfirmModal;
