import React, { useEffect, useState, forwardRef, useImperativeHandle } from "react";

const EgresosList = forwardRef(function EgresosList({ onEdit }, ref) {
  const [egresos, setEgresos] = useState([]);
  const [loading, setLoading] = useState(false);
    const [filtro, setFiltro] = useState("");
    const [fechaFiltro, setFechaFiltro] = useState("");
  const [rowsPerPage, setRowsPerPage] = useState(3);
  const [page, setPage] = useState(1);

  useEffect(() => {
    fetchEgresos();
    }, [fechaFiltro]);

  useImperativeHandle(ref, () => ({
    fetchEgresos
  }));

  const fetchEgresos = async () => {
    setLoading(true);
      let url = "/api_egresos.php";
      if (fechaFiltro) {
        url += `?fecha=${fechaFiltro}`;
      }
      const resp = await fetch(url);
    const data = await resp.json();
    setLoading(false);
    if (data.success) setEgresos(data.egresos || []);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("¿Eliminar este egreso?")) return;
    setLoading(true);
    const resp = await fetch(`/api_egresos.php?id=${id}`, { method: "DELETE" });
    const data = await resp.json();
    setLoading(false);
    if (data.success) fetchEgresos();
    else alert(data.error || "Error al eliminar egreso");
  };

  // Mostrar solo egresos que NO sean honorario_medico
  const egresosFiltrados = egresos
    .filter(e => e.tipo_egreso !== 'honorario_medico')
    .filter(e =>
      e.descripcion?.toLowerCase().includes(filtro.toLowerCase()) ||
      e.categoria?.toLowerCase().includes(filtro.toLowerCase())
    );

  // Paginación
  const totalPages = Math.ceil(egresosFiltrados.length / rowsPerPage) || 1;
  const paginatedEgresos = egresosFiltrados.slice((page - 1) * rowsPerPage, page * rowsPerPage);

  return (
    <div className="mt-8">
      <div className="bg-white rounded shadow p-3 sm:p-4 mb-4 flex flex-col sm:flex-row gap-2 sm:gap-4 items-stretch sm:items-center">
        <input
          type="text"
          placeholder="Buscar por descripción o categoría"
          value={filtro}
          onChange={e => { setFiltro(e.target.value); setPage(1); }}
          className="w-full sm:max-w-xs px-4 py-2 rounded border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 bg-gray-50 text-gray-800 placeholder-gray-400 transition"
        />
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 w-full sm:w-auto items-stretch sm:items-center">
          <label className="font-semibold text-xs sm:text-sm">Filas por página:</label>
          <select
            value={rowsPerPage}
            onChange={e => { setRowsPerPage(Number(e.target.value)); setPage(1); }}
            className="px-3 py-2 rounded border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 bg-gray-50 text-gray-800 transition max-w-[80px]"
          >
            <option value={3}>3</option>
            <option value={5}>5</option>
            <option value={10}>10</option>
          </select>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 w-full sm:w-auto items-stretch sm:items-center">
          <label className="font-semibold text-xs sm:text-sm">Filtrar por fecha:</label>
          <input
            type="date"
            value={fechaFiltro}
            onChange={e => setFechaFiltro(e.target.value)}
            className="px-3 py-2 rounded border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 bg-gray-50 text-gray-800 transition max-w-[160px]"
          />
          <button
            className="px-3 py-2 rounded bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold transition disabled:opacity-60"
            onClick={() => setFechaFiltro("")}
            disabled={!fechaFiltro}
          >
            Limpiar fecha
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full border border-gray-200 rounded-lg shadow text-xs sm:text-sm bg-white">
          <thead>
            <tr className="bg-blue-50 text-blue-800">
              <th className="px-2 py-2 font-semibold border-b border-gray-200">Monto</th>
              <th className="px-2 py-2 font-semibold border-b border-gray-200">Descripción</th>
              <th className="hidden sm:table-cell px-2 py-2 font-semibold border-b border-gray-200">Categoría</th>
              <th className="hidden sm:table-cell px-2 py-2 font-semibold border-b border-gray-200">Tipo</th>
              <th className="px-2 py-2 font-semibold border-b border-gray-200">Fecha</th>
              <th className="hidden sm:table-cell px-2 py-2 font-semibold border-b border-gray-200">Hora</th>
              <th className="hidden sm:table-cell px-2 py-2 font-semibold border-b border-gray-200">Turno</th>
              <th className="hidden sm:table-cell px-2 py-2 font-semibold border-b border-gray-200">Método Pago</th>
              <th className="hidden sm:table-cell px-2 py-2 font-semibold border-b border-gray-200">Usuario</th>
              <th className="px-2 py-2 font-semibold border-b border-gray-200">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {paginatedEgresos.map((e, idx) => (
              <tr key={e.id} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50 hover:bg-blue-50 transition"}>
                <td className="px-2 py-2 border-b border-gray-100">S/ {parseFloat(e.monto).toFixed(2)}</td>
                <td className="px-2 py-2 border-b border-gray-100">{e.descripcion}</td>
                <td className="hidden sm:table-cell px-2 py-2 border-b border-gray-100">{e.categoria}</td>
                <td className="hidden sm:table-cell px-2 py-2 border-b border-gray-100">{e.tipo_egreso}</td>
                <td className="px-2 py-2 border-b border-gray-100">{e.fecha}</td>
                <td className="hidden sm:table-cell px-2 py-2 border-b border-gray-100">{e.hora}</td>
                <td className="hidden sm:table-cell px-2 py-2 border-b border-gray-100">{e.turno}</td>
                <td className="hidden sm:table-cell px-2 py-2 border-b border-gray-100">{e.metodo_pago}</td>
                <td className="hidden sm:table-cell px-2 py-2 border-b border-gray-100">{e.usuario_nombre || '-'}</td>
                <td className="px-2 py-2 flex gap-2 justify-center border-b border-gray-100">
                  <button
                    className="p-1 rounded hover:bg-yellow-100 text-yellow-700"
                    title="Editar"
                    onClick={() => onEdit && onEdit(e)}
                  >
                    <span role="img" aria-label="Editar" className="text-lg">✏️</span>
                  </button>
                  <button
                    className="p-1 rounded hover:bg-red-100 text-red-700"
                    title="Eliminar"
                    onClick={() => handleDelete(e.id)}
                  >
                    <span role="img" aria-label="Eliminar" className="text-lg">🗑️</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Paginación */}
      <div className="flex flex-col sm:flex-row justify-between items-center mt-4 gap-2 sm:gap-4">
        <div className="text-xs sm:text-sm text-gray-700">
          Página {page} de {totalPages}
        </div>
        <div className="flex gap-2">
          <button
            className="px-3 py-1 rounded bg-blue-100 text-blue-700 font-semibold shadow hover:bg-blue-200 transition disabled:opacity-60 text-xs sm:text-sm"
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
          >Anterior</button>
          <button
            className="px-3 py-1 rounded bg-blue-100 text-blue-700 font-semibold shadow hover:bg-blue-200 transition disabled:opacity-60 text-xs sm:text-sm"
            disabled={page === totalPages}
            onClick={() => setPage(page + 1)}
          >Siguiente</button>
        </div>
      </div>
      {loading && <div className="mt-4 text-blue-600">Cargando...</div>}
      {!loading && egresosFiltrados.length === 0 && <div className="mt-4 text-gray-500">No hay egresos registrados.</div>}
    </div>
  );
});
export default EgresosList;
