// Botones de acción (Cobrar, Cancelar)
export default function CobroAcciones({ onCobrar, onCancelar, loading, total }) {
  return (
    <div className="flex gap-3 mt-6">
      <button 
        onClick={onCobrar}
        disabled={loading || total <= 0}
        className="flex-1 bg-green-600 text-white py-2 px-4 rounded font-bold text-base hover:bg-green-700 disabled:bg-gray-400"
      >
        {loading ? 'Procesando...' : `💳 Cobrar S/ ${total.toFixed(2)}`}
      </button>
      <button 
        onClick={onCancelar}
        className="bg-gray-500 text-white py-2 px-4 rounded font-bold text-base hover:bg-gray-600"
      >
        Cancelar
      </button>
    </div>
  );
}
