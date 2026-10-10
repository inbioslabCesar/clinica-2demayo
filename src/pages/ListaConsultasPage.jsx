import { authFetch } from "../utils/apiClient";
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BASE_URL } from "../config/config";
import QuickAccessNav from "../components/comunes/QuickAccessNav";

function formatDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDaysHorizon(fechaHasta) {
  const hasta = String(fechaHasta || "").trim();
  if (!hasta) return 30;

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const to = new Date(`${hasta}T00:00:00`);
  if (Number.isNaN(to.getTime())) return 30;

  const diffMs = to.getTime() - hoy.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return Math.max(1, Math.min(365, diffDays + 1));
}

function inDateRange(value, desde, hasta) {
  const ymd = String(value || "").trim().slice(0, 10);
  if (!ymd) return false;
  if (desde && ymd < desde) return false;
  if (hasta && ymd > hasta) return false;
  return true;
}

function estadoBadgeClasses(estadoRaw) {
  const estado = String(estadoRaw || "").toLowerCase().trim();
  if (["completada", "completado", "atendida", "atendido"].includes(estado)) return "bg-emerald-100 text-emerald-800";
  if (["cancelada", "cancelado", "anulada", "anulado"].includes(estado)) return "bg-rose-100 text-rose-800";
  if (estado === "falta_cancelar") return "bg-amber-100 text-amber-800";
  return "bg-sky-100 text-sky-800";
}

function origenLabel(origenRaw) {
  const origen = String(origenRaw || "").toLowerCase().trim();
  if (origen === "agenda_servicio") return "Agenda";
  if (origen === "cotizador") return "Cotizador";
  if (origen === "hc_proxima") return "HC próxima";
  if (origen === "reservada_sin_turno") return "Reservada sin turno";
  return "Consulta";
}

function estadoCobroLabel(estadoCotizacionRaw, saldoRaw) {
  const estadoCot = String(estadoCotizacionRaw || "").toLowerCase().trim();
  const saldo = Number(saldoRaw || 0);
  if (saldo > 0.00001) return "Con saldo";
  if (["pagado", "pagada", "control", "completado", "completada"].includes(estadoCot)) return "Pagado";
  if (!estadoCot) return "Sin cobro";
  return estadoCot;
}

function normalizarConsultaPura(row) {
  return {
    ...row,
    consulta_id_ref: Number(row?.id || 0),
    estado_consulta: String(row?.estado || "").trim(),
    estado_gestion: "-",
    origen_consulta: "consulta",
    cotizacion_estado: null,
    saldo_pendiente: 0,
  };
}

export default function ListaConsultasPage() {
  const navigate = useNavigate();
  const [consultas, setConsultas] = useState([]);
  const [totalRows, setTotalRows] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [fechaDesde, setFechaDesde] = useState(formatDateInput(new Date()));
  const [fechaHasta, setFechaHasta] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [busquedaDebounced, setBusquedaDebounced] = useState("");
  const [allRows, setAllRows] = useState([]);
  const [modoVista, setModoVista] = useState("operativa");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setBusquedaDebounced(busqueda.trim());
    }, 350);
    return () => window.clearTimeout(timer);
  }, [busqueda]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    if (modoVista === "operativa") {
      const params = new URLSearchParams({
        tipo_recordatorio: "citas",
        dias: String(getDaysHorizon(fechaHasta)),
        busqueda: busquedaDebounced,
        _t: String(Date.now()),
      });

      authFetch(`${BASE_URL}api_recordatorios_citas.php?${params.toString()}`, {
        credentials: "include",
        signal: controller.signal,
      })
        .then((res) => res.json())
        .then((data) => {
          if (!data?.success) {
            setError(data?.error || "Error al cargar consultas");
            setAllRows([]);
            setConsultas([]);
            setTotalRows(0);
            return;
          }

          const items = Array.isArray(data.items) ? data.items : [];
          const desde = String(fechaDesde || "").trim();
          const hasta = String(fechaHasta || "").trim();
          const filtrados = items.filter((it) => inDateRange(it?.fecha, desde, hasta));

          setAllRows(filtrados);
          setTotalRows(filtrados.length);
        })
        .catch((err) => {
          if (err?.name === "AbortError") return;
          setError("Error de conexión con el servidor");
          setAllRows([]);
          setConsultas([]);
          setTotalRows(0);
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setLoading(false);
          }
        });
    } else {
      const params = new URLSearchParams({
        page: String(page),
        per_page: String(rowsPerPage),
        search: busquedaDebounced,
        fecha_desde: fechaDesde,
        fecha_hasta: fechaHasta,
        _t: String(Date.now()),
      });

      authFetch(`${BASE_URL}api_consultas.php?${params.toString()}`, {
        credentials: "include",
        signal: controller.signal,
      })
        .then((res) => res.json())
        .then((data) => {
          if (!data?.success) {
            setError(data?.error || "Error al cargar consultas");
            setAllRows([]);
            setConsultas([]);
            setTotalRows(0);
            return;
          }

          const rows = Array.isArray(data.consultas) ? data.consultas.map(normalizarConsultaPura) : [];
          setAllRows([]);
          setConsultas(rows);
          setTotalRows(Number(data?.pagination?.total ?? data?.total ?? rows.length ?? 0));
        })
        .catch((err) => {
          if (err?.name === "AbortError") return;
          setError("Error de conexión con el servidor");
          setAllRows([]);
          setConsultas([]);
          setTotalRows(0);
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setLoading(false);
          }
        });
    }

    return () => controller.abort();
  }, [busquedaDebounced, fechaDesde, fechaHasta, modoVista, page, rowsPerPage]);

  useEffect(() => {
    if (modoVista !== "operativa") return;
    const totalPagesLocal = Math.max(1, Math.ceil(totalRows / rowsPerPage));
    if (page > totalPagesLocal) {
      setPage(totalPagesLocal);
      return;
    }
    const offset = (page - 1) * rowsPerPage;
    setConsultas(allRows.slice(offset, offset + rowsPerPage));
  }, [allRows, modoVista, page, rowsPerPage, totalRows]);

  useEffect(() => {
    setPage(1);
  }, [modoVista]);

  const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage));

  const exportRows = useMemo(() => (
    modoVista === "operativa" ? allRows : consultas
  ), [allRows, consultas, modoVista]);

  const exportarExcel = async () => {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.json_to_sheet(
      exportRows.map((c) => ({
        ID: c.id,
        Fecha: `${String(c.fecha || "")} ${String(c.hora || "").slice(0, 5)}`.trim(),
        Paciente: `${c.paciente_nombre || ""} ${c.paciente_apellido || ""}`.trim(),
        Medico: `${c.medico_nombre || ""} ${c.medico_apellido || ""}`.trim(),
        Estado: c.estado_consulta || "",
        "Estado gestión": c.estado_gestion || "",
        Origen: origenLabel(c.origen_consulta),
        Cobro: estadoCobroLabel(c.cotizacion_estado, c.saldo_pendiente),
      }))
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Consultas");
    const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([excelBuffer], { type: "application/octet-stream" });
    const fecha = new Date().toISOString().slice(0, 10);
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${modoVista === "operativa" ? "consultas_operativas" : "consultas_puras"}_${fecha}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportarPDF = async () => {
    const jsPDF = (await import("jspdf")).default;
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF();
    doc.text(modoVista === "operativa" ? "Lista de Consultas Operativas" : "Lista de Consultas Puras", 14, 10);
    autoTable(doc, {
      head: [["ID", "Fecha", "Paciente", "Médico", "Estado", "Gestión", "Origen", "Cobro"]],
      body: exportRows.map((c) => [
        c.id,
        `${String(c.fecha || "")} ${String(c.hora || "").slice(0, 5)}`.trim(),
        `${c.paciente_nombre || ""} ${c.paciente_apellido || ""}`.trim(),
        `${c.medico_nombre || ""} ${c.medico_apellido || ""}`.trim(),
        c.estado_consulta || "",
        c.estado_gestion || "",
        origenLabel(c.origen_consulta),
        estadoCobroLabel(c.cotizacion_estado, c.saldo_pendiente),
      ]),
      startY: 18,
      styles: { fontSize: 8.5 },
      headStyles: { fillColor: [59, 130, 246] },
    });
    const fecha = new Date().toISOString().slice(0, 10);
    doc.save(`${modoVista === "operativa" ? "consultas_operativas" : "consultas_puras"}_${fecha}.pdf`);
  };

  const goEditar = (row) => {
    const pacienteId = Number(row?.paciente_id || 0);
    const consultaIdRef = Number(row?.consulta_id_ref || 0);
    const consultaId = Number(row?.id || 0);
    const cotizacionId = Number(row?.cotizacion_id || 0);
    const origen = String(row?.origen_consulta || "").trim().toLowerCase();

    if (origen === "agenda_servicio") {
      if (consultaIdRef > 0 && pacienteId > 0) {
        navigate(`/agendar-consulta?paciente_id=${pacienteId}&consulta_id=${consultaIdRef}`);
        return;
      }
      if (cotizacionId > 0) {
        navigate(`/cotizaciones?cotizacion_id=${cotizacionId}`);
        return;
      }
    }

    if (pacienteId > 0 && consultaId > 0) {
      navigate(`/agendar-consulta?paciente_id=${pacienteId}&consulta_id=${consultaId}`);
      return;
    }

    if (cotizacionId > 0) {
      navigate(`/cotizaciones?cotizacion_id=${cotizacionId}`);
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-3 md:p-4">
      <div
        className="rounded-2xl border px-4 py-5 shadow-sm md:px-6"
        style={{
          borderColor: "var(--color-primary-light)",
          background: "linear-gradient(120deg, var(--color-primary-light), #ffffff, color-mix(in srgb, var(--color-accent) 18%, white))",
        }}
      >
        <h1 className="text-center text-2xl font-extrabold tracking-tight md:text-3xl" style={{ color: "var(--color-primary-dark)" }}>
          Lista de Consultas
        </h1>
        <p className="mt-1 text-center text-sm" style={{ color: "color-mix(in srgb, var(--color-primary-dark) 70%, #334155)" }}>
          {modoVista === "operativa"
            ? "Vista operativa alineada con Recordatorios y Atenciones"
            : "Vista de consultas puras (tabla de consultas)"}
        </p>
      </div>

      <QuickAccessNav keys={["pacientes", "recordatorios", "cotizaciones", "reporteCaja"]} />

      <div className="rounded-2xl border bg-white p-3 shadow-sm md:p-4" style={{ borderColor: "var(--color-primary-light)" }}>
        <div className="mb-3 flex flex-wrap gap-2">
          <button
            onClick={() => setModoVista("operativa")}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${modoVista === "operativa" ? "text-white" : "text-slate-700 hover:bg-slate-100"}`}
            style={modoVista === "operativa"
              ? { backgroundColor: "var(--color-primary)", borderColor: "var(--color-primary)" }
              : { borderColor: "var(--color-primary-light)", backgroundColor: "white" }}
          >
            Ver vista operativa unificada
          </button>
          <button
            onClick={() => setModoVista("puras")}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${modoVista === "puras" ? "text-white" : "text-slate-700 hover:bg-slate-100"}`}
            style={modoVista === "puras"
              ? { backgroundColor: "var(--color-secondary)", borderColor: "var(--color-secondary)" }
              : { borderColor: "var(--color-primary-light)", backgroundColor: "white" }}
          >
            Ver solo consultas puras
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
          <div className="xl:col-span-1">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-primary-dark)" }}>
              Filas
            </label>
            <select
              value={rowsPerPage}
              onChange={(e) => {
                setRowsPerPage(Number(e.target.value));
                setPage(1);
              }}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </div>

          <div className="xl:col-span-2">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-primary-dark)" }}>
              Búsqueda
            </label>
            <input
              type="text"
              value={busqueda}
              onChange={(e) => {
                setBusqueda(e.target.value);
                setPage(1);
              }}
              placeholder="Paciente, médico, DNI, teléfono o ID"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="xl:col-span-1">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-primary-dark)" }}>
              Desde
            </label>
            <input
              type="date"
              value={fechaDesde}
              onChange={(e) => {
                setFechaDesde(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="xl:col-span-1">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-primary-dark)" }}>
              Hasta
            </label>
            <input
              type="date"
              value={fechaHasta}
              onChange={(e) => {
                setFechaHasta(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="flex items-end gap-2 xl:col-span-1">
            {(fechaDesde || fechaHasta || busqueda) && (
              <button
                onClick={() => {
                  setFechaDesde(formatDateInput(new Date()));
                  setFechaHasta("");
                  setBusqueda("");
                  setPage(1);
                }}
                className="w-full rounded-lg border px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
                style={{ borderColor: "var(--color-primary-light)", backgroundColor: "color-mix(in srgb, var(--color-primary-light) 65%, white)" }}
              >
                Limpiar
              </button>
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={exportarExcel}
            className="rounded-lg px-3 py-2 text-xs font-semibold text-white transition"
            style={{ backgroundColor: "var(--color-secondary)" }}
          >
            Exportar Excel
          </button>
          <button
            onClick={exportarPDF}
            className="rounded-lg px-3 py-2 text-xs font-semibold text-white transition"
            style={{ backgroundColor: "var(--color-primary)" }}
          >
            Exportar PDF
          </button>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-600 shadow-sm">
          Cargando consultas...
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-center text-rose-700 shadow-sm">
          {error}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="overflow-hidden rounded-2xl border bg-white shadow-sm" style={{ borderColor: "var(--color-primary-light)" }}>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs md:text-sm">
                <thead className="text-white" style={{ backgroundColor: "var(--color-primary)" }}>
                  <tr>
                    <th className="px-3 py-3 text-left font-semibold">ID</th>
                    <th className="px-3 py-3 text-left font-semibold">Fecha</th>
                    <th className="px-3 py-3 text-left font-semibold">Paciente</th>
                    <th className="px-3 py-3 text-left font-semibold">Médico</th>
                    <th className="px-3 py-3 text-left font-semibold">Estado</th>
                    <th className="px-3 py-3 text-left font-semibold">Gestión</th>
                    <th className="px-3 py-3 text-left font-semibold">Origen</th>
                    <th className="px-3 py-3 text-left font-semibold">Cobro</th>
                    <th className="px-3 py-3 text-center font-semibold">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {consultas.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-3 py-8 text-center text-slate-500">
                        No hay consultas en el rango seleccionado
                      </td>
                    </tr>
                  ) : (
                    consultas.map((c) => (
                      <tr key={`${String(c.origen_consulta || "consulta")}-${Number(c.id || 0)}`} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="px-3 py-3 font-semibold" style={{ color: "var(--color-primary-dark)" }}>{c.id}</td>
                        <td className="px-3 py-3 text-slate-600">
                          {String(c.fecha || "").trim()} {String(c.hora || "").slice(0, 5)}
                        </td>
                        <td className="px-3 py-3 font-medium text-slate-700">
                          {c.paciente_nombre} {c.paciente_apellido}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-col gap-1">
                            <span
                              className="inline-block w-fit rounded-full px-3 py-1 text-xs font-semibold"
                              style={{ backgroundColor: "var(--color-primary-light)", color: "var(--color-primary-dark)" }}
                            >
                              {c.medico_nombre} {c.medico_apellido}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${estadoBadgeClasses(c.estado_consulta)}`}>
                            {String(c.estado_consulta || "").trim() || "-"}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <span className="inline-block rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-800">
                            {String(c.estado_gestion || "").trim() || "-"}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-slate-700">
                          {origenLabel(c.origen_consulta)}
                        </td>
                        <td className="px-3 py-3 text-slate-700">
                          {estadoCobroLabel(c.cotizacion_estado, c.saldo_pendiente)}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <button
                            onClick={() => goEditar(c)}
                            className="rounded-md px-3 py-1.5 text-xs font-semibold text-white transition"
                            style={{ backgroundColor: "var(--color-primary)" }}
                          >
                            Editar
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-col gap-2 rounded-2xl border bg-white p-3 shadow-sm md:flex-row md:items-center md:justify-between" style={{ borderColor: "var(--color-primary-light)" }}>
            <span className="text-xs text-slate-600 md:text-sm">
              Mostrando {consultas.length} registro(s) de {totalRows}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Anterior
              </button>
              <span
                className="rounded-md px-3 py-1.5 text-sm font-semibold"
                style={{ backgroundColor: "var(--color-primary-light)", color: "var(--color-primary-dark)" }}
              >
                Página {page} de {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Siguiente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
