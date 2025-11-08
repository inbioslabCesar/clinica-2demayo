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
      <div className="flex mb-4 gap-4 items-center">
        <input
          type="text"
          placeholder="Buscar por descripción o categoría"
          value={filtro}
          onChange={e => { setFiltro(e.target.value); setPage(1); }}
          className="input w-full max-w-xs"
        />
        <label className="ml-4 font-semibold">Filas por página:</label>
        <select
          value={rowsPerPage}
          onChange={e => { setRowsPerPage(Number(e.target.value)); setPage(1); }}
          className="input max-w-[80px]"
        >
          <option value={3}>3</option>
          <option value={5}>5</option>
          <option value={10}>10</option>
        </select>
          <label className="ml-4 font-semibold">Filtrar por fecha:</label>
          <input
            type="date"
            value={fechaFiltro}
            onChange={e => setFechaFiltro(e.target.value)}
            className="input max-w-[160px]"
          />
          <button
            className="btn btn-sm btn-secondary ml-2"
            onClick={() => setFechaFiltro("")}
            disabled={!fechaFiltro}
          >
            Limpiar fecha
          </button>
      </div>
      <table className="table-auto w-full border">
        <thead>
          <tr className="bg-gray-100">
            <th>Monto</th>
            <th>Descripción</th>
            <th>Categoría</th>
            <th>Tipo</th>
            <th>Fecha</th>
            <th>Hora</th>
            <th>Turno</th>
            <th>Método Pago</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {paginatedEgresos.map(e => (
            <tr key={e.id}>
              <td>S/ {parseFloat(e.monto).toFixed(2)}</td>
              <td>{e.descripcion}</td>
              <td>{e.categoria}</td>
              <td>{e.tipo_egreso}</td>
              <td>{e.fecha}</td>
              <td>{e.hora}</td>
              <td>{e.turno}</td>
              <td>{e.metodo_pago}</td>
              <td>
                <button className="btn btn-sm btn-warning mr-2" onClick={() => onEdit && onEdit(e)}>Editar</button>
                <button className="btn btn-sm btn-danger" onClick={() => handleDelete(e.id)}>Eliminar</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {/* Paginación */}
      <div className="flex justify-between items-center mt-4">
        <div>
          Página {page} de {totalPages}
        </div>
        <div className="flex gap-2">
          <button
            className="btn btn-sm"
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
          >Anterior</button>
          <button
            className="btn btn-sm"
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
