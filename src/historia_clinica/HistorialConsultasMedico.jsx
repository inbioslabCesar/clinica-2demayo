import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BASE_URL } from "../config/config";
export default function HistorialConsultasMedico({ medicoId }) {
  const [historial, setHistorial] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [rowsPerPage, setRowsPerPage] = useState(3);
  const [page, setPage] = useState(1);
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    fetch(
      `${BASE_URL}api_historial_consultas_medico.php?medico_id=${medicoId}`,
      { credentials: "include" }
    )
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setHistorial(data.historial);
        else setError(data.error || "Error al cargar historial");
        setLoading(false);
      })
      .catch(() => {
        setError("Error de conexión");
        setLoading(false);
      });
  }, [medicoId]);

  const historialFiltrado = historial.filter(
    (h) =>
      h.paciente_nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      h.motivo.toLowerCase().includes(busqueda.toLowerCase()) ||
      h.diagnostico.toLowerCase().includes(busqueda.toLowerCase())
  );

  // Paginación
  const totalRows = historialFiltrado.length;
  const totalPages = Math.ceil(totalRows / rowsPerPage);
  const startIdx = (page - 1) * rowsPerPage;
  const endIdx = startIdx + rowsPerPage;
  const historialPagina = historialFiltrado.slice(startIdx, endIdx);

  useEffect(() => {
    setPage(1); // Reiniciar página al cambiar búsqueda o filas por página
  }, [busqueda, rowsPerPage]);

  return (
    <div className="max-w-3xl mx-auto p-4">
      <h2 className="text-2xl font-bold mb-4">Historial de Consultas</h2>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <input
          type="text"
          className="border rounded p-2 w-full"
          placeholder="Buscar por paciente, motivo o diagnóstico"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        <label className="text-xs">Filas por página:</label>
        <select
          value={rowsPerPage}
          onChange={e => setRowsPerPage(Number(e.target.value))}
          className="border rounded p-1 text-xs"
        >
          <option value={3}>3</option>
          <option value={5}>5</option>
          <option value={10}>10</option>
        </select>
      </div>
      {loading ? (
        <div>Cargando...</div>
      ) : error ? (
        <div className="text-red-600">{error}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm border rounded">
            <thead>
              <tr className="bg-blue-100">
                <th className="px-2 py-1">Fecha</th>
                <th className="px-2 py-1">Paciente</th>
                {/* Ocultar en móvil */}
                <th className="px-2 py-1 hidden sm:table-cell">Motivo</th>
                <th className="px-2 py-1 hidden md:table-cell">Diagnóstico</th>
                <th className="px-2 py-1 hidden md:table-cell">Estado</th>
                <th className="px-2 py-1">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {historialFiltrado.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-2">
                    Sin resultados
                  </td>
                </tr>
              ) : (
                historialPagina.map((h) => (
                  <tr key={h.id} className="hover:bg-blue-50">
                    <td className="border px-2 py-1">{h.fecha}</td>
                    <td className="border px-2 py-1">{h.paciente_nombre}</td>
                    <td className="border px-2 py-1 hidden sm:table-cell">{h.motivo}</td>
                    <td className="border px-2 py-1 hidden md:table-cell">{h.diagnostico}</td>
                    <td className="border px-2 py-1 hidden md:table-cell">{h.estado}</td>
                    <td className="border px-2 py-1 text-center">
                      <button
                        className="text-blue-600 underline"
                        onClick={() =>
                          navigate(
                            `/historia-clinica/${h.paciente_id}/${h.consulta_id}`
                          )
                        }
                      >
                        Ver
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {/* Controles de paginación */}
          {totalRows > 0 && (
            <div className="flex justify-end items-center gap-2 mt-2">
              <button
                onClick={() => setPage(page - 1)}
                disabled={page === 1}
                className="px-2 py-1 rounded bg-gray-200 disabled:opacity-50"
              >
                Anterior
              </button>
              <span className="text-sm">
                Página {page} de {totalPages}
              </span>
              <button
                onClick={() => setPage(page + 1)}
                disabled={page === totalPages}
                className="px-2 py-1 rounded bg-gray-200 disabled:opacity-50"
              >
                Siguiente
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}