import React, { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import { authFetch } from "../../utils/apiClient";

export default function ModalCorregirApertura({ open, cajaActual, usuario, onClose, onUpdated }) {
  const [nuevoMonto, setNuevoMonto] = useState("");
  const [motivo, setMotivo] = useState("");
  const [loading, setLoading] = useState(false);

  const handleMontoChange = (value) => {
    const raw = String(value || "").replace(',', '.');
    if (raw === "") {
      setNuevoMonto("");
      return;
    }

    // Permite escribir directo: enteros o decimales con hasta 2 dígitos.
    if (!/^\d+(\.\d{0,2})?$/.test(raw)) {
      return;
    }
    setNuevoMonto(raw);
  };

  const montoActual = useMemo(() => {
    const raw = Number(cajaActual?.monto_apertura ?? 0);
    return Number.isFinite(raw) ? raw : 0;
  }, [cajaActual]);

  useEffect(() => {
    if (!open) return;
    setNuevoMonto(String(montoActual.toFixed(2)));
    setMotivo("");
  }, [open, montoActual]);

  if (!open) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const parsed = Number(nuevoMonto);
    if (!Number.isFinite(parsed) || parsed < 0) {
      Swal.fire("Dato invalido", "Ingresa un monto valido mayor o igual a 0.", "warning");
      return;
    }

    setLoading(true);
    try {
      const res = await authFetch("api_caja_corregir_apertura.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caja_id: Number(cajaActual?.id || 0),
          nuevo_monto_apertura: parsed,
          motivo: motivo.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        Swal.fire("No se pudo corregir", data?.error || "Error al corregir monto de apertura", "error");
        return;
      }

      Swal.fire("Apertura corregida", `Se actualizo de S/ ${Number(data.monto_anterior || 0).toFixed(2)} a S/ ${Number(data.monto_nuevo || 0).toFixed(2)}.`, "success");
      if (typeof onUpdated === "function") onUpdated();
      if (typeof onClose === "function") onClose();
    } catch (err) {
      Swal.fire("Error", "No fue posible conectar con el servidor.", "error");
    } finally {
      setLoading(false);
    }
  };

  const rol = String(usuario?.rol || "").toLowerCase();

  return (
    <div className="fixed inset-0 z-[1000] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="corregir-apertura-title">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-amber-100 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-amber-50 to-orange-50">
          <h2 id="corregir-apertura-title" className="text-lg font-bold text-slate-800">Corregir Monto de Apertura</h2>
          <p className="text-xs text-slate-500 mt-1">La correccion queda auditada con usuario, motivo y timestamp.</p>
        </div>

        <form className="px-6 py-5 space-y-4" onSubmit={handleSubmit}>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            <p><strong>Caja:</strong> #{Number(cajaActual?.id || 0)}</p>
            <p><strong>Monto actual:</strong> S/ {montoActual.toFixed(2)}</p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Nuevo monto de apertura</label>
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={nuevoMonto}
              onChange={(e) => handleMontoChange(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 focus:ring-2 focus:ring-amber-300 focus:border-amber-400 outline-none"
              placeholder="0.00"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Motivo de correccion</label>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 min-h-[90px] focus:ring-2 focus:ring-amber-300 focus:border-amber-400 outline-none"
              placeholder="Ejemplo: error de digitacion al abrir caja"
            />
            <p className="text-xs text-slate-500 mt-1">
              {rol === "administrador"
                ? "Si la caja ya tiene movimientos, el motivo es obligatorio y debe ser detallado."
                : "Si la caja tiene movimientos, la correccion solo puede hacerla un administrador."}
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 rounded-xl border border-slate-300 px-4 py-2 text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-xl bg-amber-600 text-white font-semibold px-4 py-2 hover:bg-amber-700 disabled:opacity-60"
            >
              {loading ? "Guardando..." : "Guardar correccion"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
