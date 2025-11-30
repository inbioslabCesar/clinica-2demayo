// Selector de tipo de cobertura
export default function CobroCobertura({ tipoCobertura, setTipoCobertura }) {
  return (
    <div className="mb-4">
      <label className="block font-semibold mb-2">Tipo de Cobertura:</label>
      <select 
        value={tipoCobertura} 
        onChange={e => setTipoCobertura(e.target.value)}
        className="w-full border rounded px-3 py-2"
      >
        <option value="particular">Particular</option>
        <option value="seguro">Seguro</option>
        <option value="convenio">Convenio</option>
      </select>
    </div>
  );
}
