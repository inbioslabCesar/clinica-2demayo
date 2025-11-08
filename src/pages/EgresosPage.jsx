import React from "react";
import { useState, useEffect } from "react";
import EgresosDiariosForm from "../components/EgresosDiariosForm";
import EgresosList from "../components/EgresosList";
import RegistrarEgresoPage from "./RegistrarEgresoPage";
import { useNavigate } from "react-router-dom";

export default function EgresosPage() {
  const navigate = useNavigate();

  return (
    <div className="w-full max-w-[1600px] mx-auto p-6">
      <h1 className="text-3xl font-bold mb-8 text-red-700">Egresos</h1>
      <div className="flex flex-col md:flex-row gap-4 mb-8">
        <button
          className="bg-green-600 text-white px-6 py-3 rounded shadow hover:bg-green-700 font-semibold text-lg"
          onClick={() => navigate("/contabilidad/liquidacion-honorarios")}
        >
          Liquidación de Honorarios Médicos
        </button>
        <button
          className="bg-blue-600 text-white px-6 py-3 rounded shadow hover:bg-blue-700 font-semibold text-lg"
          onClick={() => navigate("/contabilidad/registrar-egreso")}
        >
          Registrar Otro Egreso
        </button>
        <button
          className="bg-purple-600 text-white px-6 py-3 rounded shadow hover:bg-purple-700 font-semibold text-lg"
          onClick={() => navigate("/contabilidad/liquidacion-laboratorio-referencia")}
        >
          Liquidación Laboratorio de Referencia
        </button>
      </div>
    </div>
  );
}
