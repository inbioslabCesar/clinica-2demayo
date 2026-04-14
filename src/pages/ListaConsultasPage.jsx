import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BASE_URL } from "../config/config";
import QuickAccessNav from "../components/comunes/QuickAccessNav";
// Lazy loading de librerías pesadas para exportar

export default function ListaConsultasPage() {
  const navigate = useNavigate();
  const [consultas, setConsultas] = useState([]);
  const [totalRows, setTotalRows] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(3);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [busquedaDebounced, setBusquedaDebounced] = useState("");

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
    const params = new URLSearchParams({
      page,
      per_page: rowsPerPage,
      search: busquedaDebounced,
      fecha_desde: fechaDesde,
      fecha_hasta: fechaHasta
    });
    fetch(`${BASE_URL}api_consultas.php?${params.toString()}`, {
      credentials: "include",
      signal: controller.signal,
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setConsultas(data.consultas || []);
          setTotalRows(data.pagination?.total || data.total || 0);
        } else {
          setError(data.error || "Error al cargar consultas");
        }
        setLoading(false);
      })
      .catch((err) => {
        if (err?.name === "AbortError") return;
        setError("Error de conexión con el servidor");
        setLoading(false);
      });

    return () => controller.abort();
  }, [page, rowsPerPage, busquedaDebounced, fechaDesde, fechaHasta]);

  // Filtrar por rango de fecha y búsqueda dinámica
  // Los datos ya vienen filtrados y paginados del backend
  const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage));
  const pagedConsultas = consultas;

  // Exportar a Excel con lazy loading
  const exportarExcel = async () => {
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.json_to_sheet(
      consultas.map((c) => ({
        ID: c.id,
        Fecha: c.fecha?.slice(0, 16).replace("T", " "),
        Paciente: c.paciente_nombre + " " + c.paciente_apellido,
        Medico: c.medico_nombre + " " + c.medico_apellido,
        Especialidad: c.medico_especialidad || "",
        Estado: c.estado,
      }))
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Consultas");
    const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([excelBuffer], { type: "application/octet-stream" });
    const fecha = new Date().toISOString().slice(0, 10);
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `consultas_${fecha}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Exportar a PDF con lazy loading
  const exportarPDF = async () => {
    const jsPDF = (await import('jspdf')).default;
    const autoTable = (await import('jspdf-autotable')).default;
    const doc = new jsPDF();
    doc.text("Lista de Consultas", 14, 10);
    autoTable(doc, {
      head: [["ID", "Fecha", "Paciente", "Médico", "Especialidad", "Estado"]],
      body: consultas.map((c) => [
        c.id,
        c.fecha?.slice(0, 16).replace("T", " "),
        c.paciente_nombre + " " + c.paciente_apellido,
        c.medico_nombre + " " + c.medico_apellido,
        c.medico_especialidad || "",
        c.estado,
      ]),
      startY: 18,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [59, 130, 246] },
    });
    const fecha = new Date().toISOString().slice(0, 10);
    doc.save(`consultas_${fecha}.pdf`);
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
          Seguimiento de atenciones por paciente, médico y estado
        </p>
      </div>

      <QuickAccessNav keys={["pacientes", "recordatorios", "cotizaciones", "reporteCaja"]} />

      <div className="rounded-2xl border bg-white p-3 shadow-sm md:p-4" style={{ borderColor: "var(--color-primary-light)" }}>
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
              <option value={3}>3</option>
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={25}>25</option>
            </select>
          </div>

          <div className="xl:col-span-2">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-primary-dark)" }}>
              Busqueda
            </label>
            <input
              type="text"
              value={busqueda}
              onChange={(e) => {
                setBusqueda(e.target.value);
                setPage(1);
              }}
              placeholder="Paciente, medico, especialidad, estado o ID"
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
                  setFechaDesde("");
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
                    <th className="px-3 py-3 text-left font-semibold">Medico</th>
                    <th className="px-3 py-3 text-left font-semibold">Estado</th>
                    <th className="px-3 py-3 text-center font-semibold">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {consultas.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                        No hay consultas registradas
                      </td>
                    </tr>
                  ) : (
                    pagedConsultas.map((c) => (
                      <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="px-3 py-3 font-semibold" style={{ color: "var(--color-primary-dark)" }}>{c.id}</td>
                        <td className="px-3 py-3 text-slate-600">{c.fecha?.slice(0, 16).replace("T", " ")}</td>
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
                            {c.medico_especialidad && (
                              <span
                                className="inline-block w-fit rounded-full px-3 py-1 text-xs font-medium"
                                style={{
                                  backgroundColor: "color-mix(in srgb, var(--color-accent) 18%, white)",
                                  color: "var(--color-secondary)",
                                }}
                              >
                                {c.medico_especialidad}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${
                              c.estado === "completada"
                                ? "bg-emerald-100 text-emerald-800"
                                : c.estado === "cancelada"
                                  ? "bg-rose-100 text-rose-800"
                                  : c.estado === "falta_cancelar"
                                    ? "bg-amber-100 text-amber-800"
                                    : "text-slate-700"
                            }`}
                            style={c.estado === "pendiente" ? { backgroundColor: "color-mix(in srgb, var(--color-secondary) 16%, white)", color: "var(--color-secondary)" } : undefined}
                          >
                            {c.estado}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <button
                            onClick={() =>
                              navigate(`/agendar-consulta?paciente_id=${Number(c.paciente_id || 0)}&consulta_id=${Number(c.id || 0)}`)
                            }
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
                Pagina {page} de {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
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
