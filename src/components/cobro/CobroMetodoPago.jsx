// Selector de método de pago
export default function CobroMetodoPago({ tipoPago, setTipoPago }) {
  return (
    <div className="mb-4">
      <label className="block font-semibold mb-2">Método de Pago:</label>
      <select 
        value={tipoPago} 
        onChange={e => setTipoPago(e.target.value)}
        className="w-full border rounded px-3 py-2"
      >
        <option value="efectivo">Efectivo</option>
        <option value="tarjeta">Tarjeta</option>
        <option value="transferencia">Transferencia</option>
        <option value="yape">Yape</option>
        <option value="plin">Plin</option>
      </select>
    </div>
  );
}
