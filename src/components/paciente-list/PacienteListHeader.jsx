// Header y botones principales
export default function PacienteListHeader({ onAgregar, totalRows }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
      <h1 className="text-2xl font-bold text-purple-800 flex items-center gap-2">
        <svg className="w-7 h-7 text-purple-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
        Pacientes
      </h1>
      <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
        <button
          onClick={onAgregar}
          className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-lg shadow-lg transition-colors flex items-center justify-center gap-2 text-base sm:text-lg"
          style={{ minWidth: '180px' }}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Agregar Paciente
        </button>
        <span className="text-gray-600 text-sm sm:ml-2">Total: {totalRows}</span>
      </div>
    </div>
  );
}
