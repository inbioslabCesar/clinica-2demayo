import React, { useEffect, useState } from "react";
import Swal from "sweetalert2";

export default function PagoHonorariosMedicosPage() {
  const [honorarios, setHonorarios] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [metodoPago, setMetodoPago] = useState("efectivo");
  const [observaciones, setObservaciones] = useState("");

  useEffect(() => {
    fetchHonorarios();
  }, []);

  const fetchHonorarios = async () => {
    setLoading(true);
    try {
      const resp = await fetch("/api_movimientos_honorarios.php?estado_pago=pendiente");
      const data = await resp.json();
      if (data.success) {
        setHonorarios(data.movimientos || []);
      } else {
        Swal.fire("Error", data.error || "No se pudo cargar honorarios", "error");
      }
  } catch {
      Swal.fire("Error", "No se pudo cargar honorarios", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handlePagar = async () => {
    if (selectedIds.length === 0) {
      Swal.fire("Selecciona al menos un honorario", "", "warning");
      return;
    }
    const result = await Swal.fire({
      title: "¿Confirmar pago de honorarios?",
      text: `Se marcarán como pagados ${selectedIds.length} honorarios.`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Sí, registrar pago",
      cancelButtonText: "Cancelar",
    });
    if (!result.isConfirmed) return;
    try {
      setLoading(true);
      const resp = await fetch("/api_pagar_honorario_medico.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds, metodo_pago: metodoPago, observaciones }),
      });
      const data = await resp.json();
      if (data.success) {
        Swal.fire("Pago registrado", "Honorarios marcados como pagados", "success");
        setSelectedIds([]);
        fetchHonorarios();
      } else {
        Swal.fire("Error", data.error || "No se pudo registrar el pago", "error");
      }
  } catch {
      Swal.fire("Error", "No se pudo registrar el pago", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6 text-purple-800">Pago de Honorarios Médicos</h1>
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <label className="font-semibold">Método de Pago:</label>
        <select
          value={metodoPago}
          onChange={(e) => setMetodoPago(e.target.value)}
          className="border rounded px-3 py-2 ml-2"
        >
          <option value="efectivo">Efectivo</option>
          <option value="transferencia">Transferencia</option>
          <option value="cheque">Cheque</option>
          <option value="deposito">Depósito</option>
        </select>
        <textarea
          value={observaciones}
          onChange={(e) => setObservaciones(e.target.value)}
          className="w-full mt-3 border rounded px-3 py-2"
          rows={2}
          placeholder="Observaciones (opcional)"
        />
      </div>
      <div className="bg-white rounded-lg shadow p-4">
        {loading ? (
          <div className="text-center py-8">Cargando honorarios...</div>
        ) : honorarios.length === 0 ? (
          <div className="text-center py-8 text-gray-500">No hay honorarios pendientes</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50">
                <th></th>
                <th>Médico</th>
                <th>Servicio</th>
                <th>Especialidad</th>
                <th>Monto</th>
                <th>Fecha</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {honorarios.map((h) => (
                <tr key={h.id} className="border-b">
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(h.id)}
                      onChange={() => handleSelect(h.id)}
                    />
                  </td>
                  <td>{h.medico_nombre || h.medico_id}</td>
                  <td>{h.tipo_servicio}</td>
                  <td>{h.especialidad}</td>
                  <td className="font-bold text-green-700">S/ {parseFloat(h.monto_medico).toFixed(2)}</td>
                  <td>{h.fecha}</td>
                  <td>
                    <span className="px-2 py-1 rounded text-xs bg-yellow-100 text-yellow-800">
                      {h.estado_pago_medico}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <button
        onClick={handlePagar}
        disabled={selectedIds.length === 0 || loading}
        className="mt-6 px-6 py-3 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700 disabled:opacity-50"
      >
        Registrar Pago
      </button>
    </div>
  );
}
