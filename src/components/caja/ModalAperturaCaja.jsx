import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function ModalAperturaCaja({
  open,
  onIrReporteCaja,
  mensaje = "¡Atención! No puedes realizar operaciones sin una caja activa.",
}) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open]);

  if (!open) return null;

  const irAReporte = () => {
    if (typeof onIrReporteCaja === "function") {
      onIrReporteCaja();
      return;
    }
    navigate("/contabilidad");
  };

  return (
    <div className="fixed inset-0 z-[1000] bg-black/55 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="modal-apertura-caja-title">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-amber-100 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-amber-50 to-orange-50">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-xl" aria-hidden="true">
              ⚠️
            </div>
            <div>
              <h2 id="modal-apertura-caja-title" className="text-lg font-bold text-slate-800">
                Bloqueo de Operaciones
              </h2>
              <p className="text-xs text-slate-500">Se requiere una caja activa para continuar.</p>
            </div>
          </div>
        </div>

        <div className="px-6 py-5">
          <p className="text-sm text-slate-700 leading-relaxed">{mensaje}</p>
        </div>

        <div className="px-6 pb-6">
          <button
            type="button"
            onClick={irAReporte}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 px-4 shadow-md transition-colors"
          >
            Ir a Reporte de Caja para Abrir
          </button>
        </div>
      </div>
    </div>
  );
}
