import { useCallback, useEffect, useRef, useState } from "react";
import {
  inactivarExamenOcupacional,
  listarExamenesOcupacionalesPaginado,
} from "../../api/ocupacionalApi";
import FormExamenOcupacional from "./FormExamenOcupacional";

export default function ExamenesOcupacionalesPage() {
  const [estado, setEstado] = useState("activo");
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [sortBy, setSortBy] = useState("descripcion");
  const [sortDir, setSortDir] = useState("asc");
  const [meta, setMeta] = useState({ page: 1, per_page: 20, total: 0, total_pages: 0 });
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null);
  const requestRef = useRef(0);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setQDebounced(q.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(t);
  }, [q]);

  const loadRows = useCallback(async () => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setError("");
    try {
      const payload = await listarExamenesOcupacionalesPaginado({
        estado,
        q: qDebounced,
        page,
        perPage,
        sortBy,
        sortDir,
      });
      if (requestId !== requestRef.current) {
        return;
      }
      setRows(payload.data || []);
      setMeta(payload.meta || { page: 1, per_page: perPage, total: 0, total_pages: 0 });
    } catch (err) {
      if (requestId === requestRef.current) {
        setError(err.message || "No se pudo cargar examenes ocupacionales");
      }
    } finally {
      if (requestId === requestRef.current) {
        setLoading(false);
      }
    }
  }, [estado, qDebounced, page, perPage, sortBy, sortDir]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  const handleSaved = () => {
    setPage(1);
    setEditing(null);
    loadRows();
  };

  const handleInactivar = async (id) => {
    if (!window.confirm("Desea inactivar este examen general?")) return;
    try {
      await inactivarExamenOcupacional(id);
      await loadRows();
      if (editing && Number(editing.id) === Number(id)) {
        setEditing(null);
      }
    } catch (err) {
      setError(err.message || "No se pudo inactivar examen");
    }
  };

  const totalPages = Number(meta.total_pages || 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Salud Ocupacional - Examenes Generales</h1>
        <p className="text-sm text-slate-600 mt-1">Maestro de examenes ocupacionales alineado a la logica del sistema antiguo.</p>
      </div>

      <FormExamenOcupacional
        editing={editing}
        onSaved={handleSaved}
        onCancel={() => setEditing(null)}
      />

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 space-y-2">
          <h2 className="text-lg font-semibold text-slate-900">Listado de Examenes Generales</h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <input
              className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-2 lg:col-span-1"
              placeholder="Buscar por codigo, descripcion, grupo o subgrupo"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <select
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={estado}
              onChange={(e) => {
                setEstado(e.target.value);
                setPage(1);
              }}
            >
              <option value="todos">Todos</option>
              <option value="activo">Activos</option>
              <option value="inactivo">Inactivos</option>
            </select>
            <div className="flex gap-2">
              <select
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value);
                  setPage(1);
                }}
              >
                <option value="descripcion">Descripcion</option>
                <option value="codigo">Codigo</option>
                <option value="grupo">Grupo</option>
                <option value="precio">Precio</option>
                <option value="created_at">Creacion</option>
              </select>
              <select
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={sortDir}
                onChange={(e) => {
                  setSortDir(e.target.value);
                  setPage(1);
                }}
              >
                <option value="asc">↑</option>
                <option value="desc">↓</option>
              </select>
              <select
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={perPage}
                onChange={(e) => {
                  setPerPage(Number(e.target.value));
                  setPage(1);
                }}
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>
        </div>

        {loading ? <p className="text-sm text-slate-500">Cargando examenes...</p> : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <div className="overflow-x-auto hidden md:block">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500">
                <th className="py-2 pr-3">Codigo</th>
                <th className="py-2 pr-3">Descripcion</th>
                <th className="py-2 pr-3">Grupo</th>
                <th className="py-2 pr-3">Subgrupo</th>
                <th className="py-2 pr-3">Precio</th>
                <th className="py-2 pr-3">Posicion</th>
                <th className="py-2 pr-3">Estado</th>
                <th className="py-2 pr-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => (
                <tr key={item.id} className="border-b last:border-0">
                  <td className="py-2 pr-3 font-semibold text-slate-700">{item.codigo}</td>
                  <td className="py-2 pr-3">{item.descripcion}</td>
                  <td className="py-2 pr-3">{item.grupo || "-"}</td>
                  <td className="py-2 pr-3">{item.subgrupo || "-"}</td>
                  <td className="py-2 pr-3">S/ {Number(item.precio || 0).toFixed(2)}</td>
                  <td className="py-2 pr-3">{item.posicion ?? 0}</td>
                  <td className="py-2 pr-3">
                    <span className={`rounded-full px-2 py-1 text-xs ${item.estado === "activo" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700"}`}>
                      {item.estado}
                    </span>
                  </td>
                  <td className="py-2 pr-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setEditing(item)}
                        className="rounded bg-blue-600 px-2 py-1 text-xs font-semibold text-white hover:bg-blue-700"
                      >
                        Editar
                      </button>
                      {item.estado === "activo" ? (
                        <button
                          type="button"
                          onClick={() => handleInactivar(item.id)}
                          className="rounded bg-amber-500 px-2 py-1 text-xs font-semibold text-white hover:bg-amber-600"
                        >
                          Inactivar
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && rows.length === 0 ? (
                <tr>
                  <td className="py-3 text-slate-500" colSpan={8}>No hay examenes para mostrar.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="md:hidden space-y-3">
          {rows.map((item) => (
            <div key={item.id} className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs text-slate-500">{item.codigo}</p>
                  <p className="text-sm font-semibold text-slate-800">{item.descripcion}</p>
                </div>
                <span className={`rounded-full px-2 py-1 text-xs ${item.estado === "activo" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700"}`}>
                  {item.estado}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600">
                <p><span className="font-semibold">Grupo:</span> {item.grupo || "-"}</p>
                <p><span className="font-semibold">Subgrupo:</span> {item.subgrupo || "-"}</p>
                <p><span className="font-semibold">Precio:</span> S/ {Number(item.precio || 0).toFixed(2)}</p>
                <p><span className="font-semibold">Posicion:</span> {item.posicion ?? 0}</p>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(item)}
                  className="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  Editar
                </button>
                {item.estado === "activo" ? (
                  <button
                    type="button"
                    onClick={() => handleInactivar(item.id)}
                    className="rounded bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600"
                  >
                    Inactivar
                  </button>
                ) : null}
              </div>
            </div>
          ))}
          {!loading && rows.length === 0 ? <p className="text-sm text-slate-500">No hay examenes para mostrar.</p> : null}
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-slate-500">Total: {meta.total || 0} registros</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded border border-slate-300 px-3 py-1 text-xs disabled:opacity-50"
              disabled={loading || page <= 1}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            >
              Anterior
            </button>
            <span className="text-xs text-slate-600">Pag. {page}/{Math.max(1, totalPages)}</span>
            <button
              type="button"
              className="rounded border border-slate-300 px-3 py-1 text-xs disabled:opacity-50"
              disabled={loading || page >= totalPages}
              onClick={() => setPage((prev) => prev + 1)}
            >
              Siguiente
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
