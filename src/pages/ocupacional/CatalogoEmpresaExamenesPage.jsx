import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  listarEmpresasOcupacionales,
  listarCatalogoEmpresaExamenesPaginado,
  actualizarCatalogoEmpresaExamen,
  obtenerImpactoCatalogoEmpresaExamen,
} from "../../api/ocupacionalApi";

export default function CatalogoEmpresaExamenesPage() {
  const [empresas, setEmpresas] = useState([]);
  const [empresaId, setEmpresaId] = useState(0);

  const [estadoCatalogo, setEstadoCatalogo] = useState("todos");
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");

  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(50);
  const [meta, setMeta] = useState({ page: 1, per_page: 50, total: 0, total_pages: 0 });

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [updatingKey, setUpdatingKey] = useState("");
  const requestRef = useRef(0);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setQDebounced(q.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(t);
  }, [q]);

  const cargarEmpresas = useCallback(async () => {
    try {
      const data = await listarEmpresasOcupacionales({ estado: "activo" });
      setEmpresas(data);
      setEmpresaId((actual) => actual || (data.length > 0 ? Number(data[0].id) : 0));
    } catch (err) {
      setError(err.message || "No se pudo cargar empresas");
    }
  }, []);

  useEffect(() => {
    cargarEmpresas();
  }, [cargarEmpresas]);

  const cargarCatalogo = useCallback(async () => {
    if (!empresaId) {
      setRows([]);
      setMeta({ page: 1, per_page: perPage, total: 0, total_pages: 0 });
      return;
    }

    const requestId = ++requestRef.current;
    setLoading(true);
    setError("");
    try {
      const payload = await listarCatalogoEmpresaExamenesPaginado({
        empresaId,
        estadoCatalogo,
        q: qDebounced,
        page,
        perPage,
      });
      if (requestId !== requestRef.current) {
        return;
      }
      setRows(payload.data || []);
      setMeta(payload.meta || { page: 1, per_page: perPage, total: 0, total_pages: 0 });
      return payload;
    } catch (err) {
      if (requestId === requestRef.current) {
        setError(err.message || "No se pudo cargar catalogo");
      }
    } finally {
      if (requestId === requestRef.current) {
        setLoading(false);
      }
    }
  }, [empresaId, estadoCatalogo, qDebounced, page, perPage]);

  useEffect(() => {
    cargarCatalogo();
  }, [cargarCatalogo]);

  const empresaSeleccionada = useMemo(
    () => empresas.find((e) => Number(e.id) === Number(empresaId)) || null,
    [empresas, empresaId]
  );

  const onToggle = async (item) => {
    const key = `${item.examen_id}`;
    setUpdatingKey(key);
    setError("");
    const nuevoEstado = !item.habilitado;

    try {
      if (!nuevoEstado) {
        const impacto = await obtenerImpactoCatalogoEmpresaExamen({
          empresaId,
          examenId: item.examen_id,
        });
        const protocolos = Number(impacto.protocolos_configurados || 0);
        const montos = Number(impacto.montos_configurados || 0);
        const condiciones = Number(impacto.condiciones_configuradas || 0);
        const confirmado = window.confirm(
          `Desactivar ${item.descripcion}?\n\n` +
          `Protocolos configurados: ${protocolos}\n` +
          `Montos configurados: ${montos}\n` +
          `Condiciones: ${condiciones}\n\n` +
          "Dejara de aparecer en protocolos y ordenes nuevas. La configuracion se conservara para una posible reactivacion."
        );
        if (!confirmado) return;
      }

      await actualizarCatalogoEmpresaExamen({
        empresaId,
        examenId: item.examen_id,
        habilitado: nuevoEstado,
      });
      const payload = await cargarCatalogo();
      const paginas = Number(payload?.meta?.total_pages || 0);
      if (paginas > 0 && page > paginas) {
        setPage(paginas);
      }
    } catch (err) {
      setError(err.message || "No se pudo actualizar catalogo");
    } finally {
      setUpdatingKey("");
    }
  };

  const totalPages = Number(meta.total_pages || 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Salud Ocupacional - Catalogo por Empresa</h1>
        <p className="text-sm text-slate-600 mt-1">
          Active o desactive examenes para cada empresa, replicando el flujo clasico de catalogo.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-4">
          <select
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={empresaId}
            onChange={(e) => {
              setEmpresaId(Number(e.target.value || 0));
              setPage(1);
            }}
          >
            <option value={0}>Seleccione empresa</option>
            {empresas.map((item) => (
              <option key={item.id} value={item.id}>
                {item.razon_social} ({item.ruc})
              </option>
            ))}
          </select>

          <input
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="Buscar por codigo, descripcion, grupo o subgrupo"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />

          <select
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={estadoCatalogo}
            onChange={(e) => {
              setEstadoCatalogo(e.target.value);
              setPage(1);
            }}
          >
            <option value="todos">Todos</option>
            <option value="activo">Solo activos en catalogo</option>
            <option value="inactivo">Solo inactivos/no asignados</option>
          </select>

          <select
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={perPage}
            onChange={(e) => {
              setPerPage(Number(e.target.value));
              setPage(1);
            }}
          >
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
          </select>
        </div>

        {empresaSeleccionada ? (
          <p className="text-xs text-slate-600">
            Empresa seleccionada: <span className="font-semibold">{empresaSeleccionada.razon_social}</span>
          </p>
        ) : (
          <p className="text-xs text-amber-700">Seleccione una empresa para gestionar su catalogo.</p>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        {loading ? <p className="text-sm text-slate-500">Cargando catalogo...</p> : null}
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
                <th className="py-2 pr-3">Estado Catalogo</th>
                <th className="py-2 pr-3">Activar</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => {
                const key = `${item.examen_id}`;
                const busy = updatingKey === key;
                return (
                  <tr key={item.examen_id} className="border-b last:border-0">
                    <td className="py-2 pr-3 font-semibold text-slate-700">{item.codigo}</td>
                    <td className="py-2 pr-3">{item.descripcion}</td>
                    <td className="py-2 pr-3">{item.grupo || "-"}</td>
                    <td className="py-2 pr-3">{item.subgrupo || "-"}</td>
                    <td className="py-2 pr-3">S/ {Number(item.precio || 0).toFixed(2)}</td>
                    <td className="py-2 pr-3">
                      <span className={`rounded-full px-2 py-1 text-xs ${item.habilitado ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700"}`}>
                        {item.habilitado ? "activo" : "inactivo"}
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      <button
                        type="button"
                        disabled={busy || !empresaId}
                        onClick={() => onToggle(item)}
                        className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                          item.habilitado
                            ? "bg-emerald-600 text-white hover:bg-emerald-700"
                            : "bg-slate-300 text-slate-700 hover:bg-slate-400"
                        } disabled:opacity-50`}
                      >
                        {busy ? "Guardando..." : item.habilitado ? "ON" : "OFF"}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!loading && rows.length === 0 ? (
                <tr>
                  <td className="py-3 text-slate-500" colSpan={7}>No hay examenes para mostrar.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="md:hidden space-y-3">
          {rows.map((item) => {
            const key = `${item.examen_id}`;
            const busy = updatingKey === key;
            return (
              <div key={item.examen_id} className="rounded-lg border border-slate-200 p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs text-slate-500">{item.codigo}</p>
                    <p className="text-sm font-semibold text-slate-800">{item.descripcion}</p>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-xs ${item.habilitado ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700"}`}>
                    {item.habilitado ? "activo" : "inactivo"}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
                  <p><span className="font-semibold">Grupo:</span> {item.grupo || "-"}</p>
                  <p><span className="font-semibold">Subgrupo:</span> {item.subgrupo || "-"}</p>
                  <p><span className="font-semibold">Precio:</span> S/ {Number(item.precio || 0).toFixed(2)}</p>
                </div>

                <button
                  type="button"
                  disabled={busy || !empresaId}
                  onClick={() => onToggle(item)}
                  className={`w-full rounded px-3 py-2 text-xs font-semibold ${
                    item.habilitado
                      ? "bg-emerald-600 text-white hover:bg-emerald-700"
                      : "bg-slate-300 text-slate-700 hover:bg-slate-400"
                  } disabled:opacity-50`}
                >
                  {busy ? "Guardando..." : item.habilitado ? "Desactivar examen" : "Activar examen"}
                </button>
              </div>
            );
          })}
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
