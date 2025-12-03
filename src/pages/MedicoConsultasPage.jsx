
import MedicoConsultas from "../components/medico/MedicoConsultas";

function MedicoConsultasPage({ usuario }) {
  const medicoId = usuario?.id;
  if (!medicoId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 via-white to-red-100 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md mx-4 border border-red-100">
          <div className="text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-red-800 mb-2">Error de Acceso</h2>
            <p className="text-red-600 font-medium">No se encontró el médico logueado.</p>
            <p className="text-sm text-gray-500 mt-2">Por favor, inicia sesión nuevamente.</p>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      {/* Header con gradiente médico profesional */}
      <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 shadow-2xl">
        <div className="container mx-auto px-6 py-8">
          <div className="text-center">
            <div className="inline-flex items-center gap-3 bg-white/10 rounded-full px-6 py-3 backdrop-blur-sm border border-white/20 mb-4">
              <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3a2 2 0 012-2h4a2 2 0 012 2v4m-6 9l6-6m-6 0l6 6" />
                </svg>
              </div>
              <div className="text-left">
                <h1 className="text-2xl font-bold text-white">Panel Médico</h1>
                <p className="text-blue-100 text-sm">Dr(a). {usuario?.nombre} {usuario?.apellido || ''}</p>
              </div>
            </div>
            <h2 className="text-3xl font-bold text-white mb-2">📋 Mis Consultas Programadas</h2>
            <p className="text-blue-100 max-w-2xl mx-auto">
              Gestiona tus citas médicas, revisa el historial de pacientes y mantén un seguimiento completo de tus consultas
            </p>
          </div>
        </div>
      </div>

      {/* Contenido principal */}
      <div className="container mx-auto px-6 py-8">
        <MedicoConsultas medicoId={medicoId} />
      </div>
    </div>
  );
}

export default MedicoConsultasPage;
