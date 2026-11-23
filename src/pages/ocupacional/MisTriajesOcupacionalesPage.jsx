import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { listarOrdenesOcupacionalesPaginado } from "../../api/ocupacionalApi";

function badgeEstado(estado) {
  const key = String(estado || "").toLowerCase();
  if (key === "cerrada") return "border-slate-300 bg-slate-100 text-slate-700";
  if (key === "completada") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (key === "en_proceso") return "border-cyan-200 bg-cyan-50 text-cyan-800";
  if (key === "anulada") return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-amber-200 bg-amber-50 text-amber-800";
}

function badgeTriaje(finalizado) {
  return finalizado
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : "border-amber-200 bg-amber-50 text-amber-800";
}

function fmtFecha(v) {
  const s = String(v || "").trim();
  if (!s) return "-";
  const only = s.slice(0, 10);
  const m = only.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return s;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export default function MisTriajesOcupacionalesPage() {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ page: 1, per_page: 20, total: 0, total_pages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [q, setQ] = useState("");
  const [estado, setEstado] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [page, setPage] = useState(1);

  const canPrev = page > 1;
  const canNext = page < Number(meta?.total_pages || 0);

  const filtrosActivos = useMemo(
    () => ({ q: String(q || "").trim(), estado, fechaDesde, fechaHasta, page }),
    [q, estado, fechaDesde, fechaHasta, page]
  );

  useEffect(() => {
    let cancelled = false;

    async function cargar() {
      setLoading(true);
      setError("");
      try {
        const response = await listarOrdenesOcupacionalesPaginado({
          q: filtrosActivos.q,
          estado: filtrosActivos.estado,
          fechaDesde: filtrosActivos.fechaDesde,
          fechaHasta: filtrosActivos.fechaHasta,
          page: filtrosActivos.page,
          perPage: 20,
          soloTriaje: true,
        });
        if (cancelled) return;
        const data = Array.isArray(response?.data) ? response.data : [];
        setRows(data.filter((row) => Number(row?.triaje_detalle_id || 0) > 0));
        setMeta(response?.meta || { page: 1, per_page: 20, total: 0, total_pages: 0 });
      } catch (err) {
        if (cancelled) return;
        setRows([]);
        setMeta({ page: 1, per_page: 20, total: 0, total_pages: 0 });
        setError(err?.message || "No se pudo cargar triajes ocupacionales");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    cargar();
    return () => {
      cancelled = true;
    };
  }, [filtrosActivos]);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#ecfeff_100%)] p-4 sm:p-6">
      <div className="mx-auto max-w-[1400px] space-y-4">
        <header className="rounded-xl border border-cyan-200 bg-white p-4 shadow-sm sm:p-5">
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Mis triajes ocupacionales</h1>
          <p className="mt-1 text-sm text-slate-600">Panel dedicado de enfermería para registrar signos vitales (TRI_0001) en órdenes ocupacionales.</p>
        </header>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-label="Filtros de triajes ocupacionales">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <label className="text-xs font-semibold text-slate-700">
              Buscar
              <input
                className="mt-1 h-10 w-full rounded border border-slate-300 px-3 text-sm outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                value={q}
                onChange={(event) => {
                  setQ(event.target.value);
                  setPage(1);
                }}
                placeholder="Código orden, documento o protocolo"
              />
            </label>

            <label className="text-xs font-semibold text-slate-700">
              Estado
              <select
                className="mt-1 h-10 w-full rounded border border-slate-300 px-3 text-sm outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                value={estado}
                onChange={(event) => {
                  setEstado(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">Todos</option>
                <option value="emitida">Emitida</option>
                <option value="en_proceso">En proceso</option>
                <option value="completada">Completada</option>
                <option value="cerrada">Cerrada</option>
              </select>
            </label>

            <label className="text-xs font-semibold text-slate-700">
              Fecha desde
              <input
                type="date"
                className="mt-1 h-10 w-full rounded border border-slate-300 px-3 text-sm outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                value={fechaDesde}
                onChange={(event) => {
                  setFechaDesde(event.target.value);
                  setPage(1);
                }}
              />
            </label>

            <label className="text-xs font-semibold text-slate-700">
              Fecha hasta
              <input
                type="date"
                className="mt-1 h-10 w-full rounded border border-slate-300 px-3 text-sm outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                value={fechaHasta}
                onChange={(event) => {
                  setFechaHasta(event.target.value);
                  setPage(1);
                }}
              />
            </label>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white shadow-sm" aria-label="Listado de triajes ocupacionales">
          {loading ? <p className="p-5 text-sm text-cyan-700">Cargando triajes ocupacionales...</p> : null}
          {!loading && error ? <p className="p-5 text-sm text-rose-700">{error}</p> : null}
          {!loading && !error && rows.length === 0 ? <p className="p-5 text-sm text-slate-600">No hay triajes ocupacionales para los filtros seleccionados.</p> : null}

          {!loading && !error && rows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-[980px] w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
                    <th className="px-3 py-2">Orden</th>
                    <th className="px-3 py-2">Fecha</th>
                    <th className="px-3 py-2">Paciente</th>
                    <th className="px-3 py-2">Documento</th>
                    <th className="px-3 py-2">Puesto</th>
                    <th className="px-3 py-2">Estado orden</th>
                    <th className="px-3 py-2">Estado triaje</th>
                    <th className="px-3 py-2">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const triajeDetalleId = Number(row?.triaje_detalle_id || 0);
                    return (
                      <tr key={row.id} className="border-b border-slate-100 align-top">
                        <td className="px-3 py-3 font-semibold text-slate-900">{row.codigo || "-"}</td>
                        <td className="px-3 py-3 text-slate-700">{fmtFecha(row.fecha_orden)}</td>
                        <td className="px-3 py-3 text-slate-700">{row.paciente_nombre_completo || "-"}</td>
                        <td className="px-3 py-3 text-slate-700">{row.documento_numero || "-"}</td>
                        <td className="px-3 py-3 text-slate-700">{row.puesto_trabajo || "-"}</td>
                        <td className="px-3 py-3">
                          <span className={`inline-flex rounded border px-2 py-1 text-xs font-semibold ${badgeEstado(row.estado)}`}>
                            {String(row.estado || "emitida").replace("_", " ")}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <span className={`inline-flex rounded border px-2 py-1 text-xs font-semibold ${badgeTriaje(Boolean(row.triaje_finalizado))}`}>
                            {row.triaje_finalizado ? "Finalizado" : "Pendiente"}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          {triajeDetalleId > 0 ? (
                            <Link
                              to={`/mis-triajes-ocupacionales/${row.id}/examen/${triajeDetalleId}`}
                              className="inline-flex h-9 items-center rounded border border-cyan-300 px-3 text-xs font-semibold text-cyan-800 hover:bg-cyan-50"
                            >
                              Abrir triaje
                            </Link>
                          ) : (
                            <span className="text-xs text-slate-500">Sin triaje</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}

          <footer className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-xs text-slate-600">
            <p>
              Total: <span className="font-semibold text-slate-900">{Number(meta?.total || 0)}</span>
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="h-8 rounded border border-slate-300 px-3 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                onClick={() => canPrev && setPage((p) => p - 1)}
                disabled={!canPrev || loading}
              >
                Anterior
              </button>
              <span className="min-w-20 text-center">Página {Number(meta?.page || page)} / {Math.max(1, Number(meta?.total_pages || 1))}</span>
              <button
                type="button"
                className="h-8 rounded border border-slate-300 px-3 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                onClick={() => canNext && setPage((p) => p + 1)}
                disabled={!canNext || loading}
              >
                Siguiente
              </button>
            </div>
          </footer>
        </section>
      </div>
    </main>
  );
}
