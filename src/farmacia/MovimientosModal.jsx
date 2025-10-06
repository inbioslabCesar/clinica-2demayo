
import { useEffect, useState } from "react";
import { BASE_URL } from "../config/config";
import axios from "axios";

export default function MovimientosModal({ medicamento, usuario, onClose }) {
  const [movimientos, setMovimientos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({ tipo: "entrada", cantidad: 1, observaciones: "", usuario_id: "" });
  const [enviando, setEnviando] = useState(false);
  const [medicos, setMedicos] = useState([]);
  useEffect(() => {
    axios.get(BASE_URL + "api_medicos.php")
      .then(res => setMedicos(res.data.medicos || []))
      .catch(() => setMedicos([]));
  }, []);

  const apiUrl = `${BASE_URL}api_movimientos_medicamento.php`;

  const fetchMovimientos = () => {
    setLoading(true);
    setError(null);
    let url = apiUrl + `?medicamento_id=${medicamento.id}`;
    fetch(url, { credentials: "include" })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok || data.error) {
          throw new Error(data.error || `Error HTTP: ${res.status}`);
        }
        return data;
      })
      .then(setMovimientos)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchMovimientos();
    // eslint-disable-next-line
  }, [medicamento.id]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: name === "cantidad" ? Number(value) : value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setEnviando(true);
    fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        medicamento_id: medicamento.id,
        tipo: form.tipo,
        cantidad: form.cantidad,
  usuario_id: usuario?.id ? Number(usuario.id) : 1, // fallback a 1 si no hay usuario
  medico_id: form.usuario_id ? Number(form.usuario_id) : null,
        observaciones: form.observaciones,
      }),
    })
      .then((res) => res.json())
      .then(() => {
        setForm({ tipo: "entrada", cantidad: 1, observaciones: "", usuario_id: "" });
        fetchMovimientos();
      })
      .finally(() => setEnviando(false));
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg max-w-2xl w-full p-6 relative">
        <button onClick={onClose} className="absolute top-2 right-2 text-gray-500 hover:text-black">✕</button>
        <h2 className="text-xl font-bold mb-2 text-center">Historial de Movimientos</h2>
        <div className="mb-4 text-center text-lg font-semibold text-purple-700">{medicamento.nombre} ({medicamento.codigo})</div>
        <form onSubmit={handleSubmit} className="flex flex-wrap gap-2 items-end mb-6">
          <select name="tipo" value={form.tipo} onChange={handleChange} className="border rounded px-2 py-1">
            <option value="entrada">Entrada</option>
            <option value="salida">Salida</option>
          </select>
          <input name="cantidad" type="number" min={1} value={form.cantidad} onChange={handleChange} className="border rounded px-2 py-1 w-24" required />
          <select name="usuario_id" value={form.usuario_id} onChange={handleChange} className="border rounded px-2 py-1 w-56" required>
            <option value="">Selecciona médico responsable</option>
            {medicos.map(m => (
              <option key={m.id} value={m.id}>{m.nombre} ({m.email})</option>
            ))}
          </select>
          <input name="observaciones" value={form.observaciones} onChange={handleChange} className="border rounded px-2 py-1 flex-1" placeholder="Observaciones" />
          <button type="submit" disabled={enviando} className="bg-blue-600 text-white px-4 py-2 rounded">Registrar</button>
        </form>
        {loading ? (
          <div className="text-center text-gray-500">Cargando movimientos...</div>
        ) : error ? (
          <div className="text-center text-red-500">{error}</div>
        ) : (
          <div className="overflow-x-auto max-h-72">
            <table className="min-w-full bg-white border border-gray-200 rounded-lg text-sm">
              <thead>
                <tr className="bg-purple-100">
                  <th className="py-1 px-2 border-b">Fecha</th>
                  <th className="py-1 px-2 border-b">Tipo</th>
                  <th className="py-1 px-2 border-b">Cantidad</th>
                  <th className="py-1 px-2 border-b">Usuario</th>
                  <th className="py-1 px-2 border-b">Médico responsable</th>
                  <th className="py-1 px-2 border-b">Observaciones</th>
                </tr>
              </thead>
              <tbody>
                {Array.isArray(movimientos) && movimientos.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-3 text-gray-400">Sin movimientos registrados</td>
                  </tr>
                ) : Array.isArray(movimientos) ? (
                  movimientos.map((mov) => (
                    <tr key={mov.id}>
                      <td className="py-1 px-2 border-b">{new Date(mov.fecha_hora).toLocaleString()}</td>
                      <td className="py-1 px-2 border-b">{mov.tipo_movimiento}</td>
                      <td className="py-1 px-2 border-b text-right">{mov.cantidad}</td>
                      <td className="py-1 px-2 border-b">{mov.usuario_nombre || mov.usuario_id || "-"}</td>
                      <td className="py-1 px-2 border-b">{mov.medico_nombre || "-"}</td>
                      <td className="py-1 px-2 border-b">{mov.observaciones}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="text-center py-3 text-red-500">Error al cargar movimientos o sesión/rol incorrecto</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
