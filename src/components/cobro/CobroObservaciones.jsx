// Campo de observaciones
export default function CobroObservaciones({ observaciones, setObservaciones }) {
  return (
    <div className="mb-6">
      <label className="block font-semibold mb-2">Observaciones:</label>
      <textarea 
        value={observaciones}
        onChange={e => setObservaciones(e.target.value)}
        className="w-full border rounded px-3 py-2 h-20"
        placeholder="Observaciones adicionales (opcional)"
      />
    </div>
  );
}
