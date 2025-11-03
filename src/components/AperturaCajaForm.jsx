
import React, { useState } from "react";
import Swal from "sweetalert2";
import { BASE_URL } from "../config/config";

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
    <form className="bg-white p-6 rounded shadow max-w-md mx-auto" onSubmit={handleApertura}>
      <h3 className="text-lg font-bold mb-4 text-blue-800">Apertura de Caja</h3>
      <div className="mb-3">
        <label className="block text-sm font-semibold mb-1">Monto de apertura (S/)</label>
        <input
          type="number"
          min="0"
          step="0.01"
          value={montoApertura}
          onChange={e => setMontoApertura(parseFloat(e.target.value))}
          className="w-full border rounded px-2 py-1"
          required
        />
      </div>
      <div className="mb-3">
        <label className="block text-sm font-semibold mb-1">Turno</label>
        <select
          value={turno}
          onChange={e => setTurno(e.target.value)}
          className="w-full border rounded px-2 py-1"
          required
        >
          <option value="">Seleccione turno...</option>
          {TURNOS.map(t => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>
      <div className="mb-3">
        <label className="block text-sm font-semibold mb-1">Observaciones</label>
        <textarea
          value={observaciones}
          onChange={e => setObservaciones(e.target.value)}
          className="w-full border rounded px-2 py-1"
        />
      </div>
      <button
        type="submit"
        className="bg-blue-600 text-white px-4 py-2 rounded font-bold hover:bg-blue-700"
        disabled={loading}
      >{loading ? "Abriendo..." : "Abrir Caja"}</button>
    </form>
  );
}
