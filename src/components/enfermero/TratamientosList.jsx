import { useEffect, useState } from "react";
import { Icon } from "@fluentui/react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import useTratamientosPendientes from "./useTratamientosPendientes";
import TratamientoDetalleModal from "./TratamientoDetalleModal";
import Spinner from "../comunes/Spinner";
import { BASE_URL } from "../../config/config";

const BADGE = {
  pendiente:    { label: "Pendiente",    bg: "bg-yellow-100", text: "text-yellow-800", dot: "bg-yellow-400" },
  en_ejecucion: { label: "En ejecución", bg: "bg-blue-100",   text: "text-blue-800",   dot: "bg-blue-400"   },
  completado:   { label: "Completado",   bg: "bg-green-100",  text: "text-green-800",  dot: "bg-green-400"  },
  suspendido:   { label: "Suspendido",   bg: "bg-red-100",    text: "text-red-800",    dot: "bg-red-400"    },
};

function EstadoBadge({ estado }) {
  const cfg = BADGE[estado] ?? BADGE.pendiente;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`}></span>
      {cfg.label}
    </span>
  );
}

function formatFechaHora(fecha, hora) {
  if (!fecha) return "-";
  const [y, m, d] = String(fecha).split("-");
  const h = String(hora ?? "").slice(0, 5);
  return `${d}/${m}/${y}${h ? " " + h : ""}`;
}

export default function TratamientosList({ activo }) {
  const [seleccionado, setSeleccionado] = useState(null);
  const [busquedaInput, setBusquedaInput] = useState("");
  const [busqueda, setBusqueda]         = useState("");
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [pagina, setPagina]             = useState(1);
  const [porPagina, setPorPagina]       = useState(10);

  const { items, loading, error, refrescar, cambiarEstado, totales, pagination } =
    useTratamientosPendientes({
      activo,
      busqueda,
      filtroEstado,
      pagina,
      porPagina,
    });

  const totalPaginas = Math.max(1, Number(pagination?.total_pages || 1));
  const totalRegistros = Number(pagination?.total || 0);

  useEffect(() => {
    const h = setTimeout(() => {
      setBusqueda(busquedaInput.trim());
      setPagina(1);
    }, 300);
    return () => clearTimeout(h);
  }, [busquedaInput]);

  useEffect(() => {
    setPagina(1);
  }, [filtroEstado, porPagina]);

  useEffect(() => {
    if (pagina > totalPaginas) {
      setPagina(totalPaginas);
    }
  }, [pagina, totalPaginas]);

  const desde = totalRegistros === 0 ? 0 : (pagina - 1) * porPagina + 1;
  const hasta = Math.min(pagina * porPagina, totalRegistros);

  const fetchDatosExportacion = async () => {
    const estados = filtroEstado === "todos"
      ? "pendiente,en_ejecucion,completado,suspendido"
      : filtroEstado;
    const perPageExport = 200;
    let pageExport = 1;
    let all = [];
    let totalPagesExport = 1;

    do {
      const params = new URLSearchParams({
        estado: estados,
        paginate: "1",
        page: String(pageExport),
        per_page: String(perPageExport),
      });
      if (busqueda.trim()) {
        params.set("q", busqueda.trim());
      }

      const res = await fetch(BASE_URL + `api_tratamientos_enfermeria.php?${params.toString()}`, {
        credentials: "include",
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "No se pudo preparar la exportación");
      }
      const chunk = Array.isArray(data.data) ? data.data : [];
      all = all.concat(chunk);
      totalPagesExport = Number(data.pagination?.total_pages || 1);
      pageExport += 1;
    } while (pageExport <= totalPagesExport);

    return all;
  };

  const normalizarFilasExport = (rows) => rows.map((t) => ({
    HC: t.paciente_hc || "",
    Paciente: `${t.paciente_nombre ?? ""} ${t.paciente_apellido ?? ""}`.trim(),
    Medico: `${t.medico_nombre ?? ""} ${t.medico_apellido ?? ""}`.trim(),
    "Fecha consulta": formatFechaHora(t.consulta_fecha, t.consulta_hora),
    Version: `v${t.version_num || 1}`,
    "Dia actual": t.dia_actual > 0 ? `Dia ${t.dia_actual}` : "Final",
    "Progreso %": Number(t.progreso_pct || 0).toFixed(0),
    "Pendientes hoy": t.pendientes_hoy || 0,
    Medicamentos: (t.receta_snapshot ?? []).length,
    Estado: BADGE[t.estado]?.label || t.estado || "",
  }));

  const exportarCSV = async () => {
    const datos = await fetchDatosExportacion();
    const filas = normalizarFilasExport(datos);
    if (filas.length === 0) return;

    const encabezados = Object.keys(filas[0]);

    const esc = (v) => {
      const s = String(v ?? "");
      return `"${s.replace(/"/g, '""')}"`;
    };

    const filasArray = filas.map((f) => encabezados.map((k) => f[k]));

    const csv = [encabezados, ...filasArray].map((row) => row.map(esc).join(",")).join("\n");
    const bom = "\uFEFF";
    const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const fecha = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `tratamientos_${fecha}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportarXLSX = async () => {
    const datos = await fetchDatosExportacion();
    const filas = normalizarFilasExport(datos);
    if (filas.length === 0) return;

    const ws = XLSX.utils.json_to_sheet(filas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Tratamientos");
    const fecha = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `tratamientos_${fecha}.xlsx`);
  };

  const exportarPDF = async () => {
    const datos = await fetchDatosExportacion();
    const filas = normalizarFilasExport(datos);
    if (filas.length === 0) return;

    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const fecha = new Date().toLocaleDateString("es-PE");
    doc.setFontSize(12);
    doc.text(`Gestion de Tratamientos - ${fecha}`, 40, 30);

    autoTable(doc, {
      startY: 45,
      head: [Object.keys(filas[0])],
      body: filas.map((f) => Object.values(f)),
      styles: { fontSize: 7, cellPadding: 3 },
      headStyles: { fillColor: [67, 56, 202] },
      margin: { left: 24, right: 24 },
    });

    const fechaFile = new Date().toISOString().slice(0, 10);
    doc.save(`tratamientos_${fechaFile}.pdf`);
  };

  if (loading) return <Spinner message="Cargando tratamientos..." />;

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <div className="flex items-center justify-center w-14 h-14 bg-red-100 rounded-full">
          <Icon iconName="ErrorBadge" className="text-2xl text-red-500" />
        </div>
        <p className="text-red-600 font-medium">{error}</p>
        <button
          onClick={refrescar}
          className="px-4 py-2 text-sm font-medium text-white rounded-xl"
          style={{ background: "var(--color-primary)" }}
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* Estadísticas rápidas */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total",       value: totales.total,        color: "bg-gray-100",   text: "text-gray-700"  },
          { label: "Pendientes",  value: totales.pendiente,    color: "bg-yellow-100", text: "text-yellow-700"},
          { label: "En proceso",  value: totales.en_ejecucion, color: "bg-blue-100",   text: "text-blue-700"  },
        ].map(({ label, value, color, text }) => (
          <div key={label} className={`${color} rounded-xl px-4 py-3 text-center`}>
            <div className={`text-2xl font-bold ${text}`}>{value}</div>
            <div className={`text-xs font-medium ${text} opacity-80`}>{label}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Icon iconName="Search" className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar paciente, médico o HC..."
            value={busquedaInput}
            onChange={(e) => setBusquedaInput(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>
        <select
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value)}
          className="border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
        >
          <option value="todos">Todos los estados</option>
          <option value="pendiente">Pendientes</option>
          <option value="en_ejecucion">En ejecución</option>
          <option value="completado">Completados</option>
          <option value="suspendido">Suspendidos</option>
        </select>
        <button
          onClick={() => refrescar()}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors"
        >
          <Icon iconName="Refresh" className="text-gray-500" />
          <span className="hidden sm:inline">Actualizar</span>
        </button>
        <button
          onClick={exportarCSV}
          disabled={totalRegistros === 0}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          <Icon iconName="Download" className="text-gray-500" />
          <span className="hidden sm:inline">Exportar CSV</span>
        </button>
        <button
          onClick={exportarXLSX}
          disabled={totalRegistros === 0}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          <Icon iconName="Table" className="text-gray-500" />
          <span className="hidden sm:inline">Exportar XLSX</span>
        </button>
        <button
          onClick={exportarPDF}
          disabled={totalRegistros === 0}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          <Icon iconName="Print" className="text-gray-500" />
          <span className="hidden sm:inline">Exportar PDF</span>
        </button>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-sm text-gray-600">
        <span>
          Mostrando {desde}-{hasta} de {totalRegistros} registros
        </span>
        <div className="flex items-center gap-2">
          <span>Filas:</span>
          <select
            value={porPagina}
            onChange={(e) => setPorPagina(Number(e.target.value) || 10)}
            className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          >
            {[10, 20, 50].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Sin resultados */}
      {totalRegistros === 0 && (
        <div className="flex flex-col items-center gap-3 py-14 text-center">
          <div className="flex items-center justify-center w-16 h-16 bg-green-100 rounded-full">
            <Icon iconName="CheckMark" className="text-3xl text-green-500" />
          </div>
          <h3 className="text-base font-semibold text-gray-700">
            {totalRegistros === 0 ? "No hay tratamientos pendientes" : "Sin resultados"}
          </h3>
          <p className="text-sm text-gray-400">
            {totalRegistros === 0
              ? "Los tratamientos aparecerán aquí cuando el médico guarde una Historia Clínica"
              : "Intenta cambiar los filtros de búsqueda"}
          </p>
        </div>
      )}

      {/* Tabla — Desktop */}
      {items.length > 0 && (
        <>
          <div className="hidden 2xl:block overflow-hidden rounded-xl border border-gray-200">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  {["HC", "Paciente", "Médico", "Fecha consulta", "Versión", "Día", "Progreso", "Pendientes hoy", "Medicamentos", "Estado", "Acción"].map((h) => (
                    <th key={h} className="px-3 py-3 text-left text-[11px] font-semibold text-gray-600 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-3 py-3 align-top">
                      <span className="font-mono text-sm text-gray-700">{t.paciente_hc || "-"}</span>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="flex items-center gap-2.5">
                        <div className="flex items-center justify-center w-9 h-9 bg-blue-100 rounded-full flex-shrink-0">
                          <Icon iconName="Contact" className="text-base text-blue-600" />
                        </div>
                        <div>
                          <p className="font-semibold text-gray-800 text-sm leading-tight">
                            {t.paciente_nombre} {t.paciente_apellido}
                          </p>
                          {t.paciente_dni && (
                            <p className="text-xs text-gray-400">DNI: {t.paciente_dni}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="flex items-center gap-1.5 text-sm text-gray-700">
                        <Icon iconName="Health" className="text-indigo-400" />
                        {t.medico_nombre} {t.medico_apellido ?? ""}
                      </div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <span className="text-sm text-gray-700">
                        {formatFechaHora(t.consulta_fecha, t.consulta_hora)}
                      </span>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <span className="inline-flex items-center px-2 py-1 bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold">
                        v{t.version_num || 1}
                      </span>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <span className="inline-flex items-center px-2 py-1 bg-cyan-50 text-cyan-700 rounded-lg text-xs font-semibold">
                        {t.dia_actual > 0 ? `Día ${t.dia_actual}` : "Final"}
                      </span>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="min-w-[100px]">
                        <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-green-500"
                            style={{ width: `${Math.max(0, Math.min(100, Number(t.progreso_pct || 0)))}%` }}
                          ></div>
                        </div>
                        <div className="text-xs text-gray-500 mt-1">{Number(t.progreso_pct || 0).toFixed(0)}%</div>
                      </div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <span className="inline-flex items-center px-2 py-1 bg-amber-50 text-amber-700 rounded-lg text-xs font-semibold">
                        {t.pendientes_hoy || 0}
                      </span>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-medium">
                        <Icon iconName="Pill" className="text-xs" />
                        {(t.receta_snapshot ?? []).length}
                      </span>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <EstadoBadge estado={t.estado} />
                    </td>
                    <td className="px-3 py-3 align-top whitespace-nowrap">
                      <button
                        onClick={() => setSeleccionado(t)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white rounded-lg transition-all hover:scale-[1.02] shadow-sm whitespace-nowrap"
                        style={{ background: "linear-gradient(90deg, var(--color-primary), var(--color-secondary))" }}
                      >
                        <Icon iconName="MedicationAdmin" className="text-xs" />
                        Ver detalle
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Cards — Mobile */}
          <div className="2xl:hidden space-y-4">
            {items.map((t) => (
              <div key={t.id} className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-11 h-11 bg-blue-100 rounded-full">
                      <Icon iconName="Contact" className="text-lg text-blue-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-800">
                        {t.paciente_nombre} {t.paciente_apellido}
                      </p>
                      <p className="text-xs text-gray-500">HC: {t.paciente_hc || "N/A"}</p>
                    </div>
                  </div>
                  <EstadoBadge estado={t.estado} />
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
                  <div className="flex items-center gap-1.5 text-gray-600">
                    <Icon iconName="Health" className="text-indigo-400" />
                    <span className="truncate">{t.medico_nombre} {t.medico_apellido ?? ""}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-gray-600">
                    <Icon iconName="Calendar" className="text-gray-400" />
                    <span>{formatFechaHora(t.consulta_fecha, t.consulta_hora)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-gray-600">
                    <Icon iconName="Pill" className="text-indigo-400" />
                    <span>{(t.receta_snapshot ?? []).length} medicamento(s)</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-gray-600">
                    <Icon iconName="History" className="text-slate-400" />
                    <span>Versión v{t.version_num || 1}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-gray-600">
                    <Icon iconName="Calendar" className="text-cyan-500" />
                    <span>{t.dia_actual > 0 ? `Día ${t.dia_actual}` : "Final"}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-gray-600">
                    <Icon iconName="ProgressRingDots" className="text-green-500" />
                    <span>{Number(t.progreso_pct || 0).toFixed(0)}% completado</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-gray-600">
                    <Icon iconName="Clock" className="text-amber-500" />
                    <span>Pendientes hoy: {t.pendientes_hoy || 0}</span>
                  </div>
                </div>

                <button
                  onClick={() => setSeleccionado(t)}
                  className="w-full inline-flex items-center justify-center gap-2 py-3 text-sm font-semibold text-white rounded-xl transition-all shadow-md hover:shadow-lg"
                  style={{ background: "linear-gradient(90deg, var(--color-primary), var(--color-secondary))" }}
                >
                  <Icon iconName="MedicationAdmin" className="text-base" />
                  Ver tratamiento
                </button>
              </div>
            ))}
          </div>

          {/* Paginación */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
            <div className="text-xs text-gray-500">
              Página {pagina} de {totalPaginas}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPagina(1)}
                disabled={pagina === 1}
                className="px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-50"
              >
                Primero
              </button>
              <button
                onClick={() => setPagina((p) => Math.max(1, p - 1))}
                disabled={pagina === 1}
                className="px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-50"
              >
                Anterior
              </button>
              <button
                onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                disabled={pagina === totalPaginas}
                className="px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-50"
              >
                Siguiente
              </button>
              <button
                onClick={() => setPagina(totalPaginas)}
                disabled={pagina === totalPaginas}
                className="px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-50"
              >
                Ultimo
              </button>
            </div>
          </div>
        </>
      )}

      {/* Modal de detalle */}
      {seleccionado && (
        <TratamientoDetalleModal
          tratamiento={seleccionado}
          onClose={() => setSeleccionado(null)}
          onRefrescarLista={() => refrescar({ silent: true })}
          onCambiarEstado={async (id, estado, notas) => {
            await cambiarEstado(id, estado, notas);
            setSeleccionado(null);
          }}
        />
      )}
    </div>
  );
}
