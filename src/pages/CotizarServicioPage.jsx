import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { BASE_URL } from "../config/config";

export default function CotizarServicioPage() {
  const { pacienteId, servicioTipo } = useParams();
  const [tarifas, setTarifas] = useState([]);
  const [seleccionados, setSeleccionados] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${BASE_URL}api_tarifas.php`, { credentials: "include" })
      .then(res => res.json())
      .then(data => {
        setTarifas((data.tarifas || []).filter(t => t.servicio_tipo === servicioTipo && t.activo === 1));
        setLoading(false);
      });
  }, [servicioTipo]);

  const toggleSeleccion = (id) => {
    setSeleccionados(sel =>
      sel.includes(id) ? sel.filter(eid => eid !== id) : [...sel, id]
    );
  };

  const calcularTotal = () => {
    return seleccionados.reduce((total, id) => {
      const tarifa = tarifas.find(t => t.id === id);
      return total + (tarifa ? parseFloat(tarifa.precio_particular) : 0);
    }, 0);
  };

  if (loading) return <div>Cargando tarifas...</div>;

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded shadow mt-8">
      <h2 className="text-2xl font-bold mb-4 text-center">Cotización de {servicioTipo.charAt(0).toUpperCase() + servicioTipo.slice(1)}</h2>
      <div className="mb-4 text-center text-gray-600">
        <b>ID Paciente:</b> {pacienteId}
      </div>
      <div className="mb-4">
        <h4 className="font-semibold mb-2">Selecciona los ítems:</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {tarifas.map(tarifa => (
            <label key={tarifa.id} className="flex items-center gap-2 bg-blue-50 p-2 rounded cursor-pointer">
              <input
                type="checkbox"
                checked={seleccionados.includes(tarifa.id)}
                onChange={() => toggleSeleccion(tarifa.id)}
              />
              <span>{tarifa.descripcion}</span>
              <span className="ml-auto font-bold text-green-700">S/ {tarifa.precio_particular}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="mt-4 text-lg font-bold text-right">
        Total Cotización: <span className="text-green-600">S/ {calcularTotal().toFixed(2)}</span>
      </div>
      <div className="mt-6 text-center">
        <button className="bg-blue-600 text-white px-6 py-2 rounded font-bold hover:bg-blue-700">Generar Cotización</button>
      </div>
    </div>
  );
}
