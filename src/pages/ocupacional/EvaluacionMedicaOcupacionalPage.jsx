import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FiActivity,
  FiAlertTriangle,
  FiCheckCircle,
  FiChevronLeft,
  FiChevronRight,
  FiCircle,
  FiClock,
  FiEye,
  FiFileText,
  FiHeart,
  FiRefreshCw,
  FiSearch,
  FiUser,
} from "react-icons/fi";
import {
  listarOrdenesOcupacionalesPaginado,
  obtenerDetalleOrdenOcupacional,
} from "../../api/ocupacionalApi";
import { APP_BASE_PATH } from "../../config/config";

const ESTADO_EXPANDIDO_STORAGE_KEY = "ocupacional_evaluacion_estado_expandido";

const APTITUD_LABELS = {
  APTO: "Apto",
  APTO_CON_RESTRICCIONES: "Apto con restricciones",
  NO_APTO: "No apto",
};

const SEMAFORO = {
  pendiente: {
    label: "Sin atender",
    shortLabel: "Pendiente",
    dot: "bg-red-500",
    badge: "border-red-200 bg-red-50 text-red-700",
    icon: FiCircle,
  },
  en_proceso: {
    label: "En proceso",
    shortLabel: "En proceso",
    dot: "bg-amber-500",
    badge: "border-amber-200 bg-amber-50 text-amber-800",
    icon: FiClock,
  },
  realizado: {
    label: "Finalizado",
    shortLabel: "Finalizado",
    dot: "bg-emerald-500",
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
    icon: FiCheckCircle,
  },
  observado: {
    label: "Observado",
    shortLabel: "Observado",
    dot: "bg-rose-700",
    badge: "border-rose-300 bg-rose-100 text-rose-800",
    icon: FiAlertTriangle,
  },
};

function estadoClinicoDetalle(item) {
  if (String(item?.estado_ejecucion || "") === "observado") return "observado";
  if (String(item?.estado_ejecucion || "") === "realizado" && item?.resultado_finalizado) return "realizado";
  if (["en_proceso", "realizado"].includes(String(item?.estado_ejecucion || ""))) return "en_proceso";
  return "pendiente";
}

function EstadoClinicoLista({ row, compact = false, expanded = false, onToggle = null }) {
  const items = Array.isArray(row?.estado_clinico_items) ? row.estado_clinico_items : [];
  if (items.length === 0) {
    return <span className="text-xs text-slate-500">Sin exámenes</span>;
  }

  const maxItemsBase = compact ? 4 : 7;
  const maxItems = expanded ? items.length : maxItemsBase;
  const visibles = items.slice(0, maxItems);
  const restantes = Math.max(0, items.length - maxItemsBase);
  const puedeAlternar = !compact && restantes > 0 && typeof onToggle === "function";

  return (
    <div className="min-w-[240px] space-y-1">
      {visibles.map((item) => {
        const estado = String(item?.estado || "pendiente");
        const config = SEMAFORO[estado] || SEMAFORO.pendiente;
        return (
          <div key={`${row?.id || 0}-${item?.detalle_id || 0}`} className="flex items-center gap-2 text-[11px] leading-4">
            <i className={`h-2 w-2 shrink-0 rounded-full ${config.dot}`} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-slate-700" title={item?.examen_descripcion || ""}>{item?.examen_descripcion || "Examen"}</span>
            <span className="shrink-0 text-[10px] font-semibold text-slate-500">{config.shortLabel}</span>
          </div>
        );
      })}
      {puedeAlternar ? (
        <button
          type="button"
          className="text-[10px] font-semibold text-cyan-700 hover:text-cyan-800"
          onClick={onToggle}
        >
          {expanded ? "Mostrar menos" : `+${restantes} más`}
        </button>
      ) : null}
    </div>
  );
}

function iconoExamen(item) {
  const text = `${item?.examen_codigo || ""} ${item?.examen_descripcion || ""} ${item?.examen_grupo || ""}`.toLowerCase();
  if (text.includes("oftal") || text.includes("vision")) return <FiEye aria-hidden="true" />;
  if (text.includes("card") || text.includes("electro") || text.includes("ekg")) return <FiHeart aria-hidden="true" />;
  if (text.includes("triaje") || text.includes("signos") || text.includes("audio")) return <FiActivity aria-hidden="true" />;
  if (text.includes("medic") || text.includes("historia")) return <FiUser aria-hidden="true" />;
  return <FiFileText aria-hidden="true" />;
}

function examTextLower(item) {
  return `${item?.examen_codigo || ""} ${item?.examen_descripcion || ""} ${item?.examen_grupo || ""} ${item?.examen_subgrupo || ""}`.toLowerCase();
}

function isLaboratorioExam(item) {
  const text = examTextLower(item);
  return ["laboratorio", "hemograma", "glucosa", "bioquim", "toxico", "inmuno", "serolog", "uroanal", "parasito", "microbio"].some((key) => text.includes(key));
}

function isPsicologiaExam(item) {
  const text = examTextLower(item);
  return ["psico", "epworth", "fobia", "estres"].some((key) => text.includes(key));
}

function mergeEstadoForGroup(items) {
  if (!Array.isArray(items) || items.length === 0) return "pendiente";
  const estados = items.map((it) => estadoClinicoDetalle(it));
  if (estados.includes("observado")) return "observado";
  if (estados.every((st) => st === "realizado")) return "realizado";
  if (estados.some((st) => st === "en_proceso" || st === "realizado")) return "en_proceso";
  return "pendiente";
}

function pickTargetExam(items) {
  if (!Array.isArray(items) || items.length === 0) return null;
  const firstPending = items.find((it) => {
    const st = estadoClinicoDetalle(it);
    return st === "pendiente" || st === "en_proceso";
  });
  return firstPending || items[0] || null;
}

function basePath(path) {
  const prefix = APP_BASE_PATH === "/" ? "" : APP_BASE_PATH.replace(/\/$/, "");
  return `${prefix}${path}`;
}

export default function EvaluacionMedicaOcupacionalPage() {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ page: 1, per_page: 20, total: 0, total_pages: 0 });
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [queryDebounced, setQueryDebounced] = useState("");
  const [estado, setEstado] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState(0);
  const [selectedDetail, setSelectedDetail] = useState(null);
  const [estadoExpandidoPorOrden, setEstadoExpandidoPorOrden] = useState({});
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const requestRef = useRef(0);
  const detailRequestRef = useRef(0);
  const detailCacheRef = useRef(new Map());

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(ESTADO_EXPANDIDO_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        setEstadoExpandidoPorOrden(parsed);
      }
    } catch (_) {
      // Ignore malformed storage and continue with in-memory defaults.
    }
  }, []);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(
        ESTADO_EXPANDIDO_STORAGE_KEY,
        JSON.stringify(estadoExpandidoPorOrden || {})
      );
    } catch (_) {
      // Ignore storage write failures (private mode/quota) without breaking UX.
    }
  }, [estadoExpandidoPorOrden]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setQueryDebounced(query.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timeoutId);
  }, [query]);

  const cargarOrdenes = useCallback(async () => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setError("");
    try {
      const result = await listarOrdenesOcupacionalesPaginado({
        q: queryDebounced,
        estado,
        fechaDesde,
        fechaHasta,
        page,
        perPage: 20,
      });
      if (requestId !== requestRef.current) return;
      setRows(result.data || []);
      setMeta(result.meta || { page: 1, per_page: 20, total: 0, total_pages: 0 });
    } catch (err) {
      if (requestId === requestRef.current) setError(err.message || "No se pudo cargar la bandeja clínica");
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [estado, fechaDesde, fechaHasta, page, queryDebounced]);

  useEffect(() => {
    cargarOrdenes();
  }, [cargarOrdenes]);

  useEffect(() => {
    if (selectedId > 0 && !rows.some((row) => Number(row.id) === Number(selectedId))) {
      setSelectedId(0);
      setSelectedDetail(null);
    }
  }, [rows, selectedId]);

  const selectedRow = useMemo(
    () => rows.find((row) => Number(row.id) === Number(selectedId)) || null,
    [rows, selectedId]
  );

  const examenesCabecera = useMemo(() => {
    const items = Array.isArray(selectedDetail?.items) ? selectedDetail.items : [];
    if (items.length === 0) return [];

    const labs = items.filter(isLaboratorioExam);
    const psico = items.filter(isPsicologiaExam);
    const used = new Set([...labs, ...psico].map((it) => Number(it?.id || 0)));
    const otros = items.filter((it) => !used.has(Number(it?.id || 0)));

    const output = [];

    if (labs.length > 0) {
      const target = pickTargetExam(labs);
      if (target) {
        const ordenId = Number(selectedRow?.id || 0);
        const labPanelHref = ordenId > 0
          ? basePath(`/panel-laboratorio?orden_id=${ordenId}`)
          : basePath("/panel-laboratorio");
        output.push({
          key: "grupo-lab",
          item: target,
          label: "Laboratorio",
          status: mergeEstadoForGroup(labs),
          icon: "🧪",
          total: labs.length,
          href: labPanelHref,
        });
      }
    }

    if (psico.length > 0) {
      const target = pickTargetExam(psico);
      if (target) {
        output.push({
          key: "grupo-psico",
          item: target,
          label: "Psicología",
          status: mergeEstadoForGroup(psico),
          icon: "🧠",
          total: psico.length,
        });
      }
    }

    otros.forEach((it) => {
      output.push({
        key: `detalle-${it.id}`,
        item: it,
        label: it.examen_descripcion || it.examen_codigo || "Examen",
        status: estadoClinicoDetalle(it),
        icon: null,
        total: 1,
        href: null,
      });
    });

    return output;
  }, [selectedDetail]);

  const seleccionarOrden = useCallback(async (row) => {
    const orderId = Number(row?.id || 0);
    if (orderId <= 0) return;
    setSelectedId(orderId);
    setDetailError("");
    const cached = detailCacheRef.current.get(orderId);
    if (cached) {
      setSelectedDetail(cached);
      return;
    }
    const requestId = ++detailRequestRef.current;
    setDetailLoading(true);
    setSelectedDetail(null);
    try {
      const detail = await obtenerDetalleOrdenOcupacional(orderId);
      if (requestId !== detailRequestRef.current) return;
      detailCacheRef.current.set(orderId, detail);
      setSelectedDetail(detail);
    } catch (err) {
      if (requestId === detailRequestRef.current) setDetailError(err.message || "No se pudieron cargar los exámenes");
    } finally {
      if (requestId === detailRequestRef.current) setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    const refreshOnFocus = () => {
      detailCacheRef.current.clear();
      if (selectedRow) seleccionarOrden(selectedRow);
    };
    window.addEventListener("focus", refreshOnFocus);
    return () => window.removeEventListener("focus", refreshOnFocus);
  }, [selectedRow, seleccionarOrden]);

  const urlExamen = (item) => {
    if (!selectedRow?.id || !item?.id) return "#";
    return basePath(`/salud-ocupacional/evaluacion-medica/${selectedRow.id}/examen/${item.id}`);
  };

  const limpiarFiltros = () => {
    setQuery("");
    setQueryDebounced("");
    setEstado("");
    setFechaDesde("");
    setFechaHasta("");
    setPage(1);
  };

  const toggleEstadoClinicoExpandido = (ordenId) => {
    const id = Number(ordenId || 0);
    if (id <= 0) return;
    setEstadoExpandidoPorOrden((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#ecfeff_100%)] px-3 py-4 sm:px-5 lg:px-7">
      <div className="mx-auto max-w-[1680px] space-y-4">
        <header className="border-b border-cyan-200 pb-4">
          <p className="text-xs font-semibold uppercase text-cyan-700">Salud ocupacional</p>
          <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Evaluación médica ocupacional</h1>
              <p className="mt-1 text-sm text-slate-600">Bandeja clínica de exámenes asignados por protocolo.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600" aria-label="Leyenda del semáforo">
              {Object.entries(SEMAFORO).map(([key, config]) => (
                <span key={key} className="inline-flex items-center gap-1.5"><i className={`h-2.5 w-2.5 rounded-full ${config.dot}`} />{config.label}</span>
              ))}
            </div>
          </div>
        </header>

        <section className="border-y border-slate-200 bg-white px-3 py-3 shadow-sm sm:px-4" aria-label="Filtros de evaluación médica">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(260px,1fr)_180px_160px_160px_auto]">
            <label className="relative block">
              <span className="sr-only">Buscar orden</span>
              <FiSearch className="pointer-events-none absolute left-3 top-3 text-slate-400" />
              <input className="h-10 w-full rounded border border-slate-300 pl-9 pr-3 text-sm outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar paciente, documento o empresa" />
            </label>
            <select className="h-10 rounded border border-slate-300 px-3 text-sm" value={estado} onChange={(event) => { setEstado(event.target.value); setPage(1); }} aria-label="Filtrar por estado de orden">
              <option value="">Todos los estados</option>
              <option value="emitida">Emitida</option>
              <option value="en_proceso">En proceso</option>
              <option value="completada">Completada</option>
              <option value="cerrada">Cerrada</option>
              <option value="anulada">Anulada</option>
            </select>
            <input type="date" className="h-10 rounded border border-slate-300 px-3 text-sm" value={fechaDesde} onChange={(event) => { setFechaDesde(event.target.value); setPage(1); }} aria-label="Fecha desde" />
            <input type="date" className="h-10 rounded border border-slate-300 px-3 text-sm" value={fechaHasta} onChange={(event) => { setFechaHasta(event.target.value); setPage(1); }} aria-label="Fecha hasta" />
            <button type="button" className="inline-flex h-10 items-center justify-center gap-2 rounded border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50" onClick={limpiarFiltros}><FiRefreshCw />Limpiar</button>
          </div>
        </section>

        <section className="border-y border-cyan-200 bg-white px-3 py-3 shadow-sm sm:px-4" aria-label="Acciones de la orden seleccionada">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="min-w-0 lg:w-72 lg:shrink-0">
              <p className="text-[11px] font-semibold uppercase text-slate-500">Orden seleccionada</p>
              <p className="truncate text-sm font-semibold text-slate-900">{selectedRow ? `${selectedRow.codigo} · ${selectedRow.paciente_nombre_completo}` : "Seleccione una fila"}</p>
              {selectedRow ? <p className="truncate text-[11px] text-slate-500">{selectedRow.protocolo_descripcion || "Sin protocolo"}</p> : null}
            </div>
            <div className="flex min-h-12 flex-1 items-center gap-2 overflow-x-auto pb-1" role="toolbar" aria-label="Exámenes de la orden seleccionada">
              {!selectedRow ? <p className="text-sm text-slate-500">Los accesos clínicos aparecerán aquí.</p> : null}
              {detailLoading ? <p className="text-sm text-cyan-700">Cargando protocolo...</p> : null}
              {detailError ? <p className="text-sm text-red-700">{detailError}</p> : null}
              {examenesCabecera.map((entry) => {
                const status = entry.status;
                const disabled = selectedRow.estado === "anulada";
                return (
                  <a
                    key={entry.key}
                    href={disabled ? undefined : (entry.href || urlExamen(entry.item))}
                    className={`relative flex h-12 min-w-[150px] max-w-[220px] shrink-0 items-center gap-2 rounded-md border px-3 ${SEMAFORO[status].badge} ${disabled ? "cursor-not-allowed opacity-40" : ""}`}
                    aria-disabled={disabled}
                    title={`${entry.label}: ${SEMAFORO[status].label}`}
                    aria-label={`Abrir ${entry.label}. ${SEMAFORO[status].label}`}
                  >
                    <span className="shrink-0 text-lg">{entry.icon || iconoExamen(entry.item)}</span>
                    <span className="min-w-0 text-left">
                      <span className="block truncate text-xs font-semibold">{entry.label}</span>
                      <span className="block text-[10px] font-medium opacity-80">{SEMAFORO[status].shortLabel}</span>
                    </span>
                    {entry.total > 1 ? (
                      <span className="rounded bg-white/80 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">
                        {entry.total}
                      </span>
                    ) : null}
                    <i className={`absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white ${SEMAFORO[status].dot}`} />
                  </a>
                );
              })}
            </div>
          </div>
        </section>

        {error ? <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

        <div className="min-w-0">
          <section className="min-w-0 bg-white shadow-sm" aria-labelledby="lista-evaluaciones-title">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <h2 id="lista-evaluaciones-title" className="font-semibold text-slate-900">Lista de evaluaciones médicas</h2>
                <p className="text-xs text-slate-500">{meta.total} órdenes encontradas</p>
              </div>
              {loading ? <span className="text-xs font-medium text-cyan-700">Actualizando...</span> : null}
            </div>

            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[1050px] border-collapse text-xs">
                <thead className="bg-slate-100 text-left text-[11px] uppercase text-slate-600">
                  <tr>
                    <th className="px-3 py-3">#</th>
                    <th className="px-3 py-3">Empresa</th>
                    <th className="px-3 py-3">Paciente</th>
                    <th className="px-3 py-3">Tipo</th>
                    <th className="px-3 py-3">Aptitud</th>
                    <th className="px-3 py-3">Restricción</th>
                    <th className="px-3 py-3">Fecha</th>
                    <th className="px-3 py-3">Estado clínico</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr
                      key={row.id}
                      className={`cursor-pointer border-b border-slate-200 align-top outline-none hover:bg-cyan-50 focus:bg-cyan-50 ${Number(selectedId) === Number(row.id) ? "bg-cyan-100/80 ring-1 ring-inset ring-cyan-500" : ""}`}
                      onClick={() => seleccionarOrden(row)}
                      onKeyDown={(event) => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); seleccionarOrden(row); } }}
                      tabIndex={0}
                      aria-selected={Number(selectedId) === Number(row.id)}
                    >
                      <td className="px-3 py-3 text-slate-500">{(page - 1) * 20 + index + 1}</td>
                      <td className="max-w-44 px-3 py-3 font-medium text-slate-800">{row.empresa || "-"}</td>
                      <td className="px-3 py-3"><p className="font-semibold text-slate-900">{row.paciente_nombre_completo || "-"}</p><p className="mt-0.5 text-slate-500">{row.documento_numero || "Sin documento"}</p></td>
                      <td className="px-3 py-3"><p className="font-medium text-slate-800">{row.tipo_codigo || "-"}</p><p className="mt-0.5 text-slate-500">{row.codigo}</p></td>
                      <td className="px-3 py-3"><span className="font-medium text-slate-800">{APTITUD_LABELS[row.aptitud_final] || row.aptitud_final || "Pendiente"}</span></td>
                      <td className="max-w-48 px-3 py-3 text-slate-700">{row.restriccion_final || "Sin restricciones"}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-slate-700">{row.fecha_orden || "-"}</td>
                      <td className="px-3 py-3">
                        <EstadoClinicoLista
                          row={row}
                          expanded={Boolean(estadoExpandidoPorOrden[row.id])}
                          onToggle={(event) => {
                            event.stopPropagation();
                            toggleEstadoClinicoExpandido(row.id);
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-slate-200 lg:hidden">
              {rows.map((row) => (
                <button key={row.id} type="button" className={`w-full px-4 py-4 text-left ${Number(selectedId) === Number(row.id) ? "bg-cyan-50 ring-1 ring-inset ring-cyan-500" : "bg-white"}`} onClick={() => seleccionarOrden(row)} aria-pressed={Number(selectedId) === Number(row.id)}>
                  <div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-slate-900">{row.paciente_nombre_completo || "-"}</p><p className="text-xs text-slate-500">{row.codigo} · {row.documento_numero || "Sin documento"}</p></div><span className="text-xs font-medium text-slate-600">{row.fecha_orden}</span></div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs"><p><span className="block text-slate-500">Empresa</span>{row.empresa || "-"}</p><p><span className="block text-slate-500">Tipo</span>{row.tipo_codigo || "-"}</p><p><span className="block text-slate-500">Aptitud</span>{APTITUD_LABELS[row.aptitud_final] || row.aptitud_final || "Pendiente"}</p><p><span className="block text-slate-500">Restricción</span>{row.restriccion_final || "Sin restricciones"}</p></div>
                  <div className="mt-3">
                    <p className="mb-1 text-[11px] font-semibold uppercase text-slate-500">Estado clínico</p>
                    <EstadoClinicoLista row={row} compact />
                  </div>
                </button>
              ))}
            </div>

            {!loading && rows.length === 0 ? <p className="px-4 py-10 text-center text-sm text-slate-500">No hay evaluaciones para los filtros seleccionados.</p> : null}
            <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
              <span className="text-xs text-slate-500">Página {meta.page || page} de {Math.max(1, Number(meta.total_pages || 1))}</span>
              <div className="flex gap-2">
                <button type="button" className="flex h-9 w-9 items-center justify-center rounded border border-slate-300 text-slate-700 disabled:opacity-40" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1} aria-label="Página anterior"><FiChevronLeft /></button>
                <button type="button" className="flex h-9 w-9 items-center justify-center rounded border border-slate-300 text-slate-700 disabled:opacity-40" onClick={() => setPage((current) => current + 1)} disabled={page >= Number(meta.total_pages || 1)} aria-label="Página siguiente"><FiChevronRight /></button>
              </div>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}