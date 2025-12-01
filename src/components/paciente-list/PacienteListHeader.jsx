// Header y botones principales
export default function PacienteListHeader({ onAgregar, totalRows }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h1 className="text-2xl font-bold text-purple-800">Pacientes</h1>
      <div className="flex items-center gap-2">
        <button
          onClick={onAgregar}
          className="bg-purple-700 hover:bg-purple-800 text-white font-semibold px-4 py-2 rounded shadow transition-colors"
        >
          <span className="mr-2">+</span> Nuevo Paciente
        </button>
        <span className="text-gray-600 text-sm">Total: {totalRows}</span>
      </div>
    </div>
  );
}
