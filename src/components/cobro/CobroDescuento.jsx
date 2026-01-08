// Campo y lógica de descuento
export default function CobroDescuento({ tipoDescuento, setTipoDescuento, valorDescuento, setValorDescuento, montoOriginal, errorDescuento }) {
  return (
    <div className="mb-6">
      <label className="block font-semibold mb-2">Descuento:</label>
      <div className="mb-2 flex flex-col gap-2">
        <select
          value={tipoDescuento}
          onChange={e => setTipoDescuento(e.target.value)}
          className="border rounded px-3 py-2 w-full"
        >
          <option value="porcentaje">Porcentaje (%)</option>
          <option value="monto">Monto fijo (S/)</option>
        </select>
        <input
          type="number"
          min="0"
          step="any"
          value={valorDescuento}
          onChange={e => setValorDescuento(Number(e.target.value))}
          className="border rounded px-3 py-2 w-full"
          placeholder={tipoDescuento === 'porcentaje' ? 'Ej: 10' : 'Ej: 20.00'}
        />
      </div>
      <div className="text-sm text-gray-600">Monto original: <span className="font-bold">S/ {montoOriginal.toFixed(2)}</span></div>
      <div className="text-sm text-gray-600">Descuento aplicado: <span className="font-bold">{tipoDescuento === 'porcentaje' ? `${valorDescuento}%` : `S/ ${valorDescuento.toFixed(2)}`}</span></div>
      <div className="text-sm text-green-700 font-bold">Monto final a cobrar: S/ {Math.max(montoOriginal - (tipoDescuento === 'porcentaje' ? montoOriginal * (valorDescuento / 100) : valorDescuento), 0).toFixed(2)}</div>
      {errorDescuento && <div className="text-red-600 text-sm mt-1">{errorDescuento}</div>}
    </div>
  );
}
