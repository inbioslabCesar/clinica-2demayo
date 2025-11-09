import React from "react";
import CajaAdminDashboard from "../components/caja/CajaAdminDashboard";

export default function ContabilidadPage() {
  return (
    <div className="min-h-screen bg-blue-50 p-8">
      <h1 className="text-3xl font-bold text-purple-800 mb-8">Módulo de Contabilidad</h1>
      <div className="max-w-6xl mx-auto">
        <CajaAdminDashboard />
      </div>
    </div>
  );
}