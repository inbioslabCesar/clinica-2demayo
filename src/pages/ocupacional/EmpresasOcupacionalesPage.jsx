import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  reactivarEmpresaOcupacional,
  inactivarEmpresaOcupacional,
  listarEmpresasOcupacionalesPaginado,
  prevalidarInactivarEmpresaOcupacional,
} from "../../api/ocupacionalApi";
import FormEmpresa from "./FormEmpresa";

const FILTERS_STORAGE_KEY = "ocupacional_empresas_filtros_v1";

function readStoredFilters() {
  const defaults = {
    estado: "todos",
    q: "",
    perPage: 20,
    sortBy: "razon_social",
    sortDir: "asc",
  };

  try {
    const raw = window.localStorage.getItem(FILTERS_STORAGE_KEY);
    if (!raw) {
      return defaults;
    }
    const parsed = JSON.parse(raw);
    const allowedEstado = new Set(["todos", "activo", "inactivo"]);
    const allowedSortBy = new Set(["razon_social", "ruc", "actividad", "estado", "created_at"]);
    const allowedSortDir = new Set(["asc", "desc"]);
    const allowedPerPage = new Set([10, 20, 50, 100]);

    const estado = allowedEstado.has(String(parsed?.estado || "")) ? String(parsed.estado) : defaults.estado;
    const q = String(parsed?.q || "");
    const perPageRaw = Number(parsed?.perPage || defaults.perPage);
    const perPage = allowedPerPage.has(perPageRaw) ? perPageRaw : defaults.perPage;
    const sortBy = allowedSortBy.has(String(parsed?.sortBy || "")) ? String(parsed.sortBy) : defaults.sortBy;
    const sortDir = allowedSortDir.has(String(parsed?.sortDir || "")) ? String(parsed.sortDir) : defaults.sortDir;

    return { estado, q, perPage, sortBy, sortDir };
  } catch {
    return defaults;
  }
}

export default function EmpresasOcupacionalesPage() {
  const navigate = useNavigate();
  const stored = readStoredFilters();
  const [estado, setEstado] = useState(stored.estado);
  const [q, setQ] = useState(stored.q);
  const [qDebounced, setQDebounced] = useState(stored.q.trim());
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(stored.perPage);
  const [sortBy, setSortBy] = useState(stored.sortBy);
  const [sortDir, setSortDir] = useState(stored.sortDir);
  const [meta, setMeta] = useState({ page: 1, per_page: 20, total: 0, total_pages: 0 });
  const [empresas, setEmpresas] = useState([]);
  const [editingEmpresa, setEditingEmpresa] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestRef = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => {
      setQDebounced(q.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        FILTERS_STORAGE_KEY,
        JSON.stringify({
          estado,
          q,
          perPage,
          sortBy,
          sortDir,
        })
      );
    } catch {
      // Ignore storage write errors (private mode or quota exceeded)
    }
  }, [estado, q, perPage, sortBy, sortDir]);

  const loadEmpresas = useCallback(async () => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setError("");
    try {
      const payload = await listarEmpresasOcupacionalesPaginado({
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
      setEmpresas(payload.data || []);
      setMeta(payload.meta || { page: 1, per_page: perPage, total: 0, total_pages: 0 });
    } catch (err) {
      if (requestId === requestRef.current) {
        setError(err.message || "No se pudo cargar empresas");
      }
    } finally {
      if (requestId === requestRef.current) {
        setLoading(false);
      }
    }
  }, [estado, qDebounced, page, perPage, sortBy, sortDir]);

  useEffect(() => {
    loadEmpresas();
  }, [loadEmpresas]);

  const onInactivar = async (id) => {
    if (!window.confirm("¿Desea iniciar inactivación segura de esta empresa?")) return;
    try {
      const pre = await prevalidarInactivarEmpresaOcupacional(id);
      const diag = pre?.diagnostico || {};
      const bloqueos = diag?.bloqueos || {};
      const totalBloqueos = Number(bloqueos.trabajadores_activos || 0)
        + Number(bloqueos.protocolos_activos || 0)
        + Number(bloqueos.ordenes_emitidas_o_en_proceso || 0);

      if (totalBloqueos > 0) {
        const detalle = [
          `Trabajadores activos: ${bloqueos.trabajadores_activos || 0}`,
          `Protocolos activos: ${bloqueos.protocolos_activos || 0}`,
          `Órdenes emitidas/en proceso: ${bloqueos.ordenes_emitidas_o_en_proceso || 0}`,
        ].join("\n");

        const force = window.confirm(
          `La empresa tiene dependencias activas:\n\n${detalle}\n\n` +
          `Si continúa, se aplicará inactivación con force. ¿Desea continuar?`
        );

        if (!force) return;
        await inactivarEmpresaOcupacional(id, { force: true });
      } else {
        await inactivarEmpresaOcupacional(id, { force: false });
      }

      await loadEmpresas();
    } catch (err) {
      const diag = err?.data?.diagnostico;
      if (diag?.bloqueos) {
        const b = diag.bloqueos;
        setError(
          `No se pudo inactivar. Bloqueos activos - ` +
          `Trabajadores: ${b.trabajadores_activos || 0}, ` +
          `Protocolos: ${b.protocolos_activos || 0}, ` +
          `Órdenes: ${b.ordenes_emitidas_o_en_proceso || 0}`
        );
        return;
      }
      setError(err.message || "No se pudo inactivar empresa");
    }
  };

  const onReactivar = async (id) => {
    if (!window.confirm("¿Desea reactivar esta empresa?")) return;
    try {
      await reactivarEmpresaOcupacional(id);
      await loadEmpresas();
      setError("");
    } catch (err) {
      setError(err.message || "No se pudo reactivar empresa");
    }
  };

  const handleCreated = () => {
    setPage(1);
    setEditingEmpresa(null);
    loadEmpresas();
  };

  const handleUpdated = () => {
    setEditingEmpresa(null);
    loadEmpresas();
  };

  const handleCancelEdit = () => {
    setEditingEmpresa(null);
  };

  const totalPages = Number(meta.total_pages || 0);

  const navegarAccionEmpresa = (destino, empresaId, context) => {
    const params = new URLSearchParams();
    params.set("empresa_id", String(empresaId));
    if (context) {
      params.set("context", context);
    }
    navigate(`${destino}?${params.toString()}`);
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Salud Ocupacional - Empresas</h1>
        <p className="text-sm text-slate-600 mt-1">Administre las empresas del subdominio ocupacional.</p>
      </div>
      <FormEmpresa
        mode={editingEmpresa ? "edit" : "create"}
        initialData={editingEmpresa}
        onCreated={handleCreated}
        onUpdated={handleUpdated}
        onCancel={handleCancelEdit}
      />

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 space-y-2">
          <h2 className="text-lg font-semibold text-slate-900">Listado de Empresas</h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <input
              className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-2 lg:col-span-1"
              placeholder="Buscar por RUC o razon social"
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
                <option value="razon_social">Razón social</option>
                <option value="ruc">RUC</option>
                <option value="actividad">Actividad</option>
                <option value="estado">Estado</option>
                <option value="created_at">Creación</option>
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

        {loading ? <p className="text-sm text-slate-500">Cargando empresas...</p> : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500">
                <th className="py-2 pr-3">RUC</th>
                <th className="py-2 pr-3">Razón social</th>
                <th className="py-2 pr-3">Actividad</th>
                <th className="py-2 pr-3">Contacto principal</th>
                <th className="py-2 pr-3">Email principal</th>
                <th className="py-2 pr-3">Ubicación</th>
                <th className="py-2 pr-3">Estado</th>
                <th className="py-2 pr-3">Creado</th>
                <th className="py-2 pr-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {empresas.map((item) => (
                <tr key={item.id} className="border-b last:border-0">
                  <td className="py-2 pr-3">{item.ruc}</td>
                  <td className="py-2 pr-3">
                    <div className="max-w-[16rem] truncate" title={item.razon_social}>{item.razon_social}</div>
                    {item.nombre_comercial ? (
                      <div className="text-xs text-slate-500 max-w-[16rem] truncate" title={item.nombre_comercial}>
                        {item.nombre_comercial}
                      </div>
                    ) : null}
                  </td>
                  <td className="py-2 pr-3">{item.actividad || "-"}</td>
                  <td className="py-2 pr-3">{item.contacto_1 || "-"}</td>
                  <td className="py-2 pr-3">{item.correo_1 || "-"}</td>
                  <td className="py-2 pr-3">
                    {[item.departamento, item.provincia, item.distrito].filter(Boolean).join(" / ") || "-"}
                  </td>
                  <td className="py-2 pr-3">
                    <span className={`rounded-full px-2 py-1 text-xs ${item.estado === "activo" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700"}`}>
                      {item.estado}
                    </span>
                  </td>
                  <td className="py-2 pr-3">{item.created_at || "-"}</td>
                  <td className="py-2 pr-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => navegarAccionEmpresa("/salud-ocupacional/catalogos-laborales", item.id, "area")}
                        title="Gestionar áreas de la empresa"
                        className="rounded bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                      >
                        Área
                      </button>

                      <button
                        type="button"
                        onClick={() => navegarAccionEmpresa("/salud-ocupacional/catalogos-laborales", item.id, "puesto")}
                        title="Gestionar puestos de la empresa"
                        className="rounded bg-cyan-600 px-2 py-1 text-xs font-semibold text-white hover:bg-cyan-700"
                      >
                        Puesto
                      </button>

                      <button
                        type="button"
                        onClick={() => navegarAccionEmpresa("/salud-ocupacional/protocolos", item.id, "protocolos")}
                        title="Gestionar protocolos de la empresa"
                        className="rounded bg-amber-500 px-2 py-1 text-xs font-semibold text-white hover:bg-amber-600"
                      >
                        Protocolo
                      </button>

                      <button
                        type="button"
                        onClick={() => setEditingEmpresa(item)}
                        className="rounded bg-sky-600 px-2 py-1 text-xs font-semibold text-white hover:bg-sky-700"
                      >
                        Editar
                      </button>

                      {item.estado === "activo" ? (
                        <button
                          type="button"
                          onClick={() => onInactivar(item.id)}
                          className="rounded bg-amber-500 px-2 py-1 text-xs font-semibold text-white hover:bg-amber-600"
                        >
                          Inactivar
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onReactivar(item.id)}
                          className="rounded bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                        >
                          Reactivar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && empresas.length === 0 ? (
                <tr>
                  <td className="py-3 text-slate-500" colSpan={9}>No hay empresas para mostrar.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
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
            <span className="text-xs text-slate-600">Pág. {page}/{Math.max(1, totalPages)}</span>
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
