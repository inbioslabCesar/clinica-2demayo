import React from "react";
// ...existing code...
import { useNavigate } from "react-router-dom";

export default function EgresosPage() {
  const navigate = useNavigate();

  return (
    <div className="w-full max-w-[1600px] mx-auto p-6">
      <h1 className="text-3xl font-bold mb-8 text-red-700 text-center">Egresos</h1>
      <div className="flex flex-col md:flex-row justify-center items-center gap-8 mb-8">
        <div className="bg-white rounded-2xl shadow-lg border border-green-200 flex flex-col items-center justify-center px-10 py-8 min-w-[260px] cursor-pointer hover:scale-105 transition" onClick={() => navigate("/contabilidad/liquidacion-honorarios") }>
          <div className="mb-2">
            <svg width="64" height="64" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#22c55e"/><text x="12" y="32" textAnchor="middle" fontSize="28" fill="#fff">💵</text></svg>
          </div>
          <div className="text-green-700 font-bold text-lg text-center">Liquidación de Honorarios Médicos</div>
        </div>
        <div className="bg-white rounded-2xl shadow-lg border border-blue-200 flex flex-col items-center justify-center px-10 py-8 min-w-[260px] cursor-pointer hover:scale-105 transition" onClick={() => navigate("/contabilidad/registrar-egreso") }>
          <div className="mb-2">
            <svg width="64" height="64" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#3b82f6"/><text x="12" y="32" textAnchor="middle" fontSize="28" fill="#fff">📝</text></svg>
          </div>
          <div className="text-blue-700 font-bold text-lg text-center">Registrar Otro Egreso</div>
        </div>
        <div className="bg-white rounded-2xl shadow-lg border border-purple-200 flex flex-col items-center justify-center px-10 py-8 min-w-[260px] cursor-pointer hover:scale-105 transition" onClick={() => navigate("/contabilidad/liquidacion-laboratorio-referencia") }>
          <div className="mb-2">
            <svg width="64" height="64" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#a855f7"/><text x="12" y="32" textAnchor="middle" fontSize="28" fill="#fff">🧪</text></svg>
          </div>
          <div className="text-purple-700 font-bold text-lg text-center">Liquidación Laboratorio de Referencia</div>
        </div>
      </div>
    </div>
  );
}
