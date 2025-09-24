import React from "react";
import { Link } from "react-router-dom";

export default function ReportesPage() {
  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6 text-center">Reportes</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link to="/lista-consultas" className="bg-blue-600 text-white rounded-lg p-6 text-center font-semibold shadow hover:bg-blue-700 transition-all">
          Lista de Consultas
        </Link>
        <Link to="/reporte-pacientes" className="bg-green-600 text-white rounded-lg p-6 text-center font-semibold shadow hover:bg-green-700 transition-all">
          Reporte de Pacientes
        </Link>
        <Link to="/reporte-finanzas" className="bg-purple-600 text-white rounded-lg p-6 text-center font-semibold shadow hover:bg-purple-700 transition-all">
          Reporte de Finanzas
        </Link>
      </div>
    </div>
  );
}
