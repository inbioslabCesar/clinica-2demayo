
import React, { useState } from "react";
import Swal from "sweetalert2";
import { BASE_URL } from "../../config/config";

const TURNOS = [
  { value: "manana", label: "Mañana" },
  { value: "tarde", label: "Tarde" },
  { value: "noche", label: "Noche" }
];

export default function AperturaCajaForm({ usuario, onApertura }) {
  const [montoApertura, setMontoApertura] = useState(0);
  const [observaciones, setObservaciones] = useState("");
  const [turno, setTurno] = useState("");
  const [loading, setLoading] = useState(false);

  const handleApertura = async (e) => {
    e.preventDefault();
    if (montoApertura < 0) {
      Swal.fire("Error", "El monto de apertura debe ser mayor o igual a 0", "error");
      return;
    }
    if (!turno) {
      Swal.fire("Error", "Debe seleccionar el turno", "error");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(BASE_URL + "api_caja_abrir.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          monto_apertura: montoApertura,
          observaciones,
          turno,
          usuario_id: usuario.id,
          usuario_rol: usuario.rol
        })
      });
      const data = await res.json();
      if (data.success) {
        Swal.fire("Caja abierta", "La caja se abrió correctamente.", "success");
        if (onApertura) onApertura();
      } else {
        Swal.fire("Error", data.error || "No se pudo abrir la caja", "error");
      }
    } catch (err) {
      Swal.fire("Error", "Error de conexión", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="bg-white p-4 sm:p-6 rounded-2xl shadow-xl max-w-md mx-auto w-full flex flex-col gap-4" onSubmit={handleApertura}>
      <h3 className="text-xl sm:text-2xl font-extrabold mb-2 text-blue-700 text-center tracking-tight">Apertura de Caja</h3>
      <div className="flex flex-col gap-1">
        <label className="block text-sm font-semibold text-gray-700">Monto de apertura (S/)</label>
        <input
          type="number"
          min="0"
          step="0.01"
          value={montoApertura}
          onChange={e => setMontoApertura(parseFloat(e.target.value))}
          className="w-full border-2 border-blue-200 focus:border-blue-500 rounded-lg px-3 py-2 text-lg bg-blue-50 focus:bg-white transition-all duration-150 outline-none"
          required
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="block text-sm font-semibold text-gray-700">Turno</label>
        <select
          value={turno}
          onChange={e => setTurno(e.target.value)}
          className="w-full border-2 border-blue-200 focus:border-blue-500 rounded-lg px-3 py-2 bg-blue-50 focus:bg-white text-lg transition-all duration-150 outline-none"
          required
        >
          <option value="">Seleccione turno...</option>
          {TURNOS.map(t => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="block text-sm font-semibold text-gray-700">Observaciones</label>
        <textarea
          value={observaciones}
          onChange={e => setObservaciones(e.target.value)}
          className="w-full border-2 border-blue-200 focus:border-blue-500 rounded-lg px-3 py-2 bg-blue-50 focus:bg-white text-base transition-all duration-150 outline-none resize-none min-h-[60px]"
        />
      </div>
      <button
        type="submit"
        className={`w-full py-2 px-4 rounded-xl font-bold text-white bg-gradient-to-r from-blue-500 via-blue-600 to-blue-700 shadow-lg transition-all duration-200 hover:scale-105 hover:from-blue-600 hover:to-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-400 ${loading ? 'opacity-60 cursor-not-allowed' : ''}`}
        disabled={loading}
      >{loading ? "Abriendo..." : "Abrir Caja"}</button>
    </form>
  );
}
