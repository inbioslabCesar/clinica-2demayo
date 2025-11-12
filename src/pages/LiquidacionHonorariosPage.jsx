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
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(3);

  useEffect(() => {
    cargarMedicos();
    cargarHonorarios();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      params.push(`page=${page}`);
      params.push(`limit=${rowsPerPage}`);
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
      <div className="bg-white p-3 sm:p-4 rounded shadow mb-6 flex flex-col sm:flex-row gap-2 sm:gap-4 items-stretch sm:items-center">
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 w-full">
          <div className="flex flex-col">
            <label className="text-xs sm:text-sm">Médico:</label>
            <select value={medicoId} onChange={e => setMedicoId(e.target.value)} className="border rounded px-2 py-1 sm:px-3 sm:py-2 text-xs sm:text-sm">
              <option value="">Todos</option>
              {medicos.map(m => (
                <option key={m.id} value={m.id}>{m.nombre} {m.apellido}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col">
            <label className="text-xs sm:text-sm">Turno:</label>
            <select value={turno} onChange={e => setTurno(e.target.value)} className="border rounded px-2 py-1 sm:px-3 sm:py-2 text-xs sm:text-sm">
              <option value="">Todos</option>
              <option value="mañana">Mañana</option>
              <option value="tarde">Tarde</option>
              <option value="noche">Noche</option>
            </select>
          </div>
          <div className="flex flex-col">
            <label className="text-xs sm:text-sm">Estado:</label>
            <select value={estado} onChange={e => setEstado(e.target.value)} className="border rounded px-2 py-1 sm:px-3 sm:py-2 text-xs sm:text-sm">
              <option value="pendiente">Pendiente</option>
              <option value="pagado">Pagado</option>
            </select>
          </div>
          <div className="flex flex-col">
            <label className="text-xs sm:text-sm">Filas por página:</label>
            <select value={rowsPerPage} onChange={e => { setRowsPerPage(Number(e.target.value)); setPage(1); }} className="border rounded px-2 py-1 sm:px-3 sm:py-2 text-xs sm:text-sm">
              <option value={3}>3</option>
              <option value={5}>5</option>
              <option value={10}>10</option>
            </select>
          </div>
        </div>
        <button onClick={() => { setPage(1); cargarHonorarios(); }} className="bg-blue-600 text-white px-3 py-1 sm:px-4 sm:py-2 rounded mt-2 sm:mt-0 w-full sm:w-auto">Filtrar</button>
      </div>
      {loading ? (
        <div className="text-center py-8">Cargando honorarios...</div>
      ) : (
        <>
          <table className="w-full bg-white rounded shadow">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2">Médico</th>
                <th className="px-4 py-2">Servicio</th>
                <th className="px-4 py-2">Paciente</th>
                <th className="hidden sm:table-cell px-4 py-2">Fecha</th>
                <th className="hidden sm:table-cell px-4 py-2">Turno</th>
                <th className="px-4 py-2">Monto</th>
                <th className="px-4 py-2">Estado</th>
                <th className="hidden sm:table-cell px-4 py-2">Cobrado por</th>
                <th className="hidden sm:table-cell px-4 py-2">Liquidado por</th>
                <th className="hidden sm:table-cell px-4 py-2">Fecha Liquidación</th>
                <th className="px-4 py-2">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {honorarios.length === 0 ? (
                <tr><td colSpan={11} className="text-center py-8 text-gray-500">No hay honorarios {estado === "pendiente" ? "pendientes" : "pagados"}</td></tr>
              ) : honorarios.slice((page - 1) * rowsPerPage, page * rowsPerPage).map(h => (
                <tr key={h.id}>
                  <td className="px-4 py-2">{h.medico_nombre} {h.medico_apellido}</td>
                  <td className="px-4 py-2">{h.tipo_servicio}</td>
                  <td className="px-4 py-2">{h.paciente_nombre} {h.paciente_apellido}</td>
                  <td className="hidden sm:table-cell px-4 py-2">{h.fecha}</td>
                  <td className="hidden sm:table-cell px-4 py-2">{h.turno}</td>
                  <td className="px-4 py-2">S/ {parseFloat(h.monto_medico).toFixed(2)}</td>
                  <td className="px-4 py-2">{h.estado_pago_medico}</td>
                  <td className="hidden sm:table-cell px-4 py-2">
                    {h.cobrado_por_nombre ? (
                      <span>{h.cobrado_por_nombre} <span className="text-xs text-gray-500">({h.cobrado_por_rol})</span></span>
                    ) : <span className="text-gray-400">-</span>}
                  </td>
                  <td className="hidden sm:table-cell px-4 py-2">
                    {h.estado_pago_medico === "pagado" && h.liquidado_por_nombre ? (
                      <span>{h.liquidado_por_nombre} <span className="text-xs text-gray-500">({h.liquidado_por_rol})</span></span>
                    ) : <span className="text-gray-400">-</span>}
                  </td>
                  <td className="hidden sm:table-cell px-4 py-2">
                    {h.estado_pago_medico === "pagado" && h.fecha_liquidacion ? (
                      <span>{h.fecha_liquidacion}</span>
                    ) : <span className="text-gray-400">-</span>}
                  </td>
                  <td className="px-4 py-2">
                    {h.estado_pago_medico === "pendiente" && (
                      <button onClick={() => liquidarHonorario(h.id)} className="bg-green-600 text-white px-3 py-1 rounded">Liquidar</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Paginación */}
          <div className="flex justify-end items-center mt-4 gap-2">
            <button disabled={page === 1} onClick={() => { setPage(page - 1); cargarHonorarios(); }} className="px-3 py-1 rounded bg-gray-200">Anterior</button>
            <span>Página {page}</span>
            <button disabled={page * rowsPerPage >= honorarios.length} onClick={() => { setPage(page + 1); cargarHonorarios(); }} className="px-3 py-1 rounded bg-gray-200">Siguiente</button>
          </div>
        </>
      )}
    </div>
  );
}

export default LiquidacionHonorariosPage;
