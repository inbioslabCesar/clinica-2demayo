import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function CerrarCajaView() {
  const [resumen, setResumen] = useState(null);
  const [montoContado, setMontoContado] = useState("");
  const [diferencia, setDiferencia] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    // Obtener resumen de caja actual
    async function fetchResumen() {
      setLoading(true);
      try {
        const resp = await fetch("/api_resumen_diario.php", { credentials: "include" });
        const data = await resp.json();
        if (data.success) {
          setResumen(data);
          setError("");
        } else {
          setError(data.error || "Error al cargar resumen");
        }
      } catch (e) {
        setError("Error de conexión");
      } finally {
        setLoading(false);
      }
    }
    fetchResumen();
  }, []);

  useEffect(() => {
    if (resumen) {
      const efectivo = resumen.por_pago?.find(p => (p.metodo_pago || p.tipo_pago)?.toLowerCase() === "efectivo");
      const esperado = efectivo ? parseFloat(efectivo.total_pago) : 0;
      setDiferencia(parseFloat(montoContado || 0) - esperado);
    }
  }, [montoContado, resumen]);

  const handleCerrarCaja = async () => {
    try {
      const resp = await fetch("/api_cerrar_caja.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ monto_contado: montoContado })
      });
      const data = await resp.json();
      if (data.success) {
        alert("Caja cerrada correctamente. Diferencia: S/ " + data.diferencia.toFixed(2));
        navigate("/contabilidad");
      } else {
        alert("Error: " + (data.error || "No se pudo cerrar la caja"));
      }
    } catch (e) {
      alert("Error de conexión al cerrar caja");
    }
  };

  if (loading) return <div className="p-8 text-center">Cargando resumen...</div>;
  if (error) return <div className="p-8 text-center text-red-600">{error}</div>;
  if (!resumen) return null;

  const efectivo = resumen.por_pago?.find(p => (p.metodo_pago || p.tipo_pago)?.toLowerCase() === "efectivo");
  const esperado = efectivo ? parseFloat(efectivo.total_pago) : 0;

  return (
    <div className="max-w-xl mx-auto p-8 bg-white rounded-xl shadow-lg">
      <h2 className="text-2xl font-bold mb-4 text-red-700">Cierre de Caja</h2>
      <div className="mb-4">
        <span className="font-semibold">Fecha:</span> {resumen.fecha}
      </div>
      <div className="mb-4">
        <span className="font-semibold">Monto de apertura:</span> S/ {resumen.monto_apertura?.toFixed(2)}
      </div>
      <div className="mb-4">
        <span className="font-semibold">Efectivo esperado:</span> S/ {esperado.toFixed(2)}
      </div>
      <div className="mb-4">
        <label className="font-semibold">Monto contado en caja física:</label>
        <input
          type="number"
          value={montoContado}
          onChange={e => setMontoContado(e.target.value)}
          className="border rounded px-2 py-1 ml-2"
        />
      </div>
      <div className="mb-4">
        <span className="font-semibold">Diferencia:</span> S/ {diferencia.toFixed(2)}
      </div>
      <button
        className="bg-red-600 text-white px-6 py-2 rounded shadow"
        onClick={handleCerrarCaja}
      >
        Confirmar cierre de caja
      </button>
    </div>
  );
}
