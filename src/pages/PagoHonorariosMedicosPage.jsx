import React, { useEffect, useState } from "react";
import Swal from "sweetalert2";
import { BASE_URL } from "../config/config";

export default function PagoHonorariosMedicosPage() {
  const [honorarios, setHonorarios] = useState([]);
  // Paginación
  const [paginaActual, setPaginaActual] = useState(1);
  const [porPagina, setPorPagina] = useState(3);
  const honorariosPaginados = honorarios.slice((paginaActual - 1) * porPagina, paginaActual * porPagina);
  const totalPaginas = Math.ceil(honorarios.length / porPagina);
  const handleSelect = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };
  // Función para cancelar honorario médico
  const handleCancelarHonorario = async (idMovimiento) => {
    if (!window.confirm("¿Está seguro que desea cancelar este honorario?"))
      return;
    try {
      const response = await fetch(
        `${BASE_URL}api_cancelar_honorario_medico.php`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ id: idMovimiento }),
        }
      );
      const data = await response.json();
      if (data.success) {
        Swal.fire("Honorario cancelado correctamente", "", "success");
        fetchHonorarios();
      } else {
        Swal.fire("No se pudo cancelar el honorario", "", "error");
      }
    } catch {
      Swal.fire("Error al cancelar el honorario", "", "error");
    }
  };
  const [selectedIds, setSelectedIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [metodoPago, setMetodoPago] = useState("efectivo");
  const [observaciones, setObservaciones] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState("pendiente");
  const [tipoConsultaFiltro, setTipoConsultaFiltro] = useState("");

  useEffect(() => {
    fetchHonorarios();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estadoFiltro, tipoConsultaFiltro]);

  const fetchHonorarios = async () => {
    setLoading(true);
    try {
      let url = `${BASE_URL}api_movimientos_honorarios.php?estado_pago=${estadoFiltro}`;
      if (tipoConsultaFiltro) {
        url += `&tipo_consulta=${tipoConsultaFiltro}`;
      }
  // ...eliminado comentario de depuración...
      const resp = await fetch(url, { credentials: "include" });
      const data = await resp.json();
  // ...eliminado comentario de depuración...
      if (data.success) {
        setHonorarios(data.movimientos || []);
      } else {
        setHonorarios([]);
        Swal.fire(
          "Error",
          data.error || "No se pudo cargar honorarios",
          "error"
        );
      }
    } catch {
      setHonorarios([]);
      Swal.fire("Error", "No se pudo cargar honorarios", "error");
    } finally {
      setLoading(false);
    }
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
        body: JSON.stringify({
          ids: selectedIds,
          metodo_pago: metodoPago,
          observaciones,
        }),
      });
      const data = await resp.json();
      if (data.success) {
        Swal.fire(
          "Pago registrado",
          "Honorarios marcados como pagados",
          "success"
        );
        setSelectedIds([]);
        fetchHonorarios();
      } else {
        Swal.fire(
          "Error",
          data.error || "No se pudo registrar el pago",
          "error"
        );
      }
    } catch {
      Swal.fire("Error", "No se pudo registrar el pago", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
  <div className="max-w-7xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6 text-purple-800">
        Pago de Honorarios Médicos
      </h1>
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
      <div className="bg-white rounded-lg shadow p-4 mb-4 flex items-center gap-4">
        <div className="flex items-center">
          <label className="font-semibold mr-2">Filtrar por estado:</label>
          <select
            value={estadoFiltro}
            onChange={(e) => setEstadoFiltro(e.target.value)}
            className="border rounded px-3 py-2"
          >
            <option value="pendiente">Pendiente</option>
            <option value="pagado">Pagado</option>
            <option value="cancelado">Cancelado</option>
          </select>
        </div>
        <div className="flex items-center">
          <label className="font-semibold mr-2">Tipo de consulta:</label>
          <select
            value={tipoConsultaFiltro}
            onChange={(e) => setTipoConsultaFiltro(e.target.value)}
            className="border rounded px-3 py-2"
          >
            <option value="">Todas</option>
            <option value="programada">Programada</option>
            <option value="espontanea">Espontánea</option>
          </select>
        </div>
      </div>
      <div className="bg-white rounded-lg shadow p-4 overflow-x-auto">
        {/* Selector de cantidad por página */}
        <div className="mb-4 flex items-center gap-2">
          <label className="font-semibold">Mostrar:</label>
          <select value={porPagina} onChange={e => { setPorPagina(Number(e.target.value)); setPaginaActual(1); }} className="border rounded px-2 py-1">
            <option value={3}>3</option>
            <option value={5}>5</option>
            <option value={10}>10</option>
          </select>
          <span className="text-gray-500">por página</span>
        </div>
        {loading ? (
          <div className="text-center py-8">Cargando honorarios...</div>
        ) : honorarios.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No hay honorarios para este estado
          </div>
        ) : (
          <>
            {/* Vista tipo cards en móvil, tabla en desktop */}
            <div className="block md:hidden">
              <div className="space-y-4">
                {honorariosPaginados.map((h) => (
                  <div key={h.id} className="rounded-xl shadow-lg border border-purple-100 bg-gradient-to-br from-purple-50 via-blue-50 to-pink-50 p-4 flex flex-col gap-2">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-purple-800 text-lg">{h.medico_nombre || h.medico_id}</span>
                      <span className="font-bold text-green-700 text-xl">S/ {parseFloat(h.monto_medico).toFixed(2)}</span>
                    </div>
                    <div className="flex flex-wrap gap-2 text-sm">
                      <span className="bg-gray-100 px-2 py-1 rounded">{h.tipo_servicio}</span>
                      <span className="bg-gray-100 px-2 py-1 rounded">{h.especialidad}</span>
                      <span className={h.tipo_consulta === "espontanea" ? "bg-blue-100 text-blue-800 px-2 py-1 rounded" : "bg-gray-100 text-gray-800 px-2 py-1 rounded"}>{h.tipo_consulta === "espontanea" ? "Espontánea" : "Programada"}</span>
                      <span className={h.estado_pago_medico === "pendiente" ? "bg-yellow-100 text-yellow-800 px-2 py-1 rounded font-bold" : h.estado_pago_medico === "pagado" ? "bg-green-100 text-green-800 px-2 py-1 rounded font-bold" : h.estado_pago_medico === "cancelado" ? "bg-red-100 text-red-800 px-2 py-1 rounded font-bold" : "bg-gray-100 text-gray-800 px-2 py-1 rounded font-bold"}>{h.estado_pago_medico}</span>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-gray-600 text-xs">{h.fecha}</span>
                      <div className="flex gap-2">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(h.id)}
                          onChange={() => handleSelect(h.id)}
                          disabled={h.estado_pago_medico !== "pendiente"}
                        />
                        {h.estado_pago_medico === "pendiente" && (
                          <button
                            className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-xs shadow"
                            onClick={() => handleCancelarHonorario(h.id)}
                          >
                            Cancelar
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {/* Paginación móvil */}
              <div className="flex justify-center items-center gap-2 mt-4">
                <button
                  className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300"
                  disabled={paginaActual === 1}
                  onClick={() => setPaginaActual(paginaActual - 1)}
                >Anterior</button>
                <span>Página {paginaActual} de {totalPaginas}</span>
                <button
                  className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300"
                  disabled={paginaActual === totalPaginas}
                  onClick={() => setPaginaActual(paginaActual + 1)}
                >Siguiente</button>
              </div>
            </div>
            {/* Vista tabla en desktop */}
            <div className="hidden md:block">
              <table className="min-w-[900px] w-full text-sm">
                <thead>
                  <tr className="bg-gradient-to-r from-purple-100 via-blue-100 to-pink-100 text-purple-900">
                    <th className="py-3 px-2 text-left"></th>
                    <th className="py-3 px-2 text-left">Médico</th>
                    <th className="py-3 px-2 text-left">Servicio</th>
                    <th className="py-3 px-2 text-left">Especialidad</th>
                    <th className="py-3 px-2 text-left">Monto</th>
                    <th className="py-3 px-2 text-left">Fecha</th>
                    <th className="py-3 px-2 text-left">Tipo Consulta</th>
                    <th className="py-3 px-2 text-left">Estado</th>
                    <th className="py-3 px-2 text-left">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {honorariosPaginados.map((h) => (
                    <tr key={h.id} className="border-b hover:bg-purple-50 transition">
                      <td className="py-2 px-2">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(h.id)}
                          onChange={() => handleSelect(h.id)}
                          disabled={h.estado_pago_medico !== "pendiente"}
                        />
                      </td>
                      <td className="py-2 px-2 font-semibold text-purple-900">{h.medico_nombre || h.medico_id}</td>
                      <td className="py-2 px-2">{h.tipo_servicio}</td>
                      <td className="py-2 px-2">{h.especialidad}</td>
                      <td className="py-2 px-2 font-bold text-green-700 text-lg">
                        S/ {parseFloat(h.monto_medico).toFixed(2)}
                      </td>
                      <td className="py-2 px-2">{h.fecha}</td>
                      <td className="py-2 px-2">
                        <span
                          className={
                            h.tipo_consulta === "espontanea"
                              ? "bg-blue-100 text-blue-800 px-2 py-1 rounded shadow"
                              : "bg-gray-100 text-gray-800 px-2 py-1 rounded shadow"
                          }
                        >
                          {h.tipo_consulta === "espontanea"
                            ? "Espontánea"
                            : "Programada"}
                        </span>
                      </td>
                      <td className="py-2 px-2">
                        <span
                          className={
                            h.estado_pago_medico === "pendiente"
                              ? "bg-yellow-100 text-yellow-800 px-2 py-1 rounded shadow font-bold"
                              : h.estado_pago_medico === "pagado"
                              ? "bg-green-100 text-green-800 px-2 py-1 rounded shadow font-bold"
                              : h.estado_pago_medico === "cancelado"
                              ? "bg-red-100 text-red-800 px-2 py-1 rounded shadow font-bold"
                              : "bg-gray-100 text-gray-800 px-2 py-1 rounded shadow font-bold"
                          }
                        >
                          {h.estado_pago_medico}
                        </span>
                      </td>
                      <td className="py-2 px-2">
                        {h.estado_pago_medico === "pendiente" && (
                          <button
                            className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-sm shadow"
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
              {/* Paginación desktop */}
              <div className="flex justify-center items-center gap-2 mt-4">
                <button
                  className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300"
                  disabled={paginaActual === 1}
                  onClick={() => setPaginaActual(paginaActual - 1)}
                >Anterior</button>
                <span>Página {paginaActual} de {totalPaginas}</span>
                <button
                  className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300"
                  disabled={paginaActual === totalPaginas}
                  onClick={() => setPaginaActual(paginaActual + 1)}
                >Siguiente</button>
              </div>
            </div>
          </>
        )}
      </div>
      <button
        onClick={handlePagar}
        disabled={
          selectedIds.length === 0 || loading || estadoFiltro !== "pendiente"
        }
        className="mt-6 px-6 py-3 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700 disabled:opacity-50"
      >
        Registrar Pago
      </button>
    </div>
  );
}
