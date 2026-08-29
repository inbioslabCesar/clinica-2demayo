import { useCallback, useEffect, useMemo, useState } from "react";
import { FiRefreshCw, FiScissors } from "react-icons/fi";
import Swal from "sweetalert2";
import Spinner from "../components/comunes/Spinner";
import { authFetch } from "../utils/apiClient";

const VISTA_LABEL = {
  pendientes: "Pendientes",
  hoy: "Hoy",
  atendidos: "Atendidos",
  todos: "Todos",
};

function nombrePaciente(item) {
  return [item?.paciente_nombre, item?.paciente_apellido].filter(Boolean).join(" ").trim() || "Paciente sin nombre";
}

function formatearFecha(fecha, hora = "") {
  const fechaTxt = String(fecha || "").trim();
  if (!fechaTxt) return "Sin fecha";
  const horaTxt = String(hora || "").trim();
  const input = horaTxt ? `${fechaTxt} ${horaTxt}` : fechaTxt;
  const normalizada = input.includes("T") ? input : input.replace(" ", "T");
  const d = new Date(normalizada);
  if (Number.isNaN(d.getTime())) {
    return horaTxt ? `${fechaTxt} ${horaTxt.slice(0, 5)}` : fechaTxt;
  }
  return d.toLocaleString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function claseEstadoPago(estado) {
  const e = String(estado || "").toLowerCase().trim();
  if (["pagado", "pagada", "control"].includes(e)) {
    return "bg-emerald-100 text-emerald-800";
  }
  if (["parcial"].includes(e)) {
    return "bg-amber-100 text-amber-800";
  }
  return "bg-rose-100 text-rose-700";
}

function claseEstadoAtencion(estado) {
  const e = String(estado || "").toLowerCase().trim();
  if (e === "atendido") return "bg-emerald-100 text-emerald-800";
  if (e === "en_proceso") return "bg-amber-100 text-amber-800";
  if (e === "no_realizado") return "bg-rose-100 text-rose-700";
  return "bg-slate-100 text-slate-700";
}

export default function MisProcedimientosPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filtroPago, setFiltroPago] = useState("pagadas");
  const [vista, setVista] = useState("pendientes");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(15);
  const [pagination, setPagination] = useState({ page: 1, limit: 15, total: 0, total_pages: 1 });
  const [stats, setStats] = useState({ pagadas: 0, no_pagadas: 0, sin_consulta_asociada: 0, pendientes: 0, atendidos: 0 });
  const [processingId, setProcessingId] = useState(0);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        filtro_pago: filtroPago,
        vista,
      });
      const q = search.trim();
      if (q) params.set("search", q);

      const res = await authFetch(`api_medico_procedimientos.php?${params.toString()}`);
      const data = await res.json();
      if (!data?.success) {
        throw new Error(data?.error || "No se pudo cargar procedimientos");
      }
      setItems(Array.isArray(data.items) ? data.items : []);
      setPagination(data.pagination || { page: 1, limit, total: 0, total_pages: 1 });
      setStats(data.stats || { pagadas: 0, no_pagadas: 0, sin_consulta_asociada: 0, pendientes: 0, atendidos: 0 });
    } catch (error) {
      setItems([]);
      Swal.fire("Error", error.message || "No se pudo cargar la lista de procedimientos.", "error");
    } finally {
      setLoading(false);
    }
  }, [filtroPago, limit, page, search, vista]);

  const actualizarEstadoAtencion = useCallback(async (item, siguienteEstado) => {
    const detalleId = Number(item?.detalle_id || 0);
    if (detalleId <= 0 || processingId > 0) return;
    setProcessingId(detalleId);
    try {
      const res = await authFetch("api_medico_procedimientos.php", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          detalle_id: detalleId,
          estado_atencion: siguienteEstado,
        }),
      });
      const data = await res.json();
      if (!data?.success) {
        throw new Error(data?.error || "No se pudo actualizar estado");
      }
      await cargar();
    } catch (error) {
      Swal.fire("Error", error.message || "No se pudo actualizar la atención del procedimiento.", "error");
    } finally {
      setProcessingId(0);
    }
  }, [cargar, processingId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === "visible") {
        cargar();
      }
    };
    const timer = window.setInterval(onFocus, 30000);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [cargar]);

  const totalPages = Math.max(1, Number(pagination?.total_pages || 1));
  const desde = useMemo(() => {
    if (pagination.total <= 0) return 0;
    return (Number(pagination.page || 1) - 1) * Number(pagination.limit || limit) + 1;
  }, [limit, pagination]);
  const hasta = useMemo(() => {
    if (pagination.total <= 0) return 0;
    return Math.min(pagination.total, desde + Number(pagination.limit || limit) - 1);
  }, [desde, limit, pagination]);

  return (
    <main className="min-h-full bg-slate-50 px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-5 flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-cyan-700">Panel médico</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-900">Mis Procedimientos</h1>
            <p className="mt-1 text-sm text-slate-600">Bandeja operativa para pendientes reales y control diario de atención de procedimientos.</p>
          </div>
          <button
            type="button"
            onClick={cargar}
            disabled={loading}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            <FiRefreshCw aria-hidden="true" /> Actualizar
          </button>
        </header>

        <section className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <article className="rounded-lg border border-cyan-200 bg-cyan-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-cyan-700">Pendientes</p>
            <p className="mt-1 text-2xl font-bold text-cyan-900">{Number(stats.pendientes || 0)}</p>
          </article>
          <article className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Atendidos</p>
            <p className="mt-1 text-2xl font-bold text-emerald-900">{Number(stats.atendidos || 0)}</p>
          </article>
          <article className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">No pagadas</p>
            <p className="mt-1 text-2xl font-bold text-amber-900">{Number(stats.no_pagadas || 0)}</p>
          </article>
        </section>

        <section className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {Object.entries(VISTA_LABEL).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => { setVista(key); setPage(1); }}
                className={`rounded-md px-3 py-2 text-sm font-medium ${vista === key ? "bg-slate-800 text-white" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        <section className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => { setFiltroPago("pagadas"); setPage(1); }}
              className={`rounded-md px-3 py-2 text-sm font-medium ${filtroPago === "pagadas" ? "bg-cyan-700 text-white" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"}`}
            >
              Solo pagadas
            </button>
            <button
              type="button"
              onClick={() => { setFiltroPago("todas"); setPage(1); }}
              className={`rounded-md px-3 py-2 text-sm font-medium ${filtroPago === "todas" ? "bg-cyan-700 text-white" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"}`}
            >
              Todas
            </button>
            <button
              type="button"
              onClick={() => { setFiltroPago("no_pagadas"); setPage(1); }}
              className={`rounded-md px-3 py-2 text-sm font-medium ${filtroPago === "no_pagadas" ? "bg-cyan-700 text-white" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"}`}
            >
              No pagadas
            </button>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Buscar por paciente, DNI, HC o procedimiento"
              className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none focus:border-cyan-600 sm:w-96"
            />
            <select
              value={limit}
              onChange={(e) => { setLimit(Number(e.target.value) || 15); setPage(1); }}
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none focus:border-cyan-600"
            >
              <option value={10}>10 filas</option>
              <option value={15}>15 filas</option>
              <option value={25}>25 filas</option>
              <option value={50}>50 filas</option>
            </select>
          </div>
        </section>

        {loading ? (
          <div className="py-16"><Spinner /></div>
        ) : items.length === 0 ? (
          <section className="border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
            <FiScissors className="mx-auto mb-3 text-3xl text-slate-400" />
            <h2 className="text-base font-semibold text-slate-800">Sin procedimientos para mostrar</h2>
            <p className="mt-1 text-sm text-slate-500">No se encontraron procedimientos con los filtros actuales.</p>
          </section>
        ) : (
          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-100">
                  <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                    <th className="px-4 py-3">Paciente</th>
                    <th className="px-4 py-3">Procedimiento</th>
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3">Consulta</th>
                    <th className="px-4 py-3">Cotización</th>
                    <th className="px-4 py-3">Atención</th>
                    <th className="px-4 py-3">Pago</th>
                    <th className="px-4 py-3 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm text-slate-700">
                  {items.map((it) => (
                    <tr key={it.detalle_id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900">{nombrePaciente(it)}</p>
                        <p className="text-xs text-slate-500">DNI: {it.dni || "No registrado"}</p>
                        <p className="text-xs text-slate-500">HC: {it.historia_clinica || "-"}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{it.procedimiento_nombre || "Procedimiento"}</p>
                        <p className="text-xs text-slate-500">ID servicio: {Number(it.servicio_id || 0) || "-"}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-700">
                        {formatearFecha(it.fecha_consulta || it.fecha_cotizacion, it.hora_consulta || "")}
                      </td>
                      <td className="px-4 py-3">
                        {Number(it.consulta_id || 0) > 0 ? (
                          <span className="inline-flex rounded-full bg-cyan-100 px-2 py-1 text-xs font-semibold text-cyan-800">#{Number(it.consulta_id || 0)}</span>
                        ) : (
                          <span className="inline-flex rounded-full bg-indigo-100 px-2 py-1 text-xs font-semibold text-indigo-800">Sin consulta</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-xs text-slate-700">#{Number(it.cotizacion_id || 0)}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${claseEstadoAtencion(it.estado_atencion)}`}>
                          {String(it.estado_atencion || "pendiente").replace("_", " ")}
                        </span>
                        {String(it.atendido_en || "").trim() && (
                          <p className="mt-1 text-[11px] text-slate-500">{formatearFecha(it.atendido_en)}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${claseEstadoPago(it.cotizacion_estado)}`}>
                          {String(it.cotizacion_estado || "pendiente")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {String(it.estado_atencion || "pendiente").toLowerCase().trim() === "atendido" ? (
                          <button
                            type="button"
                            disabled={processingId === Number(it.detalle_id || 0)}
                            onClick={() => actualizarEstadoAtencion(it, "pendiente")}
                            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                          >
                            Reabrir
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={processingId === Number(it.detalle_id || 0)}
                            onClick={() => actualizarEstadoAtencion(it, "atendido")}
                            className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                          >
                            Marcar atendido
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <footer className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">
            Mostrando {desde} - {hasta} de {Number(pagination.total || 0)} registros
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              Anterior
            </button>
            <span className="text-sm text-slate-600">Página {page} de {totalPages}</span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              Siguiente
            </button>
          </div>
        </footer>
      </div>
    </main>
  );
}
