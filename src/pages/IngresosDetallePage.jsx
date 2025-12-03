import React, { useEffect, useState } from "react";
import { BASE_URL } from "../config/config";
import { FaArrowLeft, FaSearch } from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import Spinner from "../components/comunes/Spinner";

export default function IngresosDetallePage() {
  const [loading, setLoading] = useState(true);
  const [ingresos, setIngresos] = useState([]);
  const [filtro, setFiltro] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    cargarIngresos();
  }, []);

  const cargarIngresos = async () => {
    setLoading(true);
    try {
      const res = await fetch(BASE_URL + "api_detalle_ingresos_hoy.php", { credentials: "include" });
      const data = await res.json();
      if (data.success) {
        setIngresos(data.detalle || []);
      }
    } catch {
      // Eliminado log de error cargando ingresos
    } finally {
      setLoading(false);
    }
  };

  const ingresosFiltrados = ingresos.filter(i =>
    i.descripcion.toLowerCase().includes(filtro.toLowerCase()) ||
    i.area.toLowerCase().includes(filtro.toLowerCase()) ||
    i.tipo_ingreso.toLowerCase().includes(filtro.toLowerCase()) ||
    (i.paciente_nombre && i.paciente_nombre.toLowerCase().includes(filtro.toLowerCase()))
  );

  return (
    <div className="min-h-screen bg-blue-50 p-6">
      <button onClick={() => navigate('/contabilidad/ingresos')} className="mb-6 bg-gradient-to-r from-gray-200 to-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:from-gray-300 hover:to-gray-400 flex items-center gap-2 font-semibold transition-all">
        <FaArrowLeft /> Volver a Ingresos
      </button>
      <h1 className="text-2xl font-bold text-purple-800 mb-6">Detalle Completo de Ingresos</h1>
      <div className="mb-6 flex items-center gap-3">
        <FaSearch className="text-gray-500" />
        <input
          type="text"
          value={filtro}
          onChange={e => setFiltro(e.target.value)}
          placeholder="Buscar por descripción, área, tipo o paciente..."
          className="w-full max-w-md px-4 py-2 border rounded-lg"
        />
      </div>
      {loading ? (
        <Spinner />
      ) : (
        <div className="bg-white rounded-xl shadow-lg p-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-blue-100 text-blue-800">
                <th className="py-2 px-2 text-left">Hora</th>
                <th className="py-2 px-2 text-left">Tipo</th>
                <th className="py-2 px-2 text-left">Área</th>
                <th className="py-2 px-2 text-left">Descripción</th>
                <th className="py-2 px-2 text-left">Paciente</th>
                <th className="py-2 px-2 text-right">Monto</th>
                <th className="py-2 px-2 text-left">Método</th>
                <th className="py-2 px-2 text-left">Referencia</th>
              </tr>
            </thead>
            <tbody>
              {ingresosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-gray-500">No hay ingresos registrados hoy</td>
                </tr>
              ) : (
                ingresosFiltrados.map((i, idx) => (
                  <tr key={idx} className="border-b hover:bg-blue-50">
                    <td className="py-2 px-2">{i.hora}</td>
                    <td className="py-2 px-2">{i.tipo_ingreso}</td>
                    <td className="py-2 px-2">{i.area}</td>
                    <td className="py-2 px-2">{i.descripcion}</td>
                    <td className="py-2 px-2">{i.paciente_nombre || '-'}</td>
                    <td className="py-2 px-2 text-right font-bold text-green-700">S/ {parseFloat(i.monto).toFixed(2)}</td>
                    <td className="py-2 px-2">{i.metodo_pago}</td>
                    <td className="py-2 px-2">{i.referencia || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
