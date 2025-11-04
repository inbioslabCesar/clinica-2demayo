import React from "react";
import { useState, useEffect } from "react";
import EgresosDiariosForm from "../components/EgresosDiariosForm";
import EgresosDiariosList from "../components/EgresosDiariosList";
import { useNavigate } from "react-router-dom";

export default function EgresosPage() {
  const navigate = useNavigate();
  const [egresosDiarios, setEgresosDiarios] = useState([]);
  const [loading, setLoading] = useState(false);

  // Cargar egresos desde backend
  useEffect(() => {
    const fetchEgresos = async () => {
      setLoading(true);
      try {
        const resp = await fetch("/api_egresos.php");
        const data = await resp.json();
        if (data.success) setEgresosDiarios(data.egresos || []);
      } catch (e) {
        setEgresosDiarios([]);
      } finally {
        setLoading(false);
      }
    };
    fetchEgresos();
  }, []);

  // Registrar egreso en backend
  const handleAddEgreso = async (egreso) => {
    setLoading(true);
    try {
      const resp = await fetch("/api_egresos.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: egreso.tipo,
          categoria: egreso.categoria,
          concepto: egreso.concepto,
          monto: egreso.monto,
          observaciones: egreso.observaciones,
        }),
      });
      const data = await resp.json();
      if (data.success) {
        // Recargar egresos
        const resp2 = await fetch("/api_egresos.php");
        const data2 = await resp2.json();
        if (data2.success) setEgresosDiarios(data2.egresos || []);
      }
    } catch (e) {
      console.error("Error registrando egreso:", e);
    }
    setLoading(false);
  };
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
      </div>
    </div>
  );
}
