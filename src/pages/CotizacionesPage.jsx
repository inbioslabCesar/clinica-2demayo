import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import QuickAccessNav from "../components/comunes/QuickAccessNav";
import CotizadorRapido from "../components/cotizaciones/CotizadorRapido";
import { FiEye, FiSlash, FiDollarSign, FiEdit2, FiCamera, FiFileText, FiBookOpen } from "react-icons/fi";
import { authFetch } from "../utils/apiClient";

const SERVICIOS_IMAGEN = new Set(["rayosx", "ecografia", "tomografia"]);
function tieneServicioImagen(serviciosTipos) {
  return Array.isArray(serviciosTipos) && serviciosTipos.some((tipo) => SERVICIOS_IMAGEN.has(tipo));
}

function normalizarServicioTipo(value) {
  const base = String(value || "").toLowerCase().trim();
  if (!base) return "";
  if (base === "rayos_x" || base === "rayos x") return "rayosx";
  if (base === "operaciones") return "operacion";
  if (base === "procedimientos") return "procedimiento";
  if (base === "consulta_medica" || base === "consulta médica" || base === "consulta medica") return "consulta";
  return base;
}

function formatDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateTime(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString();
}

function getVencimientoMeta(row) {
  const fechaVencimiento = String(row?.fecha_vencimiento || "").trim();
  const estado = String(row?.estado || "").toLowerCase();
  if (!fechaVencimiento || !["pendiente", "parcial"].includes(estado)) return null;

  const vencimiento = new Date(fechaVencimiento);
  if (Number.isNaN(vencimiento.getTime())) return null;

  const ahora = new Date();
  if (ahora.getTime() > vencimiento.getTime()) {
    return {
      vencida: true,
      label: "Vencida",
      detail: `Venció: ${formatDateTime(fechaVencimiento)}`,
      className: "bg-red-100 text-red-700",
    };
  }

  const mismoDia = ahora.toDateString() === vencimiento.toDateString();
  if (mismoDia) {
    return {
      vencida: false,
      label: "Vence hoy",
      detail: `Vence: ${formatDateTime(fechaVencimiento)}`,
      className: "bg-amber-100 text-amber-700",
    };
  }

  return {
    vencida: false,
    label: "Vigente",
    detail: `Vence: ${formatDateTime(fechaVencimiento)}`,
    className: "bg-emerald-100 text-emerald-700",
  };
}

// Constantes de estilo fuera del componente — referencia estable, nunca se recrean
const ACTION_BTN_BASE = "inline-flex items-center justify-center w-8 h-8 rounded-lg border transition-transform hover:scale-105";
const THEME_GRADIENT = { backgroundImage: "linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 100%)" };
const THEME_PRIMARY_SOFT = { backgroundColor: "var(--color-primary-light)", color: "var(--color-primary-dark)" };
const THEME_OUTLINE = { color: "var(--color-primary-dark)", borderColor: "var(--color-primary-light)" };

function badgeOrigen(value) {
  const v = String(value || "regular").toLowerCase();
  if (v === "contrato") return { cls: "bg-emerald-100 text-emerald-700", label: "Contrato" };
  if (v === "extra") return { cls: "bg-orange-100 text-orange-700", label: "Extra" };
  if (v === "mixto") return { cls: "bg-indigo-100 text-indigo-700", label: "Mixto" };
  return { cls: "bg-slate-100 text-slate-700", label: "Regular" };
}

function badgeOrigenVisual(row) {
  const observaciones = String(row?.observaciones || "").toLowerCase();
  if (observaciones.includes("paquetes/perfiles")) {
    if (observaciones.includes("perfil")) return { cls: "bg-fuchsia-100 text-fuchsia-700", label: "PERFIL" };
    return { cls: "bg-violet-100 text-violet-700", label: "PAQUETE" };
  }
  return badgeOrigen(row?.origen_cobro_resumen);
}

// ─── Fila de cotización memoizada ──────────────────────────────────────────────
// Solo re-renderiza cuando cambian los datos de la fila o los callbacks
const CotizacionRow = memo(function CotizacionRow({ row, onCobrar, onAnular, onNavigate, badgeEstado, labelEstado }) {
  const estadoRow = String(row.estado || "").toLowerCase();
  const numeroComprobante = String(row.numero_comprobante || "").trim();
  const vencimientoMeta = useMemo(() => getVencimientoMeta(row), [row]);
  const cotizacionVencida = Boolean(vencimientoMeta?.vencida);
  const esParticular = Number(row.paciente_id || 0) <= 0;

  const servicios = useMemo(() => Array.from(new Set(
    String(row.servicios_tipos || "")
      .split(",")
      .map(normalizarServicioTipo)
      .filter(Boolean)
  )), [row.servicios_tipos]);

  const cotizacionPagada = ["pagado", "completado", "control", "contrato"].includes(estadoRow);
  const tieneLaboratorioReferencia = Number(row.tiene_laboratorio_referencia || 0) === 1;
  const tieneResultadosLaboratorio = Number(row.lab_completado) === 1 && servicios.includes("laboratorio");
  const puedeGestionarLaboratorioDesdeCotizacion = cotizacionPagada && servicios.includes("laboratorio") && Number(row.paciente_id || 0) > 0;
  const puedeAbrirLaboratorio = puedeGestionarLaboratorioDesdeCotizacion || tieneResultadosLaboratorio;
  const ordenLaboratorioId = Number(row.orden_laboratorio_id || 0);
  const ordenQuery = ordenLaboratorioId > 0 ? `&orden_id=${ordenLaboratorioId}` : "";
  const tituloResultado = encodeURIComponent(
    tieneLaboratorioReferencia
      ? `Resultado laboratorio referencia - Cot. #${row.id}`
      : `Resultado laboratorio - Cot. #${row.id}`
  );
  const laboratorioUrl = `/documentos-paciente/${row.paciente_id}?cotizacion_id=${row.id}${ordenQuery}&abrir=1&tipo=laboratorio&titulo=${tituloResultado}&back_to=/cotizaciones`;
  const laboratorioTitulo = tieneResultadosLaboratorio ? "Ver resultados de laboratorio" : "Gestionar resultados de laboratorio";
  const origen = useMemo(() => badgeOrigenVisual(row), [row]);
  const contratosIds = String(row.contratos_ids_resumen || "").trim();

  // Handler HC separado con useCallback para evitar función anónima nueva en cada render
  const handleVerHC = useCallback(async () => {
    let consultaId = Number(row.consulta_ref_id || 0);
    if (consultaId <= 0) {
      try {
        const resRef = await authFetch(
          `api_cotizaciones.php?cotizacion_id=${Number(row.id)}&_t=${Date.now()}`,
          { cache: "no-store" }
        );
        const dataRef = await resRef.json();
        consultaId = Number(dataRef?.cotizacion?.consulta_ref_id || 0);
        if (consultaId <= 0) {
          const detalleConsulta = Array.isArray(dataRef?.cotizacion?.detalles)
            ? dataRef.cotizacion.detalles.find((detalle) => (
              String(detalle?.servicio_tipo || '').trim().toLowerCase() === 'consulta'
              && Number(detalle?.consulta_id || 0) > 0
            ))
            : null;
          consultaId = Number(detalleConsulta?.consulta_id || 0);
        }
        if (consultaId <= 0) {
          const resConsulta = await authFetch(
            `api_consultas.php?cotizacion_id=${Number(row.id)}&_t=${Date.now()}`,
            { cache: 'no-store' }
          );
          const dataConsulta = await resConsulta.json();
          const consultaResuelta = Array.isArray(dataConsulta?.consultas) ? dataConsulta.consultas[0] : null;
          consultaId = Number(consultaResuelta?.id || 0);
        }
      } catch {
        consultaId = 0;
      }
    }
    if (consultaId > 0) {
      onNavigate(`/historia-clinica-lectura/${row.paciente_id}/${consultaId}?back_to=/cotizaciones`);
    } else {
      await Swal.fire({
        icon: 'warning',
        title: 'No se encontró la consulta asociada',
        text: 'Esta cotización no tiene una atención clínica vinculada para abrir la HC en modo lectura.',
        confirmButtonText: 'Aceptar',
      });
    }
  }, [row.id, row.paciente_id, row.consulta_ref_id, onNavigate]);

  return (
    <tr className="border-t align-top">
      <td className="px-3 py-2 font-semibold">
        <div>#{row.id}</div>
        {numeroComprobante && (
          <div className="text-xs font-mono text-indigo-700">{numeroComprobante}</div>
        )}
      </td>
      <td className="px-3 py-2 whitespace-nowrap">{row.fecha}</td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="font-medium">{row.nombre} {row.apellido}</div>
          {esParticular && (
            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-orange-100 text-orange-700">
              Particular
            </span>
          )}
        </div>
        <div className="text-xs text-gray-500">DNI: {row.dni || "-"} | HC: {row.historia_clinica || "-"}</div>
      </td>
      <td className="px-3 py-2">{row.usuario_nombre || "-"}</td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-1">
          {servicios.length === 0 ? <span className="text-gray-400">-</span> : servicios.map((s) => (
            <span
              key={`${row.id}-${s}`}
              className="text-xs px-2 py-1 rounded"
              style={THEME_PRIMARY_SOFT}
              title="Servicio cotizado"
            >
              {estadoRow === "anulada" ? `${s} (anulada)` : s}
            </span>
          ))}
        </div>
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-col gap-1 items-start">
          <span className={`px-2 py-1 rounded text-xs font-semibold ${origen.cls}`}>{origen.label}</span>
          {contratosIds && (
            <span className="text-[11px] text-slate-500">Contrato(s): {contratosIds}</span>
          )}
        </div>
      </td>
      <td className="px-3 py-2 text-right font-semibold">S/ {Number(row.total || 0).toFixed(2)}</td>
      <td className="px-3 py-2 text-right font-semibold">S/ {Number(row.saldo_pendiente ?? 0).toFixed(2)}</td>
      <td className="px-3 py-2">
        <div className="flex flex-col items-start gap-1">
          <span className={`px-2 py-1 rounded text-xs font-semibold ${badgeEstado(row.estado, row.pagado_con_descuento)}`}>
            {labelEstado(row)}
          </span>
          {vencimientoMeta && (
            <span
              className={`px-2 py-1 rounded text-xs font-semibold ${vencimientoMeta.className}`}
              title={vencimientoMeta.detail}
            >
              {vencimientoMeta.label}
            </span>
          )}
        </div>
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => onNavigate(`/cotizaciones/${row.id}/detalle`)}
            className={ACTION_BTN_BASE}
            style={THEME_OUTLINE}
            title="Ver detalle"
            aria-label="Ver detalle"
          >
            <FiEye className="text-sm" />
          </button>
          {puedeAbrirLaboratorio && (
            <button
              onClick={() => onNavigate(laboratorioUrl)}
              className={`${ACTION_BTN_BASE} ${tieneResultadosLaboratorio ? 'bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-200' : 'bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-200'}`}
              title={laboratorioTitulo}
              aria-label={laboratorioTitulo}
            >
              <FiFileText className="text-sm" />
            </button>
          )}
          {Number(row.paciente_id || 0) > 0 && servicios.includes('consulta') && (
            <button
              onClick={handleVerHC}
              className={`${ACTION_BTN_BASE} bg-violet-100 text-violet-700 border-violet-200 hover:bg-violet-200`}
              title="Ver Historia Clínica"
              aria-label="Ver Historia Clínica"
            >
              <FiBookOpen className="text-sm" />
            </button>
          )}
          {["pagado", "completado", "control", "contrato"].includes(estadoRow) && tieneServicioImagen(servicios) && (
            <button
              onClick={() => onNavigate(`/imagenes-paciente/${row.paciente_id}?cotizacion_id=${row.id}`)}
              className={`${ACTION_BTN_BASE} bg-sky-100 text-sky-700 border-sky-200 hover:bg-sky-200`}
              title="Subir / ver imágenes"
              aria-label="Subir / ver imágenes"
            >
              <FiCamera className="text-sm" />
            </button>
          )}
          {(estadoRow === "pendiente" || estadoRow === "parcial") && (
            <button
              disabled={cotizacionVencida}
              onClick={() => onCobrar(row)}
              className={`${ACTION_BTN_BASE} ${cotizacionVencida ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed' : 'bg-green-100 text-green-700 border-green-200 hover:bg-green-200'}`}
              title={cotizacionVencida ? 'Cotización vencida' : 'Cobrar (unificado si aplica)'}
              aria-label="Cobrar"
            >
              <FiDollarSign className="text-sm" />
            </button>
          )}
          {estadoRow !== "anulada" && (
            <button
              // TODO: re-enable edit for paid quotations when needed (cotizacionPagada guard below)
              disabled={cotizacionPagada}
              onClick={() => {
                if (cotizacionPagada) return;
                onNavigate(`/seleccionar-servicio?paciente_id=${row.paciente_id}&cotizacion_id=${row.id}&back_to=/cotizaciones&modo=editar`);
              }}
              className={`${ACTION_BTN_BASE} ${cotizacionPagada ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed opacity-50' : ''}`}
              style={cotizacionPagada ? {} : THEME_OUTLINE}
              title={cotizacionPagada ? 'No se puede editar una cotización pagada' : 'Editar cotización'}
              aria-label="Editar cotización"
            >
              <FiEdit2 className="text-sm" />
            </button>
          )}
          {estadoRow !== "anulada" && (
            <button
              onClick={() => onAnular(row)}
              className={`${ACTION_BTN_BASE} bg-red-100 text-red-700 border-red-200 hover:bg-red-200`}
              title="Anular"
              aria-label="Anular"
            >
              <FiSlash className="text-sm" />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
});

export default function CotizacionesPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const autoAnularRef = useRef(false);
  const abortRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  const [qInput, setQInput] = useState("");
  const [estadoInput, setEstadoInput] = useState("");
  const [fechaInicioInput, setFechaInicioInput] = useState("");
  const [fechaFinInput, setFechaFinInput] = useState("");
  const [filtrosAplicados, setFiltrosAplicados] = useState({
    q: "",
    estado: "",
    fechaInicio: "",
    fechaFin: "",
  });

  const cargar = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(limit));
      params.set("include_detalles", "0");
      if (filtrosAplicados.q.trim()) params.set("q", filtrosAplicados.q.trim());
      if (filtrosAplicados.estado) params.set("estado", filtrosAplicados.estado);
      if (filtrosAplicados.fechaInicio && filtrosAplicados.fechaFin) {
        params.set("fecha_inicio", filtrosAplicados.fechaInicio);
        params.set("fecha_fin", filtrosAplicados.fechaFin);
      }

      const res = await authFetch(`api_cotizaciones.php?${params.toString()}&_t=${Date.now()}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      const data = await res.json();
      if (!data?.success) {
        throw new Error(data?.error || "No se pudo cargar cotizaciones");
      }
      setRows(Array.isArray(data.cotizaciones) ? data.cotizaciones : []);
      setTotal(Number(data.total || 0));
    } catch (error) {
      if (error?.name === "AbortError") return;
      Swal.fire("Error", error?.message || "No se pudo cargar la lista", "error");
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [filtrosAplicados, limit, page]);

  const abrirCobro = useCallback(async (row) => {
    const baseId = Number(row?.id || 0);
    if (baseId <= 0) return;

    let ids = [baseId];
    try {
      const res = await authFetch(`api_cotizaciones.php?accion=sugerir_grupo_cobro&cotizacion_id=${baseId}&_t=${Date.now()}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (data?.success && Array.isArray(data.ids)) {
        const sugeridos = Array.from(new Set(data.ids.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0)));
        if (sugeridos.length > 0) {
          ids = sugeridos;
        }
      }
    } catch {
      ids = [baseId];
    }

    const targetId = Number(ids[0] || baseId);
    const query = ids.length > 1 ? `?ids=${ids.join(",")}` : "";
    navigate(`/cobrar-cotizacion/${targetId}${query}`);
  }, [navigate]);

  useEffect(() => {
    cargar();
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, [cargar]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / limit)), [total, limit]);

  const filtrar = () => {
    setPage(1);
    setFiltrosAplicados({
      q: qInput,
      estado: estadoInput,
      fechaInicio: fechaInicioInput,
      fechaFin: fechaFinInput,
    });
  };

  const aplicarRangoDias = (dias) => {
    const fin = new Date();
    const inicio = new Date(fin);
    inicio.setDate(fin.getDate() - (dias - 1));

    const inicioStr = formatDateInput(inicio);
    const finStr = formatDateInput(fin);

    setFechaInicioInput(inicioStr);
    setFechaFinInput(finStr);
    setPage(1);
    setFiltrosAplicados((prev) => ({
      ...prev,
      fechaInicio: inicioStr,
      fechaFin: finStr,
    }));
  };

  const mostrarTodo = () => {
    setFechaInicioInput("");
    setFechaFinInput("");
    setPage(1);
    setFiltrosAplicados((prev) => ({
      ...prev,
      fechaInicio: "",
      fechaFin: "",
    }));
  };

  const limpiarFiltros = () => {
    setQInput("");
    setEstadoInput("");
    setFechaInicioInput("");
    setFechaFinInput("");
    setPage(1);
    setFiltrosAplicados({
      q: "",
      estado: "",
      fechaInicio: "",
      fechaFin: "",
    });
  };

  const badgeEstado = (value, pagadoConDescuento = 0) => {
    const st = String(value || "").toLowerCase();
    if (st === "pagado" && Number(pagadoConDescuento || 0) === 1) return "bg-emerald-100 text-emerald-800";
    if (st === "pagado") return "bg-green-100 text-green-700";
    if (st === "parcial") return "bg-amber-100 text-amber-700";
    if (st === "informativo") return "bg-slate-100 text-slate-700";
    if (st === "control" || st === "contrato") return "bg-sky-100 text-sky-700";
    if (st === "anulada") return "bg-red-100 text-red-700";
    return "bg-blue-100 text-blue-700";
  };

  const labelEstado = (row) => {
    const st = String(row?.estado || "").toLowerCase();
    if (st === "pagado" && Number(row?.pagado_con_descuento || 0) === 1) return "pagado con descuento";
    if (st === "informativo") return "informativo";
    return row?.estado;
  };

  const anularCotizacion = useCallback(async (cotizacion) => {
    const { value: motivo } = await Swal.fire({
      title: `Anular cotización #${cotizacion.id}`,
      input: "text",
      inputLabel: "Motivo de anulación",
      inputPlaceholder: "Escribe el motivo",
      showCancelButton: true,
      confirmButtonText: "Anular",
      cancelButtonText: "Cancelar",
      inputValidator: (value) => {
        if (!value || !value.trim()) return "Motivo obligatorio";
        if (value.trim().length < 4) return "Mínimo 4 caracteres";
        return undefined;
      },
    });

    if (!motivo) return;

    try {
      const res = await authFetch("api_cotizaciones.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accion: "anular",
          cotizacion_id: Number(cotizacion.id),
          motivo: motivo.trim(),
        }),
      });
      const data = await res.json();
      if (!data?.success) throw new Error(data?.error || "No se pudo anular");
      Swal.fire("Listo", "Cotización anulada", "success");
      await cargar();
    } catch (error) {
      Swal.fire("Error", error?.message || "No se pudo anular", "error");
    }
  }, [cargar]);

  useEffect(() => {
    const sp = new URLSearchParams(location.search);
    const accion = String(sp.get("accion") || "").toLowerCase();
    const cotizacionId = Number(sp.get("cotizacion_id") || 0);
    if (accion !== "anular" || !cotizacionId || autoAnularRef.current || loading) return;

    autoAnularRef.current = true;

    // Limpiar la URL inmediatamente para que un refresh no vuelva a disparar el dialog
    navigate("/cotizaciones", { replace: true });

    const ejecutarAnulacion = async () => {
      let cotizacionObjetivo = rows.find((r) => Number(r.id) === cotizacionId) || null;

      if (!cotizacionObjetivo) {
        try {
          const res = await authFetch(`api_cotizaciones.php?cotizacion_id=${cotizacionId}`);
          const data = await res.json();
          if (data?.success && data?.cotizacion) {
            cotizacionObjetivo = data.cotizacion;
          }
        } catch {
          // mantener null para manejar abajo
        }
      }

      if (!cotizacionObjetivo) {
        Swal.fire("Atención", `No se encontró la cotización #${cotizacionId}.`, "warning");
        return;
      }

      if (String(cotizacionObjetivo.estado || "").toLowerCase() === "anulada") {
        Swal.fire("Info", `La cotización #${cotizacionId} ya está anulada.`, "info");
        return;
      }

      await anularCotizacion(cotizacionObjetivo);
    };

    ejecutarAnulacion();
  }, [location.search, loading, rows, anularCotizacion, navigate]);

  return (
    <div className="max-w-full mx-auto p-4 md:p-8">
      <div className="bg-white rounded-xl shadow border border-gray-200 p-4 md:p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
          <h2 className="text-2xl font-bold" style={{ color: "var(--color-primary-dark)" }}>Cotizaciones</h2>
          <div className="text-sm text-gray-600">Total registros: <b>{total}</b></div>
        </div>

        <QuickAccessNav keys={["pacientes", "recordatorios", "reporteCaja"]} />

        <CotizadorRapido />

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-4">
          <input
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="Buscar paciente, DNI, HC, ID o código Q"
            className="border rounded px-3 py-2 md:col-span-2"
          />
          <select
            value={estadoInput}
            onChange={(e) => setEstadoInput(e.target.value)}
            className="border rounded px-3 py-2"
          >
            <option value="">Todos los estados</option>
            <option value="pendiente">Pendiente</option>
            <option value="parcial">Parcial</option>
            <option value="pagado">Pagado</option>
            <option value="informativo">Informativo</option>
            <option value="anulada">Anulada</option>
          </select>
          <input
            type="date"
            value={fechaInicioInput}
            onChange={(e) => setFechaInicioInput(e.target.value)}
            className="border rounded px-3 py-2"
          />
          <input
            type="date"
            value={fechaFinInput}
            onChange={(e) => setFechaFinInput(e.target.value)}
            className="border rounded px-3 py-2"
          />
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => aplicarRangoDias(1)}
            className="px-3 py-1 rounded"
            style={THEME_PRIMARY_SOFT}
          >
            Hoy
          </button>
          <button
            onClick={() => aplicarRangoDias(7)}
            className="px-3 py-1 rounded"
            style={THEME_PRIMARY_SOFT}
          >
            Ultimos 7 dias
          </button>
          <button
            onClick={() => aplicarRangoDias(30)}
            className="px-3 py-1 rounded"
            style={THEME_PRIMARY_SOFT}
          >
            Ultimos 30 dias
          </button>
          <button
            onClick={mostrarTodo}
            className="bg-gray-100 text-gray-700 px-3 py-1 rounded hover:bg-gray-200"
          >
            Todo
          </button>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          <button onClick={filtrar} className="text-white px-4 py-2 rounded" style={THEME_GRADIENT}>Filtrar</button>
          <button onClick={limpiarFiltros} className="bg-gray-200 text-gray-700 px-4 py-2 rounded hover:bg-gray-300">Limpiar</button>
        </div>

        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-3 py-2 text-left">ID</th>
                <th className="px-3 py-2 text-left">Fecha</th>
                <th className="px-3 py-2 text-left">Paciente</th>
                <th className="px-3 py-2 text-left">Quién cotizó</th>
                <th className="px-3 py-2 text-left">Servicios</th>
                <th className="px-3 py-2 text-left">Origen/Contrato</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2 text-right">Saldo</th>
                <th className="px-3 py-2 text-left">Estado</th>
                <th className="px-3 py-2 text-left">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-gray-500">Cargando...</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-gray-500">Sin resultados</td>
                </tr>
              ) : rows.map((row) => (
                <CotizacionRow
                  key={row.id}
                  row={row}
                  onCobrar={abrirCobro}
                  onAnular={anularCotizacion}
                  onNavigate={navigate}
                  badgeEstado={badgeEstado}
                  labelEstado={labelEstado}
                />
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-4">
          <div className="text-sm text-gray-600">Página {page} de {totalPages}</div>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1 rounded bg-gray-200 disabled:opacity-50"
            >
              Anterior
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="px-3 py-1 rounded bg-gray-200 disabled:opacity-50"
            >
              Siguiente
            </button>
            <select
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
              className="border rounded px-2 py-1"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
