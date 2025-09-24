import React, { useEffect, useState } from "react";
import { BASE_URL } from "../config/config";

function PacienteConsumosPage({ pacienteId }) {
  const [consumos, setConsumos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [area, setArea] = useState("");

  useEffect(() => {
    if (!pacienteId) return;
    setLoading(true);
    let url = `${BASE_URL}api_consumos_paciente.php?id=${pacienteId}`;
    if (fechaInicio) url += `&fecha_inicio=${fechaInicio}`;
    if (fechaFin) url += `&fecha_fin=${fechaFin}`;
    if (area) url += `&area=${encodeURIComponent(area)}`;
    fetch(url, { credentials: "include" })
      .then(res => res.json())
      .then(data => {
        setConsumos(Array.isArray(data) ? data : []);
        setError(!Array.isArray(data) && data.error ? data.error : "");
        setLoading(false);
      })
      .catch(() => {
        setError("Error de conexión con el servidor");
        setLoading(false);
      });
  }, [pacienteId, fechaInicio, fechaFin, area]);

  return (
    <div className="p-4 bg-white rounded shadow mt-4">
      <h2 className="text-lg font-bold mb-2">Historial de Consumos</h2>
      <div className="flex flex-wrap gap-2 mb-2">
        <label>Desde: <input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} className="border rounded px-2 py-1" /></label>
        <label>Hasta: <input type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)} className="border rounded px-2 py-1" /></label>
        <select value={area} onChange={e => setArea(e.target.value)} className="border rounded px-2 py-1">
          <option value="">Todas las áreas</option>
          <option value="Consulta">Consulta</option>
          <option value="Laboratorio">Laboratorio</option>
          <option value="Farmacia">Farmacia</option>
        </select>
        {(fechaInicio || fechaFin || area) && (
          <button onClick={() => { setFechaInicio(""); setFechaFin(""); setArea(""); }} className="text-blue-600 underline ml-2">Limpiar filtros</button>
        )}
      </div>
      {loading ? (
        <div>Cargando...</div>
      ) : error ? (
        <div className="text-red-600">{error}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs md:text-sm border">
            <thead>
              <tr className="bg-blue-100">
                <th className="px-2 py-1 border">Fecha</th>
                <th className="px-2 py-1 border">Área</th>
                <th className="px-2 py-1 border">Detalle</th>
                <th className="px-2 py-1 border">Monto</th>
              </tr>
            </thead>
            <tbody>
              {consumos.length === 0 ? (
                <tr><td colSpan={4} className="text-center py-2">Sin consumos registrados</td></tr>
              ) : (
                consumos.map((c, i) => (
                  <tr key={i}>
                    <td className="border px-2 py-1">{c.fecha}</td>
                    <td className="border px-2 py-1">{c.area}</td>
                    <td className="border px-2 py-1">{c.detalle}</td>
                    <td className="border px-2 py-1">S/ {c.monto}</td>
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

export default PacienteConsumosPage;
