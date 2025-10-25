import React, { useEffect, useState } from "react";
import Swal from "sweetalert2";
import { BASE_URL } from "../config/config";

export default function PagoHonorariosMedicosPage() {
  // Función para cancelar honorario médico
  const handleCancelarHonorario = async (idMovimiento) => {
    if (!window.confirm('¿Está seguro que desea cancelar este honorario?')) return;
    try {
      const response = await fetch(`${BASE_URL}api_cancelar_honorario_medico.php`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: idMovimiento }),
      });
      const data = await response.json();
      if (data.success) {
        Swal.fire('Honorario cancelado correctamente', '', 'success');
        fetchHonorarios();
      } else {
        Swal.fire('No se pudo cancelar el honorario', '', 'error');
      }
    } catch (error) {
      Swal.fire('Error al cancelar el honorario', '', 'error');
    }
  };
  const [honorarios, setHonorarios] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [metodoPago, setMetodoPago] = useState("efectivo");
  const [observaciones, setObservaciones] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState("pendiente");

  useEffect(() => {
    fetchHonorarios();
  }, [estadoFiltro]);

  const fetchHonorarios = async () => {
    setLoading(true);
    try {
      const resp = await fetch(`${BASE_URL}api_movimientos_honorarios.php?estado_pago=${estadoFiltro}`, { credentials: 'include' });
      const data = await resp.json();
      if (data.success) {
        setHonorarios(data.movimientos || []);
      } else {
        setHonorarios([]);
        Swal.fire("Error", data.error || "No se pudo cargar honorarios", "error");
      }
    } catch {
      setHonorarios([]);
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
  const resp = await fetch(`${BASE_URL}api_pagar_honorario_medico.php`, {
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
      <div className="bg-white rounded-lg shadow p-4 mb-4 flex items-center">
        <label className="font-semibold mr-2">Filtrar por estado:</label>
        <select
          value={estadoFiltro}
          onChange={e => setEstadoFiltro(e.target.value)}
          className="border rounded px-3 py-2"
        >
          <option value="pendiente">Pendiente</option>
          <option value="pagado">Pagado</option>
          <option value="cancelado">Cancelado</option>
        </select>
      </div>
      <div className="bg-white rounded-lg shadow p-4">
        {loading ? (
          <div className="text-center py-8">Cargando honorarios...</div>
        ) : honorarios.length === 0 ? (
          <div className="text-center py-8 text-gray-500">No hay honorarios para este estado</div>
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
          <th>Acciones</th>
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
                      disabled={h.estado_pago_medico !== 'pendiente'}
                    />
                  </td>
                  <td>{h.medico_nombre || h.medico_id}</td>
                  <td>{h.tipo_servicio}</td>
                  <td>{h.especialidad}</td>
                  <td className="font-bold text-green-700">S/ {parseFloat(h.monto_medico).toFixed(2)}</td>
                  <td>{h.fecha}</td>
                  <td>
                    <span className={
                      h.estado_pago_medico === 'pendiente'
                        ? 'bg-yellow-100 text-yellow-800 px-2 py-1 rounded'
                        : h.estado_pago_medico === 'pagado'
                        ? 'bg-green-100 text-green-800 px-2 py-1 rounded'
                        : h.estado_pago_medico === 'cancelado'
                        ? 'bg-red-100 text-red-800 px-2 py-1 rounded'
                        : 'bg-gray-100 text-gray-800 px-2 py-1 rounded'
                    }>
                      {h.estado_pago_medico}
                    </span>
                  </td>
                  <td>
                    {h.estado_pago_medico === 'pendiente' && (
                      <button
                        className="bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded text-sm"
                        onClick={() => handleCancelarHonorario(h.id)}
                      >
                        Cancelar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <button
        onClick={handlePagar}
        disabled={selectedIds.length === 0 || loading || estadoFiltro !== "pendiente"}
        className="mt-6 px-6 py-3 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700 disabled:opacity-50"
      >
        Registrar Pago
      </button>
    </div>
  );
}
