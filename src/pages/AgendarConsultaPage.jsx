import { useLocation, useNavigate } from "react-router-dom";
import { AgendarConsulta } from "../components/paciente";

function AgendarConsultaPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const searchParams = new URLSearchParams(location.search);
  const pacienteId = location.state?.pacienteId || searchParams.get('paciente_id');
  const consultaId = location.state?.consultaId || searchParams.get('consulta_id');
  const cotizacionId = searchParams.get('cotizacion_id');
  const modo = searchParams.get('modo');
  const isEditIntent = Boolean(consultaId) || (modo === 'editar' && Boolean(cotizacionId));

  // Si no hay pacienteId ni consultaId, redirigir o mostrar mensaje
  if (!pacienteId && !consultaId && !cotizacionId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white p-6 rounded shadow text-center">
          <p className="text-lg font-bold text-red-600 mb-2">
            No se ha seleccionado un paciente.
          </p>
          <button
            onClick={() => navigate(-1)}
            className="bg-blue-500 text-white px-4 py-2 rounded"
          >
            Volver
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="w-full max-w-[1700px] mx-auto px-4 lg:px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-blue-800">
            {isEditIntent ? "Editar Consulta Médica" : "Agendar Consulta Médica"}
          </h1>
        </div>
        <AgendarConsulta
          pacienteId={pacienteId}
          consultaId={consultaId}
          cotizacionId={cotizacionId}
          isEditIntent={isEditIntent}
        />
      </div>
    </div>
  );
}

export default AgendarConsultaPage;
