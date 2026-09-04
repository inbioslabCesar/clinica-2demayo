import React from "react";
import CajaAdminDashboard from "../components/caja/CajaAdminDashboard";
import QuickAccessNav from "../components/comunes/QuickAccessNav";

export default function ContabilidadPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-cyan-100 px-3 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
      <div className="mx-auto w-full max-w-7xl">
        <div className="mb-5 rounded-3xl border border-cyan-100 bg-white/90 p-4 shadow-xl backdrop-blur sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">Panel financiero</p>
              <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">Módulo de Contabilidad</h1>
              <p className="mt-1 text-sm text-slate-600">Monitoreo operativo y control real de cierres de caja en una sola vista.</p>
            </div>
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-xs font-semibold text-cyan-800">
              Actualización automática cada 10 segundos
            </div>
          </div>

          <QuickAccessNav
            keys={["pacientes", "recordatorios", "listaConsultas", "cotizaciones"]}
            className="mt-4"
            variant="modern"
          />
        </div>

        <div className="max-w-7xl mx-auto">
        <CajaAdminDashboard />
        </div>
      </div>
    </div>
  );
}