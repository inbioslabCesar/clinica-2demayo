import React from "react";
import { useNavigate } from "react-router-dom";

export default function ContabilidadPage() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-blue-50 p-6">
      <h1 className="text-3xl font-bold text-purple-800 mb-6">Módulo de Contabilidad</h1>
      <p className="mb-8 text-gray-700 text-lg">Gestión de ingresos y egresos por área</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <button onClick={() => navigate("/contabilidad/ingresos")} className="bg-green-500 hover:bg-green-600 text-white rounded-xl p-8 shadow-lg text-2xl font-bold flex flex-col items-center gap-2">
          <span>💵</span>
          Ingresos
          <span className="text-base font-normal">Registro de ingresos por área y servicio</span>
        </button>
        <button className="bg-red-500 hover:bg-red-600 text-white rounded-xl p-8 shadow-lg text-2xl font-bold flex flex-col items-center gap-2">
          <span>💸</span>
          Egresos
          <span className="text-base font-normal">Registro de gastos y egresos operativos</span>
        </button>
        <button className="bg-blue-500 hover:bg-blue-600 text-white rounded-xl p-8 shadow-lg text-2xl font-bold flex flex-col items-center gap-2">
          <span>📊</span>
          Reportes Financieros
          <span className="text-base font-normal">Análisis y reportes contables</span>
        </button>
        <button className="bg-purple-500 hover:bg-purple-600 text-white rounded-xl p-8 shadow-lg text-2xl font-bold flex flex-col items-center gap-2">
          <span>📋</span>
          Balance General
          <span className="text-base font-normal">Estado financiero consolidado</span>
        </button>
      </div>
      <div className="bg-white rounded-xl shadow p-6 mt-8">
        <h2 className="text-xl font-bold text-purple-700 mb-4">¿Qué puedes hacer aquí?</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <h3 className="font-semibold text-green-700 mb-2">💵 Ingresos:</h3>
            <ul className="list-disc ml-6 text-gray-700">
              <li>Registro de consultas médicas</li>
              <li>Ingresos por laboratorio</li>
              <li>Ventas de farmacia</li>
              <li>Procedimientos médicos</li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold text-red-700 mb-2">💸 Egresos:</h3>
            <ul className="list-disc ml-6 text-gray-700">
              <li>Gastos operativos</li>
              <li>Compra de medicamentos</li>
              <li>Gastos administrativos</li>
              <li>Servicios y suministros</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
