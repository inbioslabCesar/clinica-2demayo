// Campo y lógica de descuento
export default function CobroDescuento({
  tipoDescuento,
  setTipoDescuento,
  valorDescuento,
  setValorDescuento,
  montoOriginal,
  errorDescuento,
  montoFinalOverride,
  montoDescuentoOverride,
}) {
  const montoBase = Number.isFinite(Number(montoOriginal)) ? Number(montoOriginal) : 0;
  const valor = Number.isFinite(Number(valorDescuento)) ? Number(valorDescuento) : 0;
  const descuento = tipoDescuento === 'porcentaje' ? (montoBase * (valor / 100)) : valor;
  const descuentoVisible = Number.isFinite(Number(montoDescuentoOverride))
    ? Math.max(0, Number(montoDescuentoOverride))
    : Math.max(0, descuento);
  const montoFinal = Number.isFinite(Number(montoFinalOverride))
    ? Math.max(0, Number(montoFinalOverride))
    : Math.max(montoBase - descuentoVisible, 0);

  const parseInput = (raw) => {
    const normalized = String(raw ?? '').replace(',', '.').trim();
    const n = Number.parseFloat(normalized);
    return Number.isFinite(n) ? n : 0;
  };

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
          onChange={e => setValorDescuento(parseInput(e.target.value))}
          className="border rounded px-3 py-2 w-full"
          placeholder={tipoDescuento === 'porcentaje' ? 'Ej: 10' : 'Ej: 20.00'}
        />
      </div>
      <div className="text-sm text-gray-600">Monto original: <span className="font-bold">S/ {montoBase.toFixed(2)}</span></div>
      <div className="text-sm text-gray-600">Descuento aplicado: <span className="font-bold">{tipoDescuento === 'porcentaje' ? `${valor}%` : `S/ ${descuentoVisible.toFixed(2)}`}</span></div>
      <div className="text-sm text-green-700 font-bold">Monto final a cobrar: S/ {montoFinal.toFixed(2)}</div>
      {errorDescuento && <div className="text-red-600 text-sm mt-1">{errorDescuento}</div>}
    </div>
  );
}
