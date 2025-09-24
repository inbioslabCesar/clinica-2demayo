
import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import AgendarConsulta from "../components/AgendarConsulta";

function AgendarConsultaPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const pacienteId = location.state?.pacienteId;

  // Si no hay pacienteId, redirigir o mostrar mensaje
  if (!pacienteId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white p-6 rounded shadow text-center">
          <p className="text-lg font-bold text-red-600 mb-2">No se ha seleccionado un paciente.</p>
          <button onClick={() => navigate(-1)} className="bg-blue-500 text-white px-4 py-2 rounded">Volver</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <h1 className="text-2xl font-bold text-center mt-6 mb-4">Agendar Consulta Médica</h1>
      <AgendarConsulta pacienteId={pacienteId} />
    </div>
  );
}

export default AgendarConsultaPage;
