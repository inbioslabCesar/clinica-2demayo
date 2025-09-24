import React from "react";
import { useParams, Link } from "react-router-dom";
import SolicitudLaboratorio from "../components/SolicitudLaboratorio";

export default function SolicitudLaboratorioPage() {
  const { consultaId } = useParams();
  return (
    <div className="max-w-xl mx-auto p-6 bg-white rounded shadow mt-8">
      <h2 className="text-2xl font-bold mb-4 text-center">Solicitud de Análisis de Laboratorio</h2>
      <div className="mb-4 text-center text-gray-600">
        <b>Consulta ID:</b> {consultaId}
      </div>
      <SolicitudLaboratorio consultaId={consultaId} />
      <div className="text-center">
        <Link to={-1} className="text-blue-600 hover:underline">&larr; Volver a la historia clínica</Link>
      </div>
    </div>
  );
}
