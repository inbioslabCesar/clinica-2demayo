import { useState, useEffect } from "react";
import { BASE_URL } from "../config/config";
import Swal from "sweetalert2";

function LiquidacionHonorariosPage() {
    // Obtener usuario actual desde sessionStorage
    const usuario = (() => {
      try {
        return JSON.parse(sessionStorage.getItem('usuario')) || {};
      } catch {
        return {};
      }
    })();

    // Acción eliminar honorario
    const eliminarHonorario = async (honorarioId) => {
      const result = await Swal.fire({
        title: "¿Eliminar honorario?",
        text: "Esta acción eliminará el registro de honorario y no podrá recuperarse.",
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Sí, eliminar",
        cancelButtonText: "Cancelar",
        confirmButtonColor: "#d33",
      });
      if (!result.isConfirmed) return;
      try {
        const response = await fetch(`${BASE_URL}api_eliminar_honorario.php`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: honorarioId }),
          credentials: "include"
        });
        const data = await response.json();
        if (data.success) {
          Swal.fire("¡Eliminado!", "El honorario ha sido eliminado.", "success");
          cargarHonorarios();
        } else {
          Swal.fire("Error", data.error || "No se pudo eliminar el honorario.", "error");
        }
      } catch {
        // Eliminado log de error al eliminar honorario
        Swal.fire("Error", "Error de conexión.", "error");
      }
    };
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
    } catch {
      // Eliminado log de error al cargar médicos
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
        // Eliminado log de honorarios recibidos
        setHonorarios(data.honorarios || []);
      }
    } catch {
      // Eliminado log de error al cargar honorarios
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

  // Filtrar duplicados por id
  // Filtrar duplicados y solo mostrar consultas médicas y ecografías
  const honorariosUnicos = honorarios
    .filter((h, idx, arr) => arr.findIndex(x => x.id === h.id) === idx)
    .filter(h => h.tipo_servicio === 'consulta' || h.tipo_servicio === 'ecografia');
  return (
      <div className="container mx-auto p-6">
        <h1 className="text-2xl font-bold mb-4 text-blue-800">Liquidación de Honorarios Médicos</h1>
        <div className="bg-white p-3 sm:p-4 rounded shadow mb-6">
          {/* Filtros responsivos */}
          <form className="grid grid-cols-1 md:grid-cols-5 gap-3">
            {/* ...filtros... */}
            <div className="flex flex-col bg-blue-50 rounded-lg p-2">
              <label className="text-xs sm:text-sm font-semibold text-blue-800 mb-1">Médico:</label>
              <select value={medicoId} onChange={e => setMedicoId(e.target.value)} className="border rounded px-2 py-2 text-xs sm:text-sm focus:outline-blue-400">
                <option value="">Todos</option>
                {medicos.map(m => (
                  <option key={m.id} value={m.id}>{m.nombre} {m.apellido}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col bg-blue-50 rounded-lg p-2">
              <label className="text-xs sm:text-sm font-semibold text-blue-800 mb-1">Turno:</label>
              <select value={turno} onChange={e => setTurno(e.target.value)} className="border rounded px-2 py-2 text-xs sm:text-sm focus:outline-blue-400">
                <option value="">Todos</option>
                <option value="mañana">Mañana</option>
                <option value="tarde">Tarde</option>
                <option value="noche">Noche</option>
              </select>
            </div>
            <div className="flex flex-col bg-blue-50 rounded-lg p-2">
              <label className="text-xs sm:text-sm font-semibold text-blue-800 mb-1">Estado:</label>
              <select value={estado} onChange={e => setEstado(e.target.value)} className="border rounded px-2 py-2 text-xs sm:text-sm focus:outline-blue-400">
                <option value="pendiente">Pendiente</option>
                <option value="pagado">Pagado</option>
              </select>
            </div>
            <div className="flex flex-col bg-blue-50 rounded-lg p-2">
              <label className="text-xs sm:text-sm font-semibold text-blue-800 mb-1">Filas por página:</label>
              <select value={rowsPerPage} onChange={e => { setRowsPerPage(Number(e.target.value)); setPage(1); }} className="border rounded px-2 py-2 text-xs sm:text-sm focus:outline-blue-400">
                <option value={3}>3</option>
                <option value={5}>5</option>
                <option value={10}>10</option>
              </select>
            </div>
            <div className="flex flex-col justify-end">
              <button type="button" onClick={() => { setPage(1); cargarHonorarios(); }} className="bg-blue-600 text-white px-4 py-2 rounded font-bold w-full">Filtrar</button>
            </div>
          </form>
        </div>
        {loading ? (
          <div className="text-center py-8">Cargando honorarios...</div>
        ) : (
          <>
            {/* Vista tipo card en móvil */}
            <div className="block md:hidden">
              <div className="space-y-4">
                {honorariosUnicos.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">No hay honorarios {estado === "pendiente" ? "pendientes" : "pagados"}</div>
                ) : honorariosUnicos.slice((page - 1) * rowsPerPage, page * rowsPerPage).map(h => (
                  <div key={h.id} className="rounded-xl shadow-lg border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-blue-100 p-4 flex flex-col gap-2">
                    {/* ...contenido card... */}
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-blue-800 text-lg">{`${h.medico_nombre} ${h.medico_apellido}`.toUpperCase()}</span>
                      <span className="text-xs px-2 py-1 rounded bg-blue-200 text-blue-800 font-bold">{h.tipo_servicio ? h.tipo_servicio.toUpperCase() : ""}</span>
                    </div>
                    <div className="text-sm text-gray-700 mb-1">{h.descripcion ? h.descripcion.toUpperCase() : ""}</div>
                    <div className="text-sm text-gray-700"><span className="font-bold">Paciente:</span> {`${h.paciente_nombre} ${h.paciente_apellido}`.toUpperCase()}</div>
                    <div className="flex gap-2 text-xs text-gray-500">
                      <span>Fecha: {h.fecha ? h.fecha.toUpperCase() : ""}</span>
                      <span>Turno: {h.turno ? h.turno.toUpperCase() : ""}</span>
                    </div>
                    <div className="flex gap-2 text-xs text-gray-500">
                      <span>Estado: <span className={h.estado_pago_medico === "pagado" ? "text-green-700 font-bold" : "text-yellow-700 font-bold"}>{h.estado_pago_medico ? h.estado_pago_medico.toUpperCase() : ""}</span></span>
                      <span>Monto: <span className="font-bold text-blue-800">S/ {parseFloat(h.monto_medico).toFixed(2)}</span></span>
                    </div>
                    <div className="flex gap-2 text-xs text-gray-500">
                      <span>Cobrado por: {h.cobrado_por_nombre ? h.cobrado_por_nombre.toUpperCase() : "-"}</span>
                      <span>Liquidado por: {h.liquidado_por_nombre ? h.liquidado_por_nombre.toUpperCase() : "-"}</span>
                    </div>
                    <div className="flex gap-2 text-xs text-gray-500">
                      <span>Fecha Liquidación: {h.fecha_liquidacion ? h.fecha_liquidacion.toUpperCase() : "-"}</span>
                    </div>
                    <div className="mt-2 flex justify-end gap-2">
                      {h.estado_pago_medico === "pendiente" && (
                        <button onClick={() => liquidarHonorario(h.id)} className="bg-green-600 text-white px-4 py-1 rounded font-bold">Liquidar</button>
                      )}
                      {/* Botón eliminar solo para administrador */}
                      {usuario.rol === 'administrador' && (
                        <button onClick={() => eliminarHonorario(h.id)} className="bg-red-600 text-white px-4 py-1 rounded font-bold">Eliminar</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* Vista tabla en desktop */}
            <div className="hidden md:block">
              <table className="w-full bg-white rounded shadow">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2">Médico</th>
                    <th className="px-4 py-2">Descripción</th>
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
                  {honorariosUnicos.length === 0 ? (
                    <tr><td colSpan={12} className="text-center py-8 text-gray-500">No hay honorarios {estado === "pendiente" ? "pendientes" : "pagados"}</td></tr>
                  ) : honorariosUnicos.slice((page - 1) * rowsPerPage, page * rowsPerPage).map(h => (
                    <tr key={h.id}>
                      <td className="px-4 py-2">{`${h.medico_nombre} ${h.medico_apellido}`.toUpperCase()}</td>
                      <td className="px-4 py-2">{h.descripcion ? h.descripcion.toUpperCase() : ""}</td>
                      <td className="px-4 py-2">{h.tipo_servicio ? h.tipo_servicio.toUpperCase() : ""}</td>
                      <td className="px-4 py-2">{`${h.paciente_nombre} ${h.paciente_apellido}`.toUpperCase()}</td>
                      <td className="hidden sm:table-cell px-4 py-2">{h.fecha ? h.fecha.toUpperCase() : ""}</td>
                      <td className="hidden sm:table-cell px-4 py-2">{h.turno ? h.turno.toUpperCase() : ""}</td>
                      <td className="px-4 py-2">S/ {parseFloat(h.monto_medico).toFixed(2)}</td>
                      <td className="px-4 py-2">{h.estado_pago_medico ? h.estado_pago_medico.toUpperCase() : ""}</td>
                      <td className="hidden sm:table-cell px-4 py-2">
                        {h.cobrado_por_nombre ? (
                          <span>{h.cobrado_por_nombre.toUpperCase()} <span className="text-xs text-gray-500">({h.cobrado_por_rol ? h.cobrado_por_rol.toUpperCase() : ""})</span></span>
                        ) : <span className="text-gray-400">-</span>}
                      </td>
                      <td className="hidden sm:table-cell px-4 py-2">
                        {h.estado_pago_medico === "pagado" && h.liquidado_por_nombre ? (
                          <span>{h.liquidado_por_nombre.toUpperCase()} <span className="text-xs text-gray-500">({h.liquidado_por_rol ? h.liquidado_por_rol.toUpperCase() : ""})</span></span>
                        ) : <span className="text-gray-400">-</span>}
                      </td>
                      <td className="hidden sm:table-cell px-4 py-2">
                        {h.estado_pago_medico === "pagado" && h.fecha_liquidacion ? (
                          <span>{h.fecha_liquidacion.toUpperCase()}</span>
                        ) : <span className="text-gray-400">-</span>}
                      </td>
                      <td className="px-4 py-2 flex gap-2">
                        {h.estado_pago_medico === "pendiente" && (
                          <button onClick={() => liquidarHonorario(h.id)} className="bg-green-600 text-white px-3 py-1 rounded">Liquidar</button>
                        )}
                        {/* Botón eliminar solo para administrador */}
                        {usuario.rol === 'administrador' && (
                          <button onClick={() => eliminarHonorario(h.id)} className="bg-red-600 text-white px-3 py-1 rounded">Eliminar</button>
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
                <button disabled={page * rowsPerPage >= honorariosUnicos.length} onClick={() => { setPage(page + 1); cargarHonorarios(); }} className="px-3 py-1 rounded bg-gray-200">Siguiente</button>
              </div>
            </div>
          </>
        )}
      </div>
    );
}

export default LiquidacionHonorariosPage;
