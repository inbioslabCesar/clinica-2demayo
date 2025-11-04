import { useState, useEffect } from "react";
import { BASE_URL } from "../config/config";
import Swal from "sweetalert2";

function LiquidacionHonorariosPage() {
  const [honorarios, setHonorarios] = useState([]);
  const [medicos, setMedicos] = useState([]);
  const [turno, setTurno] = useState("");
  const [medicoId, setMedicoId] = useState("");
  const [estado, setEstado] = useState("pendiente");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    cargarMedicos();
    cargarHonorarios();
  }, []);

  const cargarMedicos = async () => {
    try {
      const response = await fetch(`${BASE_URL}api_medicos.php`);
      const data = await response.json();
      if (data.success) {
        setMedicos(data.medicos || []);
      }
    } catch (error) {
      console.error("Error al cargar médicos:", error);
    }
  };

  const cargarHonorarios = async () => {
    setLoading(true);
    try {
      const params = [];
      if (medicoId) params.push(`medico_id=${medicoId}`);
      if (turno) params.push(`turno=${turno}`);
      if (estado) params.push(`estado=${estado}`);
      const query = params.length ? `?${params.join("&")}` : "";
      const response = await fetch(`${BASE_URL}api_honorarios_pendientes.php${query}`);
      const data = await response.json();
      if (data.success) {
        setHonorarios(data.honorarios || []);
      }
    } catch (error) {
      console.error("Error al cargar honorarios:", error);
    } finally {
      setLoading(false);
    }
  };

  const liquidarHonorario = async (honorarioId) => {
    const result = await Swal.fire({
      title: "¿Liquidar honorario?",
      text: "¿Deseas marcar este honorario como pagado?",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Sí, liquidar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#3085d6",
    });
    if (!result.isConfirmed) return;
    try {
      const response = await fetch(`${BASE_URL}api_liquidar_honorario.php`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: honorarioId }),
        credentials: "include"
      });
      const data = await response.json();
      if (data.success) {
        Swal.fire("¡Liquidado!", "El honorario ha sido marcado como pagado.", "success");
        cargarHonorarios();
      } else {
        Swal.fire("Error", data.error || "No se pudo liquidar el honorario.", "error");
      }
    } catch (error) {
      console.error("Error al liquidar honorario:", error);
      Swal.fire("Error", "Error de conexión.", "error");
    }
  };

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4 text-blue-800">Liquidación de Honorarios Médicos</h1>
      <div className="bg-white p-4 rounded shadow mb-6 flex gap-4 items-center">
        <label>Médico:</label>
        <select value={medicoId} onChange={e => setMedicoId(e.target.value)} className="border rounded px-3 py-2">
          <option value="">Todos</option>
          {medicos.map(m => (
            <option key={m.id} value={m.id}>{m.nombre} {m.apellido}</option>
          ))}
        </select>
        <label>Turno:</label>
        <select value={turno} onChange={e => setTurno(e.target.value)} className="border rounded px-3 py-2">
          <option value="">Todos</option>
          <option value="mañana">Mañana</option>
          <option value="tarde">Tarde</option>
          <option value="noche">Noche</option>
        </select>
        <label>Estado:</label>
        <select value={estado} onChange={e => setEstado(e.target.value)} className="border rounded px-3 py-2">
          <option value="pendiente">Pendiente</option>
          <option value="pagado">Pagado</option>
        </select>
        <button onClick={cargarHonorarios} className="bg-blue-600 text-white px-4 py-2 rounded">Filtrar</button>
      </div>
      {loading ? (
        <div className="text-center py-8">Cargando honorarios...</div>
      ) : (
        <table className="w-full bg-white rounded shadow">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2">Médico</th>
              <th className="px-4 py-2">Servicio</th>
              <th className="px-4 py-2">Paciente</th>
              <th className="px-4 py-2">Fecha</th>
              <th className="px-4 py-2">Turno</th>
              <th className="px-4 py-2">Monto Médico</th>
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {honorarios.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-8 text-gray-500">No hay honorarios {estado === "pendiente" ? "pendientes" : "pagados"}</td></tr>
            ) : honorarios.map(h => (
              <tr key={h.id}>
                <td className="px-4 py-2">{h.medico_nombre} {h.medico_apellido}</td>
                <td className="px-4 py-2">{h.tipo_servicio}</td>
                <td className="px-4 py-2">{h.paciente_nombre} {h.paciente_apellido}</td>
                <td className="px-4 py-2">{h.fecha}</td>
                <td className="px-4 py-2">{h.turno}</td>
                <td className="px-4 py-2">S/ {parseFloat(h.monto_medico).toFixed(2)}</td>
                <td className="px-4 py-2">{h.estado_pago_medico}</td>
                <td className="px-4 py-2">
                  {h.estado_pago_medico === "pendiente" && (
                    <button onClick={() => liquidarHonorario(h.id)} className="bg-green-600 text-white px-3 py-1 rounded">Liquidar</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default LiquidacionHonorariosPage;
