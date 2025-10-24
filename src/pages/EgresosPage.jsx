import React from "react";
import { useNavigate } from "react-router-dom";

export default function EgresosPage() {
  const navigate = useNavigate();
  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6 text-red-700">Egresos</h1>
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <p className="mb-4 text-gray-700">Registro y gestión de egresos operativos, administrativos y pagos de honorarios médicos.</p>
        <button
          onClick={() => navigate("/contabilidad/pago-honorarios-medicos")}
          className="px-6 py-3 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700"
        >
          Pago de Honorarios Médicos
        </button>
      </div>
      {/* Aquí puedes agregar la tabla/listado de egresos */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="text-gray-500 text-center py-8">Próximamente: listado y registro de egresos operativos</div>
      </div>
    </div>
  );
}
