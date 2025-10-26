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
          observaciones: egreso.observaciones
        })
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
    <div className="max-w-7xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-8 text-red-700">Egresos</h1>
      <div className="bg-white rounded-xl shadow-lg p-6 mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div>
          <p className="mb-4 text-gray-700 text-lg">Registro y gestión de egresos operativos, administrativos y pagos de honorarios médicos.</p>
          <button
            onClick={() => navigate("/contabilidad/pago-honorarios-medicos")}
            className="px-6 py-3 bg-gradient-to-r from-purple-500 to-purple-700 text-white rounded-lg font-semibold hover:from-purple-600 hover:to-purple-800 shadow-md"
          >
            Pago de Honorarios Médicos
          </button>
        </div>
      </div>
      {/* Card de egresos con formulario y tabla */}
      <div className="bg-white rounded-xl shadow-lg p-6 mb-8 flex flex-col md:flex-row gap-8">
        <div className="md:w-1/2">
          <h2 className="text-xl font-bold text-red-600 mb-4">Registrar Egreso Operativo</h2>
          <EgresosDiariosForm onAddEgreso={handleAddEgreso} />
        </div>
        <div className="md:w-1/2">
          <h2 className="text-xl font-bold text-gray-700 mb-4">Listado de Egresos del Día</h2>
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-gray-50 shadow-inner" style={{maxHeight: '400px'}}>
            {loading ? (
              <div className="text-center py-8 text-gray-500">Cargando egresos...</div>
            ) : (
              <>
                <EgresosDiariosList egresos={egresosDiarios} />
                {egresosDiarios.length > 0 && (
                  <div className="mt-4 text-right font-bold text-red-700">
                    Total egresos: S/ {egresosDiarios.reduce((acc, e) => acc + parseFloat(e.monto), 0).toFixed(2)}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
