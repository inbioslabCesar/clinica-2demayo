import React, { useEffect, useState, forwardRef, useImperativeHandle } from "react";
import { authFetch } from "../../utils/apiClient";

const CATEGORIA_META = {
  pasaje: { label: "Pasaje", className: "bg-teal-50 text-teal-700 border-teal-200" },
  servicios: { label: "Servicios", className: "bg-amber-50 text-amber-700 border-amber-200" },
  sueldo: { label: "Sueldo", className: "bg-violet-50 text-violet-700 border-violet-200" },
  otros: { label: "Otros", className: "bg-slate-100 text-slate-600 border-slate-200" },
};

function CategoriaBadge({ categoria }) {
  if (!categoria) return <span className="text-slate-400">-</span>;
  const meta = CATEGORIA_META[categoria] || { label: categoria, className: "bg-slate-100 text-slate-600 border-slate-200" };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${meta.className}`}>
      {meta.label}
    </span>
  );
}

function TipoBadge({ tipo }) {
  if (!tipo) return <span className="text-slate-400">-</span>;
  const esOperativo = tipo === "operativo";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
        esOperativo ? "border-blue-200 bg-blue-50 text-blue-700" : "border-slate-200 bg-slate-100 text-slate-600"
      }`}
    >
      {esOperativo ? "Operativo" : tipo}
    </span>
  );
}

const EgresosList = forwardRef(function EgresosList({ onEdit }, ref) {
  const [egresos, setEgresos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
    const [filtro, setFiltro] = useState("");
    const [fechaFiltro, setFechaFiltro] = useState("");
  const [rowsPerPage, setRowsPerPage] = useState(3);
  const [page, setPage] = useState(1);
  const [expandedObs, setExpandedObs] = useState({});

  useEffect(() => {
    fetchEgresos();
    }, [fechaFiltro]);

  useImperativeHandle(ref, () => ({
    fetchEgresos,
    goFirstPage: () => setPage(1),
  }));

  const fetchEgresos = async (options = {}) => {
    const shouldResetPage = Boolean(options?.resetPage);
    if (shouldResetPage) {
      setPage(1);
    }
    setExpandedObs({});
    setLoading(true);
    setError("");
    try {
      let url = `api_egresos.php`;
      if (fechaFiltro) {
        url += `?fecha=${fechaFiltro}`;
      }
      const resp = await authFetch(url, {
        cache: 'no-store'
      });
      if (!resp.ok) {
        console.error(`Error fetching egresos: ${resp.status} ${resp.statusText}`);
        setEgresos([]);
        setError(`No se pudo cargar egresos (${resp.status})`);
        setLoading(false);
        return;
      }
      const data = await resp.json();
      setLoading(false);
      if (data.success) {
        setEgresos(data.egresos || []);
      } else {
        console.warn('API returned success=false:', data);
        setEgresos([]);
        setError(data.error || "No se pudo cargar egresos");
      }
    } catch (err) {
      console.error('Error fetching egresos:', err);
      setEgresos([]);
      setError("Error de conexion al cargar egresos");
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("¿Eliminar este egreso?")) return;
    setLoading(true);
    const resp = await authFetch(`api_egresos.php?id=${id}`, { method: "DELETE" });
    const data = await resp.json();
    setLoading(false);
    if (data.success) fetchEgresos();
    else alert(data.error || "Error al eliminar egreso");
  };

  const formatMonto = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n.toFixed(2) : "0.00";
  };

  const toggleObs = (id) => {
    setExpandedObs(prev => ({ ...prev, [id]: !prev[id] }));
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
    <div className="rounded-3xl border border-cyan-100 bg-white/90 p-4 shadow-xl backdrop-blur sm:p-6">
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-700">Historial</p>
          <h2 className="text-lg font-bold text-slate-900">Egresos registrados</h2>
        </div>
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-800">
          {egresosFiltrados.length} {egresosFiltrados.length === 1 ? "resultado" : "resultados"}
        </span>
      </div>

      <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-3 sm:flex-row sm:items-center sm:gap-4 sm:p-4">
        <div className="relative w-full sm:max-w-xs">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-slate-400">🔎</span>
          <input
            type="text"
            placeholder="Buscar por descripción o categoría"
            value={filtro}
            onChange={e => { setFiltro(e.target.value); setPage(1); }}
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-800 placeholder-slate-400 transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="whitespace-nowrap text-xs font-semibold text-slate-500">Filas:</label>
          <select
            value={rowsPerPage}
            onChange={e => { setRowsPerPage(Number(e.target.value)); setPage(1); setExpandedObs({}); }}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          >
            <option value={3}>3</option>
            <option value={5}>5</option>
            <option value={10}>10</option>
          </select>
        </div>
        <div className="flex flex-1 items-center gap-2 sm:justify-end">
          <label className="whitespace-nowrap text-xs font-semibold text-slate-500">Fecha:</label>
          <input
            type="date"
            value={fechaFiltro}
            onChange={e => setFechaFiltro(e.target.value)}
            className="max-w-[160px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
          <button
            className="rounded-xl bg-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-300 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => setFechaFiltro("")}
            disabled={!fechaFiltro}
          >
            Limpiar
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs sm:text-sm">
            <thead>
              <tr className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <th className="px-3 py-3 text-left font-semibold">ID</th>
                <th className="px-3 py-3 text-left font-semibold">Caja</th>
                <th className="px-3 py-3 text-left font-semibold">Monto</th>
                <th className="px-3 py-3 text-left font-semibold">Descripción</th>
                <th className="hidden px-3 py-3 text-left font-semibold sm:table-cell">Categoría</th>
                <th className="hidden px-3 py-3 text-left font-semibold sm:table-cell">Tipo</th>
                <th className="px-3 py-3 text-left font-semibold">Fecha</th>
                <th className="hidden px-3 py-3 text-left font-semibold sm:table-cell">Hora</th>
                <th className="hidden px-3 py-3 text-left font-semibold sm:table-cell">Turno</th>
                <th className="hidden px-3 py-3 text-left font-semibold sm:table-cell">Pago</th>
                <th className="hidden px-3 py-3 text-left font-semibold lg:table-cell">Observaciones</th>
                <th className="hidden px-3 py-3 text-left font-semibold sm:table-cell">Usuario</th>
                <th className="px-3 py-3 text-center font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedEgresos.map((e) => (
                <tr key={e.id} className="bg-white transition hover:bg-blue-50/60">
                  <td className="px-3 py-2.5 text-slate-500">{e.id ?? '-'}</td>
                  <td className="px-3 py-2.5 text-slate-500">{e.caja_id ?? '-'}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap font-bold text-rose-600">- S/ {formatMonto(e.monto)}</td>
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-slate-800">{e.descripcion || e.concepto || '-'}</div>
                    {(() => {
                      const obs = (e.observaciones || '').trim();
                      const hasObs = obs.length > 0;
                      const isExpanded = Boolean(expandedObs[e.id]);
                      const isLong = obs.length > 40;
                      const obsVisible = !hasObs ? '-' : (isExpanded || !isLong ? obs : `${obs.slice(0, 40)}...`);
                      return (
                        <div className="mt-1 text-[11px] text-slate-400 sm:hidden" title={obs}>
                          <span>Obs: {obsVisible}</span>
                          {hasObs && isLong && (
                            <button
                              type="button"
                              className="ml-2 font-semibold text-blue-600"
                              onClick={() => toggleObs(e.id)}
                            >
                              {isExpanded ? 'ver menos' : 'ver mas'}
                            </button>
                          )}
                        </div>
                      );
                    })()}
                  </td>
                  <td className="hidden px-3 py-2.5 sm:table-cell"><CategoriaBadge categoria={e.categoria} /></td>
                  <td className="hidden px-3 py-2.5 sm:table-cell"><TipoBadge tipo={e.tipo_egreso} /></td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-slate-600">{e.fecha || '-'}</td>
                  <td className="hidden px-3 py-2.5 text-slate-600 sm:table-cell">{e.hora || '-'}</td>
                  <td className="hidden px-3 py-2.5 capitalize text-slate-600 sm:table-cell">{e.turno || '-'}</td>
                  <td className="hidden px-3 py-2.5 capitalize text-slate-600 sm:table-cell">{e.metodo_pago || '-'}</td>
                  <td className="hidden max-w-[220px] truncate px-3 py-2.5 text-slate-500 lg:table-cell" title={e.observaciones || ''}>{e.observaciones || '-'}</td>
                  <td className="hidden px-3 py-2.5 text-slate-600 sm:table-cell">{e.usuario_nombre || '-'}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex justify-center gap-1.5">
                      <button
                        className="flex h-8 w-8 items-center justify-center rounded-full text-amber-600 transition hover:bg-amber-100"
                        title="Editar"
                        onClick={() => onEdit && onEdit(e)}
                      >
                        <span role="img" aria-label="Editar" className="text-base">✏️</span>
                      </button>
                      <button
                        className="flex h-8 w-8 items-center justify-center rounded-full text-rose-600 transition hover:bg-rose-100"
                        title="Eliminar"
                        onClick={() => handleDelete(e.id)}
                      >
                        <span role="img" aria-label="Eliminar" className="text-base">🗑️</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {loading && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm font-medium text-blue-600">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />
            Cargando...
          </div>
        )}
        {!loading && error && (
          <div className="py-8 text-center text-sm font-semibold text-rose-600">{error}</div>
        )}
        {!loading && !error && egresosFiltrados.length === 0 && (
          <div className="flex flex-col items-center gap-1 py-10 text-slate-400">
            <span className="text-3xl">🗂️</span>
            <span className="text-sm">No hay egresos registrados.</span>
          </div>
        )}
      </div>

      {/* Paginación */}
      <div className="mt-4 flex flex-col items-center justify-between gap-2 sm:flex-row">
        <div className="text-xs font-medium text-slate-500 sm:text-sm">
          Página <strong className="text-slate-700">{page}</strong> de {totalPages}
        </div>
        <div className="flex gap-2">
          <button
            className="rounded-full bg-blue-50 px-4 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
            disabled={page === 1}
            onClick={() => { setPage(page - 1); setExpandedObs({}); }}
          >← Anterior</button>
          <button
            className="rounded-full bg-blue-50 px-4 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
            disabled={page === totalPages}
            onClick={() => { setPage(page + 1); setExpandedObs({}); }}
          >Siguiente →</button>
        </div>
      </div>
    </div>
  );
});
export default EgresosList;
