
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { APP_BASE_PATH, BASE_URL } from "../config/config";
import { authFetch } from "../utils/apiClient";
import TabsApoyoDiagnostico from "../components/examenes/TabsApoyoDiagnostico";
import VisorInformeImagenologiaHC from "../components/imagenologia/VisorInformeImagenologiaHC";
import { FormularioHistoriaClinica, TriajePaciente, DatosPaciente, TratamientoPaciente } from "../components/paciente";
import DiagnosticoCIE10Selector from "../components/diagnostico/DiagnosticoCIE10Selector";
import ImpresionHistoriaClinica from "../components/print/ImpresionHistoriaClinica";
import ImpresionAnalisisLaboratorio from "../components/print/ImpresionAnalisisLaboratorio";
import ImpresionRecetaMedicamentos from "../components/print/ImpresionRecetaMedicamentos";
import ImpresionServiciosSolicitados from "../components/print/ImpresionServiciosSolicitados";
import ImpresionInformeProcedimiento from "../components/print/ImpresionInformeProcedimiento";
import { usePrintHistoriaClinica, usePrintLaboratorio, usePrintReceta, usePrintServicios, usePrintInformeProcedimiento } from "../hooks/usePrint";
import { formatColegiatura, formatProfesionalName } from "../utils/profesionalDisplay";

const hcTemplateFlag = String(import.meta.env.VITE_HC_TEMPLATE_ENGINE_READ || "").toLowerCase();
const HC_TEMPLATE_ENGINE_READ = hcTemplateFlag === "" || ["1", "true", "yes", "on"].includes(hcTemplateFlag);
const DEFAULT_PROXIMA_CITA = {
  programar: false,
  fecha: "",
  hora: "",
  medico_id: "",
  consulta_id: null,
  es_control: false,
};
const HC_PREV_EXCLUDED_FIELDS = new Set(["tratamiento", "receta", "diagnosticos", "template", "proxima_cita"]);
const HC_PREV_EXCLUDED_SECTIONS = new Set(["plan", "tratamiento", "receta"]);
const HC_PREVIAS_CACHE_TTL_MS = 5 * 60 * 1000;
const HC_PREVIAS_UI_STORAGE_PREFIX = "hc_previas_ui_v1";
const HC_DRAFT_STORAGE_PREFIX = "hc_draft_v1";
const HC_DRAFT_TTL_MS = 72 * 60 * 60 * 1000;

function buildDraftStorageKey(consultaId, pacienteId) {
  const consulta = String(consultaId || "").trim();
  const paciente = String(pacienteId || "").trim();
  if (!consulta || !paciente) return "";
  return `${HC_DRAFT_STORAGE_PREFIX}_${consulta}_${paciente}`;
}

function buildPreviasUiStorageKey(consultaId, pacienteId) {
  const consulta = String(consultaId || "").trim();
  const paciente = String(pacienteId || "").trim();
  if (!consulta || !paciente) return "";
  return `${HC_PREVIAS_UI_STORAGE_PREFIX}_${consulta}_${paciente}`;
}

function parsePositiveInt(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function firstNonEmptyValue(obj, keys) {
  if (!obj || typeof obj !== "object") return "";
  for (const key of keys) {
    const value = obj[key];
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

function parseArrayFromUnknown(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return null;

  const raw = value.trim();
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function extractLegacyRecetaArray(source) {
  if (!source || typeof source !== "object") return [];

  const directKeys = [
    "receta",
    "receta_medica",
    "medicamentos",
    "medicamentos_seleccionados",
    "medicacion",
    "farmacos",
    "prescripcion",
    "prescripciones",
    "tratamiento_medicamentos",
  ];

  for (const key of directKeys) {
    const candidate = source[key];
    const parsedCandidate = parseArrayFromUnknown(candidate);
    if (Array.isArray(parsedCandidate)) return parsedCandidate;
    if (candidate && typeof candidate === "object") {
      const nested = [
        parseArrayFromUnknown(candidate.items),
        parseArrayFromUnknown(candidate.lista),
        parseArrayFromUnknown(candidate.medicamentos),
        parseArrayFromUnknown(candidate.receta),
      ].find((entry) => Array.isArray(entry));
      if (Array.isArray(nested)) return nested;
    }
  }

  return [];
}

function normalizeRecetaItem(item, idx) {
  if (typeof item === "string") {
    const nombre = String(item || "").trim();
    if (!nombre) return null;
    return {
      codigo: `LEGACY-${idx}`,
      nombre,
      presentacion: "",
      concentracion: "",
      laboratorio: "",
      dosis: "",
      frecuencia: "",
      frecuencia_tipo: "intervalo_horas",
      frecuencia_valor: 8,
      frecuencia_horas: [],
      duracion: "",
      duracion_valor: 5,
      duracion_unidad: "dias",
      cantidad_total: 0,
      observaciones: "",
      cantidad_dispensacion: 1,
      unidad_dispensacion: "unidad",
      manual: true,
      origen: "legacy",
    };
  }

  if (!item || typeof item !== "object") return null;

  const codigoRaw = firstNonEmptyValue(item, ["codigo", "cod", "medicamento_codigo", "id_medicamento"]);
  const nombreRaw = firstNonEmptyValue(item, ["nombre", "medicamento", "descripcion", "farmaco", "producto"]);
  const nombre = nombreRaw || codigoRaw;
  if (!nombre) return null;

  const frecuenciaHorasRaw = item?.frecuencia_horas;
  const frecuenciaHoras = Array.isArray(frecuenciaHorasRaw)
    ? frecuenciaHorasRaw.map((h) => String(h || "").trim()).filter(Boolean)
    : String(frecuenciaHorasRaw || "")
        .split(",")
        .map((h) => h.trim())
        .filter(Boolean);

  const frecuenciaTipo = String(item?.frecuencia_tipo || item?.tipo_frecuencia || "intervalo_horas").trim() || "intervalo_horas";
  const frecuenciaValor = parsePositiveInt(item?.frecuencia_valor ?? item?.cada_horas ?? item?.veces_dia, frecuenciaTipo === "horarios_fijos" ? 0 : 8);
  const duracionValor = parsePositiveInt(item?.duracion_valor ?? item?.dias ?? item?.duracion_dias, 5);
  const duracionUnidad = String(item?.duracion_unidad || item?.unidad_duracion || "dias").trim() === "semanas" ? "semanas" : "dias";
  const cantidadDispensacion = parsePositiveInt(
    item?.cantidad_dispensacion ?? item?.cantidad_dispensar ?? item?.cantidad ?? item?.cant ?? item?.cantidad_total,
    1
  );

  return {
    codigo: codigoRaw || `LEGACY-${idx}`,
    nombre,
    presentacion: firstNonEmptyValue(item, ["presentacion", "forma", "forma_farmaceutica"]),
    concentracion: firstNonEmptyValue(item, ["concentracion"]),
    laboratorio: firstNonEmptyValue(item, ["laboratorio"]),
    dosis: firstNonEmptyValue(item, ["dosis"]),
    frecuencia: firstNonEmptyValue(item, ["frecuencia"]),
    frecuencia_tipo: frecuenciaTipo,
    frecuencia_valor: frecuenciaTipo === "horarios_fijos" ? null : frecuenciaValor,
    frecuencia_horas: frecuenciaTipo === "horarios_fijos" ? frecuenciaHoras : [],
    duracion: firstNonEmptyValue(item, ["duracion"]),
    duracion_valor: duracionValor,
    duracion_unidad: duracionUnidad,
    cantidad_total: parsePositiveInt(item?.cantidad_total, 0),
    observaciones: firstNonEmptyValue(item, ["observaciones", "indicaciones", "indicacion", "instrucciones"]),
    cantidad_dispensacion: cantidadDispensacion,
    unidad_dispensacion: firstNonEmptyValue(item, ["unidad_dispensacion", "unidad", "unidad_cantidad"]) || "unidad",
    manual: Boolean(item?.manual) || !codigoRaw,
    origen: String(item?.origen || "legacy").trim() || "legacy",
  };
}

function normalizeRecetaArray(source) {
  const rawReceta = extractLegacyRecetaArray(source);
  if (!Array.isArray(rawReceta)) return [];

  return rawReceta
    .map((item, idx) => normalizeRecetaItem(item, idx))
    .filter(Boolean);
}

function normalizeHistoriaData(rawDatos) {
  const source = rawDatos && typeof rawDatos === "object" ? rawDatos : {};
  const rawProxima = source.proxima_cita || {};
  const recetaNormalizada = normalizeRecetaArray(source);
  return {
    ...source,
    receta: recetaNormalizada,
    recomendaciones: String(source.recomendaciones || "").trim(),
    proxima_cita: {
      ...DEFAULT_PROXIMA_CITA,
      ...(rawProxima && typeof rawProxima === "object" ? rawProxima : {}),
    },
  };
}

function buildHcSnapshot(model) {
  const base = model && typeof model === "object" ? model : {};
  const hc = normalizeHistoriaData(base.hc || {});
  const diagnosticos = Array.isArray(base.diagnosticos) ? base.diagnosticos : [];
  return JSON.stringify({ hc, diagnosticos });
}

function HistoriaClinicaPage() {
  const { pacienteId, consultaId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const searchParams = new URLSearchParams(location.search);
  const navigationState = location.state && typeof location.state === 'object' ? location.state : null;
  const readOnly = location.pathname.startsWith('/historia-clinica-lectura') || searchParams.get('read_only') === '1';
  const backTo = searchParams.get('back_to') || '';
  const restoreConsultaIdFromQuery = Number(searchParams.get('hc_prev_consulta_id') || 0);
  const restoreIndexRawFromQuery = searchParams.get('hc_prev_index');
  const hasRestoreIndexInQuery = restoreIndexRawFromQuery !== null && String(restoreIndexRawFromQuery).trim() !== '';
  const restoreIndexFromQuery = hasRestoreIndexInQuery ? Number(restoreIndexRawFromQuery) : Number.NaN;
  const restoreShowDetailFromQuery = searchParams.get('hc_prev_show_detail') === '1';
  const restoreTabFromQuery = String(searchParams.get('hc_prev_tab') || '').trim().toLowerCase();
  const { componentRef: printRef, handlePrint: handlePrintHC } = usePrintHistoriaClinica();
  const { componentRef: printLabRef, handlePrint: handlePrintLab } = usePrintLaboratorio();
  const { componentRef: printRecetaRef, handlePrint: handlePrintReceta } = usePrintReceta();
  const { componentRef: printImagenRef, handlePrint: handlePrintImagen } = usePrintServicios('Solicitud de Imagenes Diagnosticas');
  const { componentRef: printProcRef, handlePrint: handlePrintProcedimientos } = usePrintServicios('Solicitud de Procedimientos');
  const { componentRef: printInformeProcRef, handlePrint: handlePrintInformeProcedimiento } = usePrintInformeProcedimiento('Informe de Procedimiento Medico');
  const [medicoInfo, setMedicoInfo] = useState(null);
  const [configuracionClinica, setConfiguracionClinica] = useState(null);
  const [firmaMedico, setFirmaMedico] = useState(null);
  const [resultadosLab, setResultadosLab] = useState([]);
  const [ordenesLab, setOrdenesLab] = useState([]);
  const [ordenesImagenPrint, setOrdenesImagenPrint] = useState([]);
  const [ordenesProcedimientosPrint, setOrdenesProcedimientosPrint] = useState([]);
  const [recetaSugerencias, setRecetaSugerencias] = useState({
    medico: [],
    especialidad: [],
    general: [],
  });
  const [tratamientoEstado, setTratamientoEstado] = useState({
    loading: false,
    data: null,
    error: "",
  });
  const [fechaConsulta, setFechaConsulta] = useState("");
  const [consultaActual, setConsultaActual] = useState(null);
  const [historiasPrevias, setHistoriasPrevias] = useState([]);
  const [indiceHistoriaPrevia, setIndiceHistoriaPrevia] = useState(0);
  const [hcAnterior, setHcAnterior] = useState(null);
  const [hcAnteriorError, setHcAnteriorError] = useState("");
  const [hcAnteriorLoading, setHcAnteriorLoading] = useState(false);
  const [drawerHistorialAbierto, setDrawerHistorialAbierto] = useState(false);
  const [mostrarHcAnterior, setMostrarHcAnterior] = useState(false);
  const [tratamientoEstadoHcPrevia, setTratamientoEstadoHcPrevia] = useState({
    loading: false,
    data: null,
    error: "",
  });
  const [previewAdjuntoImagen, setPreviewAdjuntoImagen] = useState(null);
  const [mostrarImportarDiagnosticoModal, setMostrarImportarDiagnosticoModal] = useState(false);
  const [vistaClinicaActiva, setVistaClinicaActiva] = useState('registro');
  const restoreHistorialRef = useRef(false);
  const restorePreviasUiRef = useRef(false);
  const previasUiStorageKey = useMemo(
    () => buildPreviasUiStorageKey(consultaId, pacienteId),
    [consultaId, pacienteId]
  );
  const clearHistoryRestoreState = useCallback(() => {
    if (!navigationState) return;

    const restoreKeys = [
      'openHistoryDrawer',
      'restoreHistoryDrawer',
      'showHistoryDetail',
      'restoreHistoryDetail',
      'historyConsultaId',
      'historyIndex',
      'restoreContinuidadTab',
      'historyShowDetail',
    ];

    const hasRestoreState = restoreKeys.some((key) => Object.prototype.hasOwnProperty.call(navigationState, key));
    if (!hasRestoreState) return;

    const nextState = { ...navigationState };
    restoreKeys.forEach((key) => {
      delete nextState[key];
    });

    navigate(`${location.pathname}${location.search || ''}`, {
      replace: true,
      state: Object.keys(nextState).length > 0 ? nextState : undefined,
    });
  }, [location.pathname, location.search, navigate, navigationState]);

  const clearHistoryRestoreQuery = useCallback(() => {
    const restoreKeys = ['hc_prev_consulta_id', 'hc_prev_index', 'hc_prev_show_detail', 'hc_prev_tab'];
    const params = new URLSearchParams(location.search || '');
    let changed = false;
    restoreKeys.forEach((k) => {
      if (params.has(k)) {
        params.delete(k);
        changed = true;
      }
    });
    if (!changed) return;

    const nextSearch = params.toString();
    navigate(`${location.pathname}${nextSearch ? `?${nextSearch}` : ''}`, {
      replace: true,
      state: navigationState || undefined,
    });
  }, [location.pathname, location.search, navigate, navigationState]);

  const cerrarDrawerHistorial = useCallback(() => {
    setDrawerHistorialAbierto(false);
    clearHistoryRestoreState();
  }, [clearHistoryRestoreState]);

  useEffect(() => {
    if (!consultaId) return;
    const noCache = `_t=${Date.now()}`;
    authFetch(`api_resultados_laboratorio.php?consulta_id=${consultaId}&${noCache}`, {
      cache: 'no-store',
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.resultados) setResultadosLab(data.resultados);
        else setResultadosLab([]);
      })
      .catch(() => setResultadosLab([]));
    authFetch(`api_ordenes_laboratorio.php?consulta_id=${consultaId}&${noCache}`, {
      cache: 'no-store',
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.ordenes)) {
          setOrdenesLab(data.ordenes);
        } else {
          setOrdenesLab([]);
        }
      })
      .catch(() => setOrdenesLab([]));

    authFetch(`api_ordenes_imagen.php?consulta_id=${consultaId}&${noCache}`, {
      cache: 'no-store',
    })
      .then((res) => res.json())
      .then((data) => {
        const rows = Array.isArray(data?.ordenes) ? data.ordenes : [];
        const activas = rows.filter((o) => String(o?.estado || '').toLowerCase() !== 'cancelado');
        setOrdenesImagenPrint(activas);
      })
      .catch(() => setOrdenesImagenPrint([]));

    authFetch(`api_ordenes_procedimientos.php?consulta_id=${consultaId}&${noCache}`, {
      cache: 'no-store',
    })
      .then((res) => res.json())
      .then((data) => {
        const rows = Array.isArray(data?.ordenes) ? data.ordenes : [];
        const activas = rows.filter((o) => String(o?.estado || '').toLowerCase() !== 'cancelado');
        setOrdenesProcedimientosPrint(activas);
      })
      .catch(() => setOrdenesProcedimientosPrint([]));
  }, [consultaId]);

  useEffect(() => {
    const consultaIdNum = Number(consultaId || 0);
    if (consultaIdNum <= 0) {
      setRecetaSugerencias({ medico: [], especialidad: [], general: [] });
      return;
    }

    let cancelled = false;

    authFetch(`api_receta_sugerencias.php?consulta_id=${consultaIdNum}&limit=10&sample=300`, { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const sugerencias = data?.sugerencias && typeof data.sugerencias === "object" ? data.sugerencias : {};
        setRecetaSugerencias({
          medico: Array.isArray(sugerencias.medico) ? sugerencias.medico : [],
          especialidad: Array.isArray(sugerencias.especialidad) ? sugerencias.especialidad : [],
          general: Array.isArray(sugerencias.general) ? sugerencias.general : [],
        });
      })
      .catch(() => {
        if (cancelled) return;
        setRecetaSugerencias({ medico: [], especialidad: [], general: [] });
      });

    return () => {
      cancelled = true;
    };
  }, [consultaId]);

  useEffect(() => {
    if (!consultaId) {
      setTratamientoEstado({ loading: false, data: null, error: "" });
      return;
    }

    let cancelled = false;
    setTratamientoEstado({ loading: true, data: null, error: "" });

    authFetch(
      `api_tratamientos_enfermeria.php?consulta_id=${consultaId}&estado=pendiente,en_ejecucion,completado,suspendido`,
      { cache: "no-store" }
    )
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const rows = Array.isArray(data?.data) ? data.data : [];
        const ordered = [...rows].sort((a, b) => {
          const vDiff = Number(b?.version_num || 0) - Number(a?.version_num || 0);
          if (vDiff !== 0) return vDiff;
          return Number(b?.id || 0) - Number(a?.id || 0);
        });
        const noSuspendidos = ordered.filter((t) => String(t?.estado || "") !== "suspendido");
        const principal = noSuspendidos[0] || ordered[0] || null;

        if (!principal) {
          setTratamientoEstado({ loading: false, data: null, error: "" });
          return;
        }

        const progresoRaw = Number(principal?.progreso_pct || 0);
        const progresoPct = Number.isFinite(progresoRaw)
          ? Math.max(0, Math.min(100, progresoRaw))
          : 0;

        setTratamientoEstado({
          loading: false,
          error: "",
          data: {
            ...principal,
            progreso_pct: progresoPct,
            total_dias: Number(principal?.total_dias || 0),
            dias_cerrados: Number(principal?.dias_cerrados || 0),
            pendientes_hoy: Number(principal?.pendientes_hoy || 0),
            dia_actual: Number(principal?.dia_actual || 0),
          },
        });
      })
      .catch(() => {
        if (cancelled) return;
        setTratamientoEstado({
          loading: false,
          data: null,
          error: "No se pudo cargar el avance del tratamiento.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [consultaId]);

  const formatearFechaEvento = (rawValue) => {
    if (!rawValue) return "-";
    const parsed = new Date(String(rawValue).replace(" ", "T"));
    if (Number.isNaN(parsed.getTime())) return String(rawValue);
    return parsed.toLocaleString("es-PE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatearFechaCorta = (rawValue) => {
    if (!rawValue) return "-";
    const parsed = new Date(String(rawValue).replace(" ", "T"));
    if (Number.isNaN(parsed.getTime())) return String(rawValue);
    return parsed.toLocaleDateString("es-PE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const formatearFechaConsultaActual = (fechaRaw, horaRaw = "") => {
    const fechaTexto = String(fechaRaw || "").trim();
    const horaTexto = String(horaRaw || "").trim();
    if (!fechaTexto) return "-";

    if (/^\d{4}-\d{2}-\d{2}$/.test(fechaTexto)) {
      const [y, m, d] = fechaTexto.split("-").map(Number);
      const fecha = new Date(y, (m || 1) - 1, d || 1);
      if (Number.isNaN(fecha.getTime())) return horaTexto ? `${fechaTexto} ${horaTexto}` : fechaTexto;
      const base = fecha.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" });
      return horaTexto ? `${base} ${horaTexto}` : base;
    }

    const parsed = new Date(fechaTexto.replace(" ", "T"));
    if (Number.isNaN(parsed.getTime())) return horaTexto ? `${fechaTexto} ${horaTexto}` : fechaTexto;

    return parsed.toLocaleString("es-PE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const extraerTextoDiagnostico = (dx) => {
    if (!dx) return "";
    if (typeof dx === "string") return dx;
    if (typeof dx !== "object") return "";
    const codigo = String(dx.codigo || dx.cie10 || dx.cie10_codigo || "").trim();
    const descripcion = String(dx.descripcion || dx.diagnostico || dx.nombre || "").trim();
    if (codigo && descripcion) return `${codigo} - ${descripcion}`;
    return descripcion || codigo;
  };

  const formatFieldLabel = (fieldKey) => {
    if (!fieldKey) return "Campo";
    if (String(fieldKey).toLowerCase() === "fur") return "FUR";
    return String(fieldKey)
      .replace(/_/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  };

  const extraerValorVisible = (raw) => {
    if (raw == null) return "";
    if (typeof raw === "string") return raw.trim();
    if (typeof raw === "number") return Number.isFinite(raw) ? String(raw) : "";
    if (typeof raw === "boolean") return raw ? "Si" : "No";
    if (Array.isArray(raw)) {
      const values = raw
        .map((item) => {
          if (typeof item === "string") return item.trim();
          if (typeof item === "number") return String(item);
          return "";
        })
        .filter(Boolean);
      return values.join(", ");
    }
    return "";
  };

  const obtenerTextoDesdeCampos = (datos, aliases = [], keyPattern = null) => {
    if (!datos || typeof datos !== "object") return "";

    for (const key of aliases) {
      const raw = datos[key];
      if (typeof raw === "string" && raw.trim() !== "") {
        return raw.trim();
      }
    }

    if (keyPattern instanceof RegExp) {
      const entries = Object.entries(datos);
      for (const [key, value] of entries) {
        if (!keyPattern.test(String(key))) continue;
        if (typeof value === "string" && value.trim() !== "") {
          return value.trim();
        }
      }
    }

    return "";
  };
  const [paciente, setPaciente] = useState(null);
  const [triaje, setTriaje] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hc, setHc] = useState({
    tiempo_enfermedad: "",
    forma_inicio: "",
    curso: "",
    antecedentes: "",
    examen_fisico: "",
    tratamiento: "",
    recomendaciones: "",
    receta: [],
    proxima_cita: { ...DEFAULT_PROXIMA_CITA },
  });
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState("");
  const [mostrarModalGuardado, setMostrarModalGuardado] = useState(false);
  const [mensajeModalGuardado, setMensajeModalGuardado] = useState("");
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [serverSnapshot, setServerSnapshot] = useState("");
  const [bloqueoGuardadoHasta, setBloqueoGuardadoHasta] = useState(0);
  const [diagnosticos, setDiagnosticos] = useState([]);
  const [hcTemplateMeta, setHcTemplateMeta] = useState(null);
  const [hcTemplateResolution, setHcTemplateResolution] = useState(null);
  const hcRef = useRef(hc);
  const diagnosticosRef = useRef(diagnosticos);
  const bloqueoGuardadoActivo = Date.now() < bloqueoGuardadoHasta;
  const draftKey = useMemo(() => buildDraftStorageKey(consultaId, pacienteId), [consultaId, pacienteId]);

  const hcTemplateDebug = useMemo(() => {
    const tplId = String(hcTemplateMeta?.id || '').trim();
    const tplVersion = String(hcTemplateMeta?.version || '').trim();
    const source = String(hcTemplateMeta?.source || '').trim();
    const resolvedBy = String(hcTemplateResolution?.resolved_by || '').trim();
    const policyMode = String(hcTemplateResolution?.policy_mode || '').trim();

    const sourceLabelMap = {
      clinica_override: 'Clínica',
      clinica_default: 'Clínica (default)',
      builtin: 'Sistema',
    };

    return {
      hasTemplate: tplId !== '',
      templateLabel: tplVersion ? `${tplId} v${tplVersion}` : tplId,
      sourceLabel: sourceLabelMap[source] || source || 'No definido',
      resolvedBy: resolvedBy || 'default',
      policyMode: policyMode || 'auto',
      isFallbackBuiltin: source === 'builtin',
      isDefaultFallback: resolvedBy === 'clinica_default_fallback',
    };
  }, [hcTemplateMeta, hcTemplateResolution]);

  useEffect(() => {
    hcRef.current = hc;
  }, [hc]);

  useEffect(() => {
    diagnosticosRef.current = diagnosticos;
  }, [diagnosticos]);

  const persistDraftNow = useCallback(() => {
    if (readOnly || !draftKey) return;
    try {
      const payload = {
        version: 1,
        consulta_id: String(consultaId || ""),
        paciente_id: String(pacienteId || ""),
        updated_at: Date.now(),
        hc: normalizeHistoriaData(hcRef.current),
        diagnosticos: Array.isArray(diagnosticosRef.current) ? diagnosticosRef.current : [],
      };
      sessionStorage.setItem(draftKey, JSON.stringify(payload));
    } catch {
      // Ignorar errores de storage para no bloquear el flujo clínico.
    }
  }, [consultaId, draftKey, pacienteId, readOnly]);

  const clearDraft = useCallback(() => {
    if (!draftKey) return;
    try {
      sessionStorage.removeItem(draftKey);
    } catch {
      // Ignorar errores de storage.
    }
  }, [draftKey]);

  const currentSnapshot = useMemo(
    () => buildHcSnapshot({ hc, diagnosticos }),
    [hc, diagnosticos]
  );

  useEffect(() => {
    if (!consultaId) return;
    const templateQuery = HC_TEMPLATE_ENGINE_READ ? '&include_template=1' : '';
    setDraftHydrated(false);
    authFetch(`api_historia_clinica.php?consulta_id=${consultaId}${templateQuery}`, {
      cache: 'no-store',
    })
      .then((res) => res.json())
      .then((data) => {
        const fromApiHc = normalizeHistoriaData(data.success && data.datos ? data.datos : {});
        const fromApiDiagnosticos = Array.isArray(data?.datos?.diagnosticos) ? data.datos.diagnosticos : [];
        const apiSnapshot = buildHcSnapshot({ hc: fromApiHc, diagnosticos: fromApiDiagnosticos });
        setServerSnapshot(apiSnapshot);
        setHc(fromApiHc);
        setDiagnosticos(fromApiDiagnosticos);

        // Si el backend devolvió un próximo evento del contrato y la HC no tiene próxima
        // cita definida aún, pre-activar la sección con los datos del contrato.
        const proximaContrato = data?.proxima_contrato_evento;
        if (!readOnly && proximaContrato && proximaContrato.consulta_id > 0) {
          const proxExistente = fromApiHc?.proxima_cita || {};
          const yaDefinida = Boolean(proxExistente?.programar) ||
            String(proxExistente?.fecha || '').trim() ||
            String(proxExistente?.hora || '').trim();
          if (!yaDefinida) {
            setHc((current) => {
              const currProx = current?.proxima_cita || {};
              if (Boolean(currProx?.programar) || String(currProx?.fecha || '').trim() || String(currProx?.hora || '').trim()) {
                return current;
              }
              return {
                ...current,
                proxima_cita: {
                  ...DEFAULT_PROXIMA_CITA,
                  programar: true,
                  consulta_id: Number(proximaContrato.consulta_id) || null,
                  fecha: String(proximaContrato.fecha || '').slice(0, 10),
                  hora: String(proximaContrato.hora || '').slice(0, 5),
                  medico_id: String(proximaContrato.medico_id || ''),
                  es_control: Boolean(proximaContrato.es_control),
                  origen: 'contrato_agenda',
                },
              };
            });
          }
        }

        if (!readOnly && draftKey) {
          try {
            const rawDraft = sessionStorage.getItem(draftKey);
            if (rawDraft) {
              const parsedDraft = JSON.parse(rawDraft);
              const ageMs = Date.now() - Number(parsedDraft?.updated_at || 0);
              const expired = !Number.isFinite(ageMs) || ageMs < 0 || ageMs > HC_DRAFT_TTL_MS;
              if (expired) {
                sessionStorage.removeItem(draftKey);
              } else {
                const draftModel = {
                  hc: normalizeHistoriaData(parsedDraft?.hc || {}),
                  diagnosticos: Array.isArray(parsedDraft?.diagnosticos) ? parsedDraft.diagnosticos : [],
                };
                const draftSnapshot = buildHcSnapshot(draftModel);
                if (draftSnapshot && draftSnapshot !== apiSnapshot) {
                  setHc(normalizeHistoriaData(draftModel.hc || {}));
                  setDiagnosticos(Array.isArray(draftModel.diagnosticos) ? draftModel.diagnosticos : []);
                } else if (draftSnapshot === apiSnapshot) {
                  sessionStorage.removeItem(draftKey);
                }
              }
            }
          } catch {
            // Si el borrador está corrupto, se ignora y se continúa con backend.
          }
        }

        setDraftHydrated(true);
        if (HC_TEMPLATE_ENGINE_READ) {
          setHcTemplateMeta(data.template || null);
          setHcTemplateResolution(data.template_resolution || null);
        }
      })
      .catch(() => {
        setDraftHydrated(true);
      });
  }, [consultaId, draftKey, readOnly]);

  useEffect(() => {
    if (readOnly || !draftHydrated || !draftKey) return;
    const timer = window.setTimeout(() => {
      if (serverSnapshot && currentSnapshot === serverSnapshot) {
        clearDraft();
        return;
      }
      // Solo persistir draft en sessionStorage, no hacer guardado automático en BD.
      // El guardado debe ser explícito: solo cuando usuario hace click en "Guardar"
      persistDraftNow();
    }, 800);
    return () => window.clearTimeout(timer);
  }, [clearDraft, currentSnapshot, draftHydrated, draftKey, persistDraftNow, readOnly, serverSnapshot]);

  // Auto-close success modal after 2 seconds
  useEffect(() => {
    if (!mostrarModalGuardado) return;
    const timer = window.setTimeout(() => {
      setMostrarModalGuardado(false);
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [mostrarModalGuardado]);

  useEffect(() => {
    const sections = hcTemplateMeta?.sections;
    if (!sections || typeof sections !== "object") return;

    setHc((current) => {
      const next = { ...current };
      let changed = false;

      Object.values(sections).forEach((sectionFields) => {
        if (!sectionFields || typeof sectionFields !== "object" || Array.isArray(sectionFields)) return;
        Object.keys(sectionFields).forEach((fieldKey) => {
          if (typeof next[fieldKey] === "undefined") {
            next[fieldKey] = "";
            changed = true;
          }
        });
      });

      return changed ? next : current;
    });
  }, [hcTemplateMeta]);

  useEffect(() => {
    if (!medicoInfo?.id) return;
    setHc((current) => {
      const actual = current.proxima_cita || DEFAULT_PROXIMA_CITA;
      if (actual.medico_id) return current;
      return {
        ...current,
        proxima_cita: {
          ...DEFAULT_PROXIMA_CITA,
          ...actual,
          medico_id: String(medicoInfo.id),
        },
      };
    });
  }, [medicoInfo]);

  useEffect(() => {
    let cancelled = false;

    const hidratarProximaDesdeConsultas = async () => {
      const actualConsultaId = Number(consultaId || 0);
      const actualMedicoId = Number(consultaActual?.medico_id || 0);
      const actualPacienteId = Number(pacienteId || consultaActual?.paciente_id || 0);
      const proximaActual = hc?.proxima_cita || DEFAULT_PROXIMA_CITA;

      // No pisar datos si ya existe próxima cita definida manualmente o cargada desde backend.
      if (Boolean(proximaActual?.programar) || String(proximaActual?.fecha || '').trim() || String(proximaActual?.hora || '').trim()) {
        return;
      }

      if (actualConsultaId <= 0 || actualPacienteId <= 0 || actualMedicoId <= 0) {
        return;
      }

      try {
        const res = await authFetch(`api_consultas.php?paciente_id=${actualPacienteId}&solo_activas=1`, {
          cache: 'no-store',
        });
        const data = await res.json();
        const consultas = Array.isArray(data?.consultas) ? data.consultas : [];
        if (consultas.length === 0) return;

        const fechaActual = String(consultaActual?.fecha || '').trim();
        const horaActual = String(consultaActual?.hora || '').trim();
        const tsActual = Date.parse(`${fechaActual}T${horaActual || '00:00:00'}`);

        const baseCandidatas = consultas
          .filter((c) => Number(c?.id || 0) !== actualConsultaId)
          .filter((c) => Number(c?.medico_id || 0) === actualMedicoId)
          .map((c) => {
            const fecha = String(c?.fecha || '').trim();
            const hora = String(c?.hora || '').trim();
            const ts = Date.parse(`${fecha}T${hora || '00:00:00'}`);
            return { c, fecha, hora, ts };
          })
          .filter((item) => !Number.isNaN(item.ts))
          .filter((item) => Number.isNaN(tsActual) || item.ts >= tsActual);

        // Fuente primaria: cita explícitamente encadenada a la consulta actual.
        const candidatasVinculadas = baseCandidatas
          .filter((item) => Number(item?.c?.hc_origen_id || 0) === actualConsultaId)
          .sort((a, b) => a.ts - b.ts);

        // Fuente secundaria: sólo si no hubo vinculada, usar agenda de contrato/hc_proxima.
        const candidatasContrato = baseCandidatas
          .filter((item) => {
            const origen = String(item?.c?.origen_creacion || '').toLowerCase().trim();
            return origen === 'contrato_agenda' || origen === 'hc_proxima';
          })
          .sort((a, b) => a.ts - b.ts);

        const objetivo = (candidatasVinculadas[0] || candidatasContrato[0])?.c;
        if (!objetivo || cancelled) return;

        setHc((current) => {
          const currProx = current?.proxima_cita || DEFAULT_PROXIMA_CITA;
          if (Boolean(currProx?.programar) || String(currProx?.fecha || '').trim() || String(currProx?.hora || '').trim()) {
            return current;
          }

          return {
            ...current,
            proxima_cita: {
              ...DEFAULT_PROXIMA_CITA,
              ...currProx,
              programar: true,
              consulta_id: Number(objetivo?.id || 0) || null,
              fecha: String(objetivo?.fecha || '').slice(0, 10),
              hora: String(objetivo?.hora || '').slice(0, 5),
              medico_id: String(objetivo?.medico_id || actualMedicoId || ''),
              es_control: Number(objetivo?.es_control || 0) === 1,
              origen: String(objetivo?.origen_creacion || 'contrato_agenda'),
            },
          };
        });
      } catch {
        // Si falla este lookup, no bloquea la apertura de HC.
      }
    };

    hidratarProximaDesdeConsultas();
    return () => {
      cancelled = true;
    };
  }, [consultaId, consultaActual?.fecha, consultaActual?.hora, consultaActual?.medico_id, consultaActual?.paciente_id, hc?.proxima_cita, pacienteId]);

  useEffect(() => {
    if (!pacienteId) return;
    setLoading(true);
    authFetch(`api_pacientes.php?id=${pacienteId}`, {
      cache: 'no-store',
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.paciente) setPaciente(data.paciente);
        else setError(data.error || "No se encontró el paciente");
        setLoading(false);
      })
      .catch(() => {
        setError("Error de conexión con el servidor");
        setLoading(false);
      });
  }, [pacienteId]);
  useEffect(() => {
    if (!consultaId) return;
    authFetch(`api_triaje.php?consulta_id=${consultaId}`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.triaje && data.triaje.datos)
          setTriaje(data.triaje.datos);
        else setTriaje(null);
      })
      .catch(() => setTriaje(null));
  }, [consultaId]);
  useEffect(() => {
    authFetch("api_get_configuracion.php", { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data) {
          setConfiguracionClinica(data.data);
        }
      })
      .catch(() => setConfiguracionClinica(null));
  }, []);
  useEffect(() => {
    let cancelled = false;

    const cargarMedicoDesdeConsulta = async () => {
      if (!consultaId) {
        if (!cancelled) {
          setMedicoInfo(null);
          setFirmaMedico(null);
          setFechaConsulta("");
        }
        return;
      }

      try {
        const res = await authFetch(`api_consultas.php?consulta_id=${consultaId}`, {
          cache: 'no-store',
        });
        const data = await res.json();
        const consulta = Array.isArray(data?.consultas) ? data.consultas[0] : null;

        if (consulta) {
          const fechaRaw = String(
            consulta.fecha_consulta
            || consulta.fecha
            || consulta.created_at
            || consulta.fecha_hora
            || ""
          ).trim();

          const medicoConsulta = {
            id: consulta.medico_id || null,
            nombre: consulta.medico_nombre || '',
            apellido: consulta.medico_apellido || '',
            especialidad: consulta.medico_especialidad || '',
            tipo_profesional: consulta.medico_tipo_profesional || 'medico',
            abreviatura_profesional: consulta.medico_abreviatura_profesional || 'Dr(a).',
            colegio_sigla: consulta.medico_colegio_sigla || 'CMP',
            nro_colegiatura: consulta.medico_nro_colegiatura || consulta.medico_cmp || '',
            cmp: consulta.medico_cmp || '',
            rne: consulta.medico_rne || '',
            firma: consulta.medico_firma || null,
          };

          if (!cancelled) {
            setConsultaActual(consulta);
            setMedicoInfo(medicoConsulta);
            setFirmaMedico(medicoConsulta.firma || null);
            setFechaConsulta(fechaRaw);
          }
          return;
        }
      } catch {
        // Fallback below to session data when query fails.
      }

      const medicoSession = JSON.parse(sessionStorage.getItem('medico') || 'null');
      if (!cancelled) {
        setConsultaActual(null);
        if (medicoSession) {
          setMedicoInfo(medicoSession);
          setFirmaMedico(medicoSession.firma || null);
        } else {
          setMedicoInfo(null);
          setFirmaMedico(null);
        }
        setFechaConsulta("");
      }
    };

    cargarMedicoDesdeConsulta();

    return () => {
      cancelled = true;
    };
  }, [consultaId]);

  useEffect(() => {
    const consultaIdActual = Number(consultaId || 0);
    if (consultaIdActual <= 0) {
      setHistoriasPrevias([]);
      setIndiceHistoriaPrevia(0);
      setHcAnterior(null);
      setHcAnteriorError("");
      setDrawerHistorialAbierto(false);
      setMostrarHcAnterior(false);
      setHcAnteriorLoading(false);
      return;
    }

    setHistoriasPrevias([]);
    setIndiceHistoriaPrevia(0);
    setHcAnterior(null);
    setHcAnteriorError("");
    setDrawerHistorialAbierto(false);
    setMostrarHcAnterior(false);

    let cancelled = false;

    const resolvePreferredPreviaIndex = (chain) => {
      if (!Array.isArray(chain) || chain.length === 0) {
        return 0;
      }

      let nextIndex = -1;

      const targetConsultaIdNav = Number(navigationState?.historyConsultaId || 0);
      const targetIndexNavRaw = Number(navigationState?.historyIndex);
      if (targetConsultaIdNav > 0) {
        nextIndex = chain.findIndex((item) => Number(item?.consulta_id || 0) === targetConsultaIdNav);
      }
      if (nextIndex < 0 && Number.isFinite(targetIndexNavRaw)) {
        nextIndex = Math.max(0, Math.min(targetIndexNavRaw, chain.length - 1));
      }

      if (nextIndex < 0 && restoreConsultaIdFromQuery > 0) {
        nextIndex = chain.findIndex((item) => Number(item?.consulta_id || 0) === restoreConsultaIdFromQuery);
      }
      if (nextIndex < 0 && hasRestoreIndexInQuery && Number.isFinite(restoreIndexFromQuery)) {
        nextIndex = Math.max(0, Math.min(restoreIndexFromQuery, chain.length - 1));
      }

      if (nextIndex < 0) {
        const uiKey = buildPreviasUiStorageKey(consultaId, pacienteId);
        if (uiKey) {
          try {
            const rawUi = sessionStorage.getItem(uiKey);
            if (rawUi) {
              const parsedUi = JSON.parse(rawUi);
              const selectedConsultaId = Number(parsedUi?.selected_consulta_id || 0);
              const selectedIndexRaw = Number(parsedUi?.selected_index);
              if (selectedConsultaId > 0) {
                nextIndex = chain.findIndex((item) => Number(item?.consulta_id || 0) === selectedConsultaId);
              }
              if (nextIndex < 0 && Number.isFinite(selectedIndexRaw)) {
                nextIndex = Math.max(0, Math.min(selectedIndexRaw, chain.length - 1));
              }
            }
          } catch {
            // Ignorar estado inválido de sesión.
          }
        }
      }

      if (nextIndex < 0) {
        nextIndex = 0;
      }

      return nextIndex;
    };

    const cacheKey = `hc_previas_chain_v1_${consultaId}`;
    let cacheHit = false;
    try {
      const raw = sessionStorage.getItem(cacheKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        const ageMs = Date.now() - Number(parsed?.timestamp || 0);
        const sameConsulta = Number(parsed?.consulta_id || 0) === consultaIdActual;
        if (sameConsulta && ageMs >= 0 && ageMs <= HC_PREVIAS_CACHE_TTL_MS && Array.isArray(parsed?.chain)) {
          const chain = parsed.chain;
          const preferredIndex = resolvePreferredPreviaIndex(chain);
          setHistoriasPrevias(chain);
          setIndiceHistoriaPrevia(preferredIndex);
          setHcAnterior(chain[preferredIndex] || chain[0] || null);
          setHcAnteriorError(chain.length === 0 ? 'No hay historias clínicas previas encadenadas.' : '');
          setHcAnteriorLoading(false);
          cacheHit = true;
        }
      }
    } catch {
      // Cache inválido: continuar con fetch normal.
    }

    if (!cacheHit) {
      setHcAnteriorLoading(true);
    }

    const cargarHcAnterior = async () => {
      try {
        const res = await authFetch(`api_historia_clinica.php?consulta_id=${consultaId}&include_chain=1`);
        const data = await res.json();
        if (cancelled) return;
        const chain = Array.isArray(data.historias_previas) ? data.historias_previas : [];
        if (data.success || chain.length > 0) {
          const preferredIndex = resolvePreferredPreviaIndex(chain);
          setHistoriasPrevias(chain);
          setIndiceHistoriaPrevia(preferredIndex);
          setHcAnterior(chain[preferredIndex] || chain[0] || null);
          setHcAnteriorError("");
          try {
            sessionStorage.setItem(cacheKey, JSON.stringify({
              timestamp: Date.now(),
              consulta_id: consultaIdActual,
              chain,
            }));
          } catch {
            // Ignorar error de storage y continuar.
          }
          if (chain.length === 0) {
            setHcAnteriorError('No hay historias clínicas previas encadenadas.');
          }
        } else {
          setHistoriasPrevias([]);
          setIndiceHistoriaPrevia(0);
          setHcAnterior(null);
          setHcAnteriorError(data.error || 'No se pudo cargar la HC anterior');
        }
      } catch {
        if (cancelled) return;
        setHistoriasPrevias([]);
        setIndiceHistoriaPrevia(0);
        setHcAnterior(null);
        setHcAnteriorError('Error al cargar la HC anterior');
      } finally {
        if (!cancelled) setHcAnteriorLoading(false);
      }
    };

    cargarHcAnterior();

    return () => {
      cancelled = true;
    };
  }, [
    consultaId,
    pacienteId,
    navigationState,
    hasRestoreIndexInQuery,
    restoreConsultaIdFromQuery,
    restoreIndexFromQuery,
  ]);

  useEffect(() => {
    if (!Array.isArray(historiasPrevias) || historiasPrevias.length === 0) {
      setHcAnterior(null);
      setIndiceHistoriaPrevia(0);
      return;
    }

    setIndiceHistoriaPrevia((prev) => {
      const next = Math.max(0, Math.min(prev, historiasPrevias.length - 1));
      setHcAnterior(historiasPrevias[next] || null);
      return next;
    });
  }, [historiasPrevias]);

  useEffect(() => {
    if (!Array.isArray(historiasPrevias) || historiasPrevias.length === 0) {
      setHcAnterior(null);
      return;
    }
    const safeIndex = Math.max(0, Math.min(indiceHistoriaPrevia, historiasPrevias.length - 1));
    setHcAnterior(historiasPrevias[safeIndex] || null);
  }, [indiceHistoriaPrevia, historiasPrevias]);

  useEffect(() => {
    restorePreviasUiRef.current = false;
  }, [consultaId, pacienteId]);

  useEffect(() => {
    if (restorePreviasUiRef.current) return;
    if (!previasUiStorageKey) return;
    if (!Array.isArray(historiasPrevias) || historiasPrevias.length === 0) return;

    const hasNavigationRestore = Boolean(
      navigationState && (
        navigationState.restoreContinuidadTab
        || navigationState.openHistoryDrawer
        || navigationState.restoreHistoryDrawer
        || navigationState.historyShowDetail
        || navigationState.showHistoryDetail
        || navigationState.restoreHistoryDetail
        || Number(navigationState.historyConsultaId || 0) > 0
        || Number.isFinite(Number(navigationState.historyIndex))
      )
    );

    if (hasNavigationRestore) {
      restorePreviasUiRef.current = true;
      return;
    }

    try {
      const raw = sessionStorage.getItem(previasUiStorageKey);
      if (!raw) {
        restorePreviasUiRef.current = true;
        return;
      }

      const parsed = JSON.parse(raw);
      const targetConsultaId = Number(parsed?.selected_consulta_id || 0);
      const targetIndexRaw = Number(parsed?.selected_index || 0);
      let nextIndex = -1;

      if (targetConsultaId > 0) {
        nextIndex = historiasPrevias.findIndex((item) => Number(item?.consulta_id || 0) === targetConsultaId);
      }

      if (nextIndex < 0) {
        nextIndex = Math.max(0, Math.min(Number.isFinite(targetIndexRaw) ? targetIndexRaw : 0, historiasPrevias.length - 1));
      }

      setIndiceHistoriaPrevia(nextIndex);
      if (parsed?.active_view === 'continuidad') {
        setVistaClinicaActiva('continuidad');
      }
      if (parsed?.show_detail) {
        setMostrarHcAnterior(true);
      }
    } catch {
      // Ignorar estado inválido guardado en sesión.
    }

    restorePreviasUiRef.current = true;
  }, [historiasPrevias, navigationState, previasUiStorageKey]);

  useEffect(() => {
    if (!previasUiStorageKey) return;
    if (!Array.isArray(historiasPrevias) || historiasPrevias.length === 0) return;

    const safeIndex = Math.max(0, Math.min(indiceHistoriaPrevia, historiasPrevias.length - 1));
    const selected = historiasPrevias[safeIndex] || null;

    try {
      sessionStorage.setItem(previasUiStorageKey, JSON.stringify({
        timestamp: Date.now(),
        selected_index: safeIndex,
        selected_consulta_id: Number(selected?.consulta_id || 0),
        show_detail: Boolean(mostrarHcAnterior),
        active_view: vistaClinicaActiva,
      }));
    } catch {
      // Ignorar errores de storage.
    }
  }, [historiasPrevias, indiceHistoriaPrevia, mostrarHcAnterior, previasUiStorageKey, vistaClinicaActiva]);

  useEffect(() => {
    const consultaPreviaId = Number(hcAnterior?.consulta_id || 0);
    if (consultaPreviaId <= 0) {
      setTratamientoEstadoHcPrevia({ loading: false, data: null, error: "" });
      return;
    }

    let cancelled = false;
    setTratamientoEstadoHcPrevia({ loading: true, data: null, error: "" });

    authFetch(
      `api_tratamientos_enfermeria.php?consulta_id=${consultaPreviaId}&estado=pendiente,en_ejecucion,completado,suspendido`,
      { cache: "no-store" }
    )
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const rows = Array.isArray(data?.data) ? data.data : [];
        const ordered = [...rows].sort((a, b) => {
          const versionDiff = Number(b?.version_num || 0) - Number(a?.version_num || 0);
          if (versionDiff !== 0) return versionDiff;
          return Number(b?.id || 0) - Number(a?.id || 0);
        });
        const activos = ordered.filter((t) => String(t?.estado || "") !== "suspendido");
        const principal = activos[0] || ordered[0] || null;

        if (!principal) {
          setTratamientoEstadoHcPrevia({ loading: false, data: null, error: "" });
          return;
        }

        const progreso = Number(principal?.progreso_pct || 0);
        setTratamientoEstadoHcPrevia({
          loading: false,
          error: "",
          data: {
            ...principal,
            progreso_pct: Number.isFinite(progreso) ? Math.max(0, Math.min(100, progreso)) : 0,
          },
        });
      })
      .catch(() => {
        if (cancelled) return;
        setTratamientoEstadoHcPrevia({
          loading: false,
          data: null,
          error: "No se pudo cargar el estado del tratamiento previo.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [hcAnterior?.consulta_id]);

  const totalHistoriasPrevias = Array.isArray(historiasPrevias) ? historiasPrevias.length : 0;
  useEffect(() => {
    const handleOpenHistoryDrawer = () => {
      if (totalHistoriasPrevias <= 0 || hcAnteriorLoading || hcAnteriorError) return;
      setDrawerHistorialAbierto(true);
    };

    window.addEventListener('hc-assistant-open-history-drawer', handleOpenHistoryDrawer);
    return () => window.removeEventListener('hc-assistant-open-history-drawer', handleOpenHistoryDrawer);
  }, [totalHistoriasPrevias, hcAnteriorLoading, hcAnteriorError]);

  useEffect(() => {
    if (restoreHistorialRef.current) return;
    if (!navigationState) return;

    const shouldRestoreContinuidad = Boolean(
      navigationState.restoreContinuidadTab
      || navigationState.openHistoryDrawer
      || navigationState.restoreHistoryDrawer
    );
    const shouldShowDetail = Boolean(
      navigationState.historyShowDetail
      || navigationState.showHistoryDetail
      || navigationState.restoreHistoryDetail
    );

    if (shouldRestoreContinuidad) {
      setVistaClinicaActiva('continuidad');
    }
    if (shouldShowDetail) {
      setMostrarHcAnterior(true);
    }

    if (shouldRestoreContinuidad || shouldShowDetail) {
      restoreHistorialRef.current = true;
    }
  }, [navigationState]);

  useEffect(() => {
    if (!navigationState || !Array.isArray(historiasPrevias) || historiasPrevias.length === 0) return;

    const hasHistoryConsultaId = Object.prototype.hasOwnProperty.call(navigationState, 'historyConsultaId');
    const hasHistoryIndex = Object.prototype.hasOwnProperty.call(navigationState, 'historyIndex');
    const targetConsultaId = hasHistoryConsultaId ? Number(navigationState.historyConsultaId || 0) : 0;
    const targetIndexRaw = hasHistoryIndex ? Number(navigationState.historyIndex) : Number.NaN;
    const shouldRestoreContinuidad = Boolean(
      navigationState.restoreContinuidadTab
      || navigationState.openHistoryDrawer
      || navigationState.restoreHistoryDrawer
      || (hasHistoryConsultaId && targetConsultaId > 0)
      || (hasHistoryIndex && Number.isFinite(targetIndexRaw))
    );
    let nextIndex = -1;

    if (targetConsultaId > 0) {
      nextIndex = historiasPrevias.findIndex((item) => Number(item?.consulta_id || 0) === targetConsultaId);
    }

    if (nextIndex < 0 && hasHistoryIndex && Number.isFinite(targetIndexRaw)) {
      nextIndex = Math.max(0, Math.min(Number.isFinite(targetIndexRaw) ? targetIndexRaw : 0, historiasPrevias.length - 1));
    }

    if (nextIndex < 0) {
      nextIndex = 0;
    }

    setIndiceHistoriaPrevia(nextIndex);
    if (shouldRestoreContinuidad) {
      setVistaClinicaActiva('continuidad');
    }
    if (navigationState.historyShowDetail || navigationState.showHistoryDetail || navigationState.restoreHistoryDetail) {
      setMostrarHcAnterior(true);
    }

    clearHistoryRestoreState();
  }, [clearHistoryRestoreState, navigationState, historiasPrevias]);

  useEffect(() => {
    if (!Array.isArray(historiasPrevias) || historiasPrevias.length === 0) return;

    const hasNavRestore = Boolean(
      navigationState && (
        navigationState.restoreContinuidadTab
        || navigationState.openHistoryDrawer
        || navigationState.restoreHistoryDrawer
        || navigationState.historyShowDetail
        || navigationState.showHistoryDetail
        || navigationState.restoreHistoryDetail
        || Number(navigationState.historyConsultaId || 0) > 0
        || Number.isFinite(Number(navigationState.historyIndex))
      )
    );
    if (hasNavRestore) return;

    const hasQueryRestore = restoreConsultaIdFromQuery > 0
      || (hasRestoreIndexInQuery && Number.isFinite(restoreIndexFromQuery))
      || restoreShowDetailFromQuery
      || restoreTabFromQuery === 'continuidad';
    if (!hasQueryRestore) return;

    let nextIndex = -1;
    if (restoreConsultaIdFromQuery > 0) {
      nextIndex = historiasPrevias.findIndex((item) => Number(item?.consulta_id || 0) === restoreConsultaIdFromQuery);
    }
    if (nextIndex < 0 && hasRestoreIndexInQuery && Number.isFinite(restoreIndexFromQuery)) {
      nextIndex = Math.max(0, Math.min(Number.isFinite(restoreIndexFromQuery) ? restoreIndexFromQuery : 0, historiasPrevias.length - 1));
    }
    if (nextIndex < 0) {
      nextIndex = 0;
    }

    setIndiceHistoriaPrevia(nextIndex);
    if (restoreTabFromQuery === 'continuidad') {
      setVistaClinicaActiva('continuidad');
    }
    if (restoreShowDetailFromQuery) {
      setMostrarHcAnterior(true);
    }

    clearHistoryRestoreQuery();
  }, [
    clearHistoryRestoreQuery,
    historiasPrevias,
    navigationState,
    restoreConsultaIdFromQuery,
    hasRestoreIndexInQuery,
    restoreIndexFromQuery,
    restoreShowDetailFromQuery,
    restoreTabFromQuery,
  ]);

  const persistPreviaSelection = useCallback((targetIndex, showDetail = true) => {
    if (!previasUiStorageKey) return;
    if (!Array.isArray(historiasPrevias) || historiasPrevias.length === 0) return;

    const safeIndex = Math.max(0, Math.min(Number(targetIndex || 0), historiasPrevias.length - 1));
    const selected = historiasPrevias[safeIndex] || null;

    try {
      sessionStorage.setItem(previasUiStorageKey, JSON.stringify({
        timestamp: Date.now(),
        selected_index: safeIndex,
        selected_consulta_id: Number(selected?.consulta_id || 0),
        show_detail: Boolean(showDetail),
        active_view: 'continuidad',
      }));
    } catch {
      // Ignorar errores de storage.
    }
  }, [historiasPrevias, previasUiStorageKey]);

  const irHistoriaAnterior = () => {
    if (totalHistoriasPrevias <= 0) return;
    setIndiceHistoriaPrevia((prev) => {
      const next = Math.min(prev + 1, totalHistoriasPrevias - 1);
      persistPreviaSelection(next, true);
      return next;
    });
  };
  const irHistoriaSiguiente = () => {
    if (totalHistoriasPrevias <= 0) return;
    setIndiceHistoriaPrevia((prev) => {
      const next = Math.max(prev - 1, 0);
      persistPreviaSelection(next, true);
      return next;
    });
  };
  const seleccionarHistoriaPrevia = (targetIndex) => {
    if (totalHistoriasPrevias <= 0) return;
    const safeIndex = Math.max(0, Math.min(Number(targetIndex || 0), totalHistoriasPrevias - 1));
    persistPreviaSelection(safeIndex, true);
    setIndiceHistoriaPrevia(safeIndex);
    setMostrarHcAnterior(true);
  };

  const importarDiagnosticoPrincipalRapido = () => {
    if (readOnly) return;
    const nuevos = Array.isArray(hcAnterior?.datos?.diagnosticos) ? hcAnterior.datos.diagnosticos : [];
    if (nuevos.length === 0) return;

    const principal = nuevos.find((dx) => {
      if (!dx || typeof dx !== 'object') return false;
      return String(dx.tipo || '').trim().toLowerCase() === 'principal';
    }) || nuevos[0];

    const key = (dx) => {
      if (typeof dx === 'string') return dx.trim().toLowerCase();
      if (!dx || typeof dx !== 'object') return '';
      return `${String(dx.codigo || dx.cie10 || '').trim().toLowerCase()}|${String(dx.nombre || dx.descripcion || dx.diagnostico || '').trim().toLowerCase()}`;
    };

    let inserted = false;
    setDiagnosticos((actuales) => {
      const base = Array.isArray(actuales) ? actuales : [];
      const exists = new Set(base.map(key).filter(Boolean));
      const k = key(principal);
      if (!k || exists.has(k)) return base;
      inserted = true;
      return [...base, principal];
    });

    setMsg(inserted
      ? 'Diagnóstico principal importado desde HC previa.'
      : 'El diagnóstico principal ya estaba en la HC actual.');
  };

  useEffect(() => {
    if (vistaClinicaActiva !== 'continuidad') return;
    if (totalHistoriasPrevias <= 0) return;
    setMostrarHcAnterior(true);
  }, [vistaClinicaActiva, totalHistoriasPrevias]);

  const adjuntosDocumentos = Array.isArray(hcAnterior?.adjuntos) ? hcAnterior.adjuntos : [];
  const adjuntosArchivos = adjuntosDocumentos.flatMap((doc, docIndex) => {
    const archivos = Array.isArray(doc?.archivos) ? doc.archivos : [];
    return archivos.map((archivo, index) => ({
      ...archivo,
      _docTitulo: String(doc?.titulo || doc?.descripcion || `Documento ${docIndex + 1}`).trim(),
      _docTipo: String(doc?.tipo || '').trim(),
      _docIndex: docIndex,
      _index: index,
    }));
  });
  const adjuntosImagenes = adjuntosArchivos.filter((a) => {
    const kind = String(a?.kind || '').toLowerCase();
    const mime = String(a?.mime_type || '').toLowerCase();
    return kind === 'imagen' || mime.startsWith('image/');
  });
  const adjuntosPdf = adjuntosArchivos.filter((a) => {
    const kind = String(a?.kind || '').toLowerCase();
    const mime = String(a?.mime_type || '').toLowerCase();
    return kind === 'pdf' || mime === 'application/pdf' || String(a?.nombre_original || '').toLowerCase().endsWith('.pdf');
  });
  const apoyoDiagnosticoPrevio = hcAnterior?.apoyo_diagnostico || null;
  const apoyoLaboratorio = apoyoDiagnosticoPrevio?.laboratorio || null;
  const apoyoEcografia = apoyoDiagnosticoPrevio?.ecografia || null;
  const apoyoRx = apoyoDiagnosticoPrevio?.rx || null;
  const apoyoTomografia = apoyoDiagnosticoPrevio?.tomografia || null;
  const laboratorioDisponible = Boolean(apoyoLaboratorio?.has_resultados);
  const ecografiaDisponible = Boolean(apoyoEcografia?.has_resultados) && Number(apoyoEcografia?.ultima_orden_id || 0) > 0;
  const rxDisponible = Boolean(apoyoRx?.has_resultados) && Number(apoyoRx?.ultima_orden_id || 0) > 0;
  const tomografiaDisponible = Boolean(apoyoTomografia?.has_resultados) && Number(apoyoTomografia?.ultima_orden_id || 0) > 0;
  const fuenteLaboratorioLabel = (() => {
    const resultados = Number(apoyoLaboratorio?.resultados || 0);
    const documentos = Number(apoyoLaboratorio?.documentos || 0);
    if (resultados > 0 && documentos > 0) return 'Interno + adjuntos externos';
    if (resultados > 0) return 'Resultados internos';
    if (documentos > 0) return 'Adjuntos externos';
    return 'Sin fuente';
  })();
  const fuenteEcografiaLabel = ecografiaDisponible ? 'Visor de imágenes' : 'Sin fuente';
  const fuenteRxLabel = rxDisponible ? 'Visor de imágenes' : 'Sin fuente';
  const fuenteTomografiaLabel = tomografiaDisponible ? 'Visor de imágenes' : 'Sin fuente';

  const abrirRecursoHistorialPrevio = (targetPath) => {
    const rawPath = String(targetPath || '').trim();
    if (!rawPath) return;

    if (/^(https?:)?\/\//i.test(rawPath) || rawPath.startsWith('blob:') || rawPath.startsWith('data:')) {
      window.open(rawPath, '_blank', 'noopener,noreferrer');
      return;
    }

    const basePath = String(APP_BASE_PATH || '/').replace(/\/+$/, '') || '';
    let normalizedPath = rawPath;

    if (rawPath.startsWith('/')) {
      normalizedPath = rawPath.startsWith(`${basePath}/`) || rawPath === basePath
        ? rawPath
        : `${basePath}${rawPath}`;
    } else if (basePath) {
      normalizedPath = `${basePath}/${rawPath.replace(/^\/+/, '')}`;
    }

    // Para rutas internas del SPA, navegar en la misma pestaña para conservar
    // el contexto de sesión del frontend (sessionStorage) y evitar redirecciones a login.
    if (normalizedPath.startsWith('/')) {
      let routePath = normalizedPath;
      if (basePath && routePath.startsWith(`${basePath}/`)) {
        routePath = routePath.slice(basePath.length) || '/';
      } else if (basePath && routePath === basePath) {
        routePath = '/';
      }

      const consultaActualId = Number(consultaId || 0);
      const pacienteActualId = Number(pacienteId || 0);
      if (routePath.startsWith('/resultados-laboratorio/') && consultaActualId > 0) {
        const [pathOnly, queryString = ''] = routePath.split('?');
        const params = new URLSearchParams(queryString);
        params.set('from_continuidad', '1');
        params.set('consulta_actual_id', String(consultaActualId));
        if (pacienteActualId > 0) {
          params.set('paciente_id', String(pacienteActualId));
        }
        routePath = `${pathOnly}?${params.toString()}`;
      }

      if (routePath.startsWith('/visor-imagen/')) {
        const [pathOnly, queryString = ''] = routePath.split('?');
        const params = new URLSearchParams(queryString);
        if (consultaActualId > 0) {
          params.set('context_consulta_id', String(consultaActualId));
        }
        if (pacienteActualId > 0) {
          params.set('context_paciente_id', String(pacienteActualId));
        }
        routePath = `${pathOnly}?${params.toString()}`;
      }

      const totalPrevias = Array.isArray(historiasPrevias) ? historiasPrevias.length : 0;
      const visibleConsultaId = Number(hcAnterior?.consulta_id || 0);
      let selectedIndex = Math.max(0, Math.min(Number(indiceHistoriaPrevia || 0), Math.max(totalPrevias - 1, 0)));

      if (visibleConsultaId > 0 && totalPrevias > 0) {
        const byVisible = historiasPrevias.findIndex((item) => Number(item?.consulta_id || 0) === visibleConsultaId);
        if (byVisible >= 0) {
          selectedIndex = byVisible;
        }
      }

      const selectedHistoria = totalPrevias > 0 ? (historiasPrevias[selectedIndex] || null) : null;
      const selectedConsultaId = Number(visibleConsultaId || selectedHistoria?.consulta_id || 0);

      const backParams = new URLSearchParams(location.search || '');
      backParams.set('hc_prev_index', String(selectedIndex));
      backParams.set('hc_prev_show_detail', mostrarHcAnterior ? '1' : '0');
      backParams.set('hc_prev_tab', 'continuidad');
      if (selectedConsultaId > 0) {
        backParams.set('hc_prev_consulta_id', String(selectedConsultaId));
      }

      const backQuery = backParams.toString();
      const backToPath = `${location.pathname}${backQuery ? `?${backQuery}` : ''}`;
      const section = routePath.includes('/visor-imagen/') ? 'ecografia' : 'laboratorio';

      // Guardar el contexto en la URL actual para que incluso el botón atrás
      // del navegador regrese con la misma HC previa seleccionada.
      navigate(backToPath, {
        replace: true,
        state: navigationState || undefined,
      });

      navigate(routePath, {
        state: {
          backTo: backToPath,
          backState: {
            restoreContinuidadTab: true,
            historyShowDetail: Boolean(mostrarHcAnterior),
            historyConsultaId: selectedConsultaId,
            historyIndex: selectedIndex,
            section,
          },
        },
      });
      return;
    }

    window.open(normalizedPath, '_blank', 'noopener,noreferrer');
  };
  const importarDiagnosticoDesdeAnterior = () => {
    if (readOnly) return;
    const nuevos = Array.isArray(hcAnterior?.datos?.diagnosticos) ? hcAnterior.datos.diagnosticos : [];
    if (nuevos.length === 0) return;

    setMostrarImportarDiagnosticoModal(true);
  };

  const ejecutarImportacionDiagnostico = (modo) => {
    const nuevos = Array.isArray(hcAnterior?.datos?.diagnosticos) ? hcAnterior.datos.diagnosticos : [];
    if (nuevos.length === 0) {
      setMostrarImportarDiagnosticoModal(false);
      return;
    }

    if (modo === 'replace') {
      setDiagnosticos(nuevos);
      setMsg('Diagnóstico importado (reemplazado) desde HC previa.');
      setMostrarImportarDiagnosticoModal(false);
      return;
    }

    if (modo === 'append') {
      setDiagnosticos((actuales) => {
        const base = Array.isArray(actuales) ? actuales : [];
        const key = (dx) => {
          if (typeof dx === 'string') return dx.trim().toLowerCase();
          if (!dx || typeof dx !== 'object') return '';
          return `${String(dx.codigo || dx.cie10 || '').trim().toLowerCase()}|${String(dx.nombre || dx.descripcion || dx.diagnostico || '').trim().toLowerCase()}`;
        };
        const existentes = new Set(base.map(key).filter(Boolean));
        const merged = [...base];
        nuevos.forEach((dx) => {
          const k = key(dx);
          if (!k || existentes.has(k)) return;
          existentes.add(k);
          merged.push(dx);
        });
        return merged;
      });
      setMsg('Diagnóstico importado (agregado) desde HC previa.');
      setMostrarImportarDiagnosticoModal(false);
    }
  };

  const diagnosticosPrevios = Array.isArray(hcAnterior?.datos?.diagnosticos)
    ? hcAnterior.datos.diagnosticos.map(extraerTextoDiagnostico).filter(Boolean)
    : [];
  const diagnosticosPreviosDetalle = Array.isArray(hcAnterior?.datos?.diagnosticos)
    ? hcAnterior.datos.diagnosticos.map((dx, index) => {
        if (typeof dx === "string") {
          return {
            key: `dx-prev-${index}`,
            codigo: "",
            nombre: dx.trim(),
            tipo: "",
            observaciones: "",
          };
        }

        if (!dx || typeof dx !== "object") {
          return {
            key: `dx-prev-${index}`,
            codigo: "",
            nombre: "",
            tipo: "",
            observaciones: "",
          };
        }

        return {
          key: String(dx.id || `dx-prev-${index}`),
          codigo: String(dx.codigo || dx.cie10 || dx.cie10_codigo || "").trim(),
          nombre: String(dx.nombre || dx.descripcion || dx.diagnostico || "").trim(),
          tipo: String(dx.tipo || "").trim(),
          observaciones: String(dx.observaciones || "").trim(),
        };
      }).filter((item) => item.codigo || item.nombre || item.tipo || item.observaciones)
    : [];
  const datosHcAnterior = hcAnterior?.datos && typeof hcAnterior.datos === "object" ? hcAnterior.datos : {};
  const recetaPrevia = Array.isArray(datosHcAnterior?.receta) ? datosHcAnterior.receta : [];
  const tratamientoPrevioEnfermeria = tratamientoEstadoHcPrevia.data;
  const estadoTratamientoPrevio = String(tratamientoPrevioEnfermeria?.estado || "").trim();
  const estadoTratamientoPrevioLabel =
    estadoTratamientoPrevio === "completado"
      ? "Completado"
      : estadoTratamientoPrevio === "en_ejecucion"
        ? "En ejecución"
        : estadoTratamientoPrevio === "pendiente"
          ? "Pendiente"
          : estadoTratamientoPrevio === "suspendido"
            ? "Suspendido"
            : "Sin registro";
  const tratamientoPrevioCompletado = estadoTratamientoPrevio === "completado";
  const tratamientoPrevioCompletadoEn = tratamientoPrevioEnfermeria?.completado_en
    ? formatearFechaEvento(tratamientoPrevioEnfermeria.completado_en)
    : "";
  const tratamientoPrevio = obtenerTextoDesdeCampos(datosHcAnterior, [
    "tratamiento",
    "plan_tratamiento",
    "manejo",
    "indicaciones",
  ], /tratamiento|manejo|indicaciones/i);
  const examenFisicoPrevio = obtenerTextoDesdeCampos(datosHcAnterior, [
    "examen_fisico",
    "examen_general",
    "examen",
    "evaluacion_fisica",
  ], /examen|exploracion|evaluacion/i);
  const templateAnteriorSections = hcAnterior?.template?.sections && typeof hcAnterior.template.sections === "object"
    ? hcAnterior.template.sections
    : null;
  const existeCampoExamenEnTemplateAnterior = templateAnteriorSections
    ? Object.values(templateAnteriorSections).some((sectionFields) => {
        if (!sectionFields || typeof sectionFields !== "object" || Array.isArray(sectionFields)) return false;
        return Object.keys(sectionFields).some((fieldKey) => /examen|exploracion|evaluacion/i.test(String(fieldKey)));
      })
    : false;
  const seccionesPreviasDinamicas = templateAnteriorSections
    ? Object.entries(templateAnteriorSections).reduce((acc, [sectionKey, sectionFields]) => {
        if (HC_PREV_EXCLUDED_SECTIONS.has(sectionKey)) return acc;
        if (!sectionFields || typeof sectionFields !== "object" || Array.isArray(sectionFields)) return acc;

        const campos = Object.keys(sectionFields).reduce((fieldAcc, fieldKey) => {
          if (HC_PREV_EXCLUDED_FIELDS.has(fieldKey)) return fieldAcc;
          const valor = extraerValorVisible(datosHcAnterior[fieldKey]);
          if (!valor) return fieldAcc;
          fieldAcc.push({ fieldKey, label: formatFieldLabel(fieldKey), value: valor });
          return fieldAcc;
        }, []);

        if (campos.length > 0) {
          acc.push({ sectionKey, label: formatFieldLabel(sectionKey), fields: campos });
        }
        return acc;
      }, [])
    : [];
  const tieneCampoExamenEnSeccionesPrevias = seccionesPreviasDinamicas.some((section) =>
    section.fields.some((field) => /examen|exploracion|evaluacion/i.test(String(field.fieldKey)))
  );
  const mostrarExamenFisicoPrevio = (Boolean(examenFisicoPrevio) || existeCampoExamenEnTemplateAnterior)
    && !tieneCampoExamenEnSeccionesPrevias;
  const camposPreviosFallback = seccionesPreviasDinamicas.length === 0
    ? Object.entries(datosHcAnterior).reduce((acc, [fieldKey, rawValue]) => {
        if (HC_PREV_EXCLUDED_FIELDS.has(fieldKey)) return acc;
        const value = extraerValorVisible(rawValue);
        if (!value) return acc;
        acc.push({ fieldKey, label: formatFieldLabel(fieldKey), value });
        return acc;
      }, [])
    : [];
  const truncarTexto = (text, max = 64) => {
    const value = String(text || "").trim();
    if (!value) return "-";
    if (value.length <= max) return value;
    return `${value.slice(0, max - 1)}...`;
  };
  const ordenesLabActuales = Array.isArray(ordenesLab) ? ordenesLab : [];
  const ordenesLabPendientes = ordenesLabActuales.filter((orden) => {
    const estado = String(orden?.estado_visual || orden?.estado || '').toLowerCase();
    return estado !== 'completado' && estado !== 'cancelado';
  }).length;
  const ordenesLabCompletadas = ordenesLabActuales.filter((orden) => {
    const estado = String(orden?.estado_visual || orden?.estado || '').toLowerCase();
    return estado === 'completado' || Number(orden?.analisis_completos || 0) > 0;
  }).length;
  const resultadosLabActuales = Array.isArray(resultadosLab) ? resultadosLab.length : 0;
  const resultadosLabPrevios = Number(apoyoLaboratorio?.resultados || 0);
  const documentosLabPrevios = Number(apoyoLaboratorio?.documentos || 0);
  const ecoArchivosPrevios = Number(apoyoEcografia?.archivos || 0);
  const medicamentosActuales = Array.isArray(hc?.receta) ? hc.receta.length : 0;
  const medicamentosPrevios = Array.isArray(recetaPrevia) ? recetaPrevia.length : 0;

  const resumenLaboratorioTexto = (() => {
    if (ordenesLabCompletadas > 0 || ordenesLabPendientes > 0 || resultadosLabActuales > 0) {
      return `${ordenesLabCompletadas} completado(s), ${ordenesLabPendientes} pendiente(s), ${resultadosLabActuales} resultado(s) cargado(s)`;
    }
    if (resultadosLabPrevios > 0 || documentosLabPrevios > 0) {
      return `sin orden actual; en HC previa: ${resultadosLabPrevios} resultado(s), ${documentosLabPrevios} adjunto(s)`;
    }
    return 'sin registros detectados';
  })();

  const resumenEcografiaTexto = ecoArchivosPrevios > 0
    ? `${ecoArchivosPrevios} archivo(s) en HC previa`
    : (ecografiaDisponible ? 'con imágenes registradas' : 'sin imágenes registradas');

  const resumenMedicacionTexto = (medicamentosActuales > 0 || medicamentosPrevios > 0)
    ? `${medicamentosActuales} medicamento(s) actual(es), ${medicamentosPrevios} en HC previa`
    : 'sin medicación registrada';

  const tratamientoEstadoData = tratamientoEstado.data;
  const estadoTratamiento = String(tratamientoEstadoData?.estado || "").trim();
  const progresoTratamiento = Number(tratamientoEstadoData?.progreso_pct || 0);
  const completadoTratamientoEn = tratamientoEstadoData?.completado_en
    ? formatearFechaEvento(tratamientoEstadoData.completado_en)
    : "";
  const estadoTratamientoLabel =
    estadoTratamiento === "completado"
      ? "Completado"
      : estadoTratamiento === "en_ejecucion"
        ? "En ejecución"
        : estadoTratamiento === "pendiente"
          ? "Pendiente"
          : estadoTratamiento === "suspendido"
            ? "Suspendido"
            : "Sin tratamiento";
  const estadoTratamientoBadgeClass =
    estadoTratamiento === "completado"
      ? "bg-emerald-100 text-emerald-700 border-emerald-200"
      : estadoTratamiento === "en_ejecucion"
        ? "bg-amber-100 text-amber-700 border-amber-200"
        : estadoTratamiento === "pendiente"
          ? "bg-slate-100 text-slate-700 border-slate-200"
          : estadoTratamiento === "suspendido"
            ? "bg-rose-100 text-rose-700 border-rose-200"
            : "bg-gray-100 text-gray-600 border-gray-200";
  const resumenTratamientoTexto = (() => {
    if (tratamientoEstado.loading) return "cargando estado...";
    if (tratamientoEstado.error) return tratamientoEstado.error;
    if (!tratamientoEstadoData) return "sin tratamiento de enfermería sincronizado";
    if (estadoTratamiento === "completado") {
      return `completado (${progresoTratamiento.toFixed(0)}%), cierre: ${completadoTratamientoEn || "-"}`;
    }
    if (estadoTratamiento === "en_ejecucion") {
      const diaActual = Number(tratamientoEstadoData?.dia_actual || 0);
      const pendientesHoy = Number(tratamientoEstadoData?.pendientes_hoy || 0);
      return `en ejecución (${progresoTratamiento.toFixed(0)}%), día actual: ${diaActual > 0 ? diaActual : "-"}, pendientes hoy: ${pendientesHoy}`;
    }
    if (estadoTratamiento === "pendiente") {
      return `pendiente de inicio (${progresoTratamiento.toFixed(0)}%)`;
    }
    return `${estadoTratamientoLabel.toLowerCase()} (${progresoTratamiento.toFixed(0)}%)`;
  })();

  const fechaHcPreviaResumen = hcAnterior?.fecha_registro
    ? formatearFechaCorta(hcAnterior.fecha_registro)
    : '-';
  const medicoNombrePrevio = String(hcAnterior?.medico_nombre || '').trim();
  const medicoApellidoPrevio = String(hcAnterior?.medico_apellido || '').trim();
  const medicoEspecialidadPrevia = String(hcAnterior?.medico_especialidad || '').trim();
  const medicoLabelPrevio = (() => {
    const full = `${medicoNombrePrevio} ${medicoApellidoPrevio}`.trim();
    if (!full && !medicoEspecialidadPrevia) return '-';
    if (!medicoEspecialidadPrevia) return full;
    return full ? `${full} - ${medicoEspecialidadPrevia}` : medicoEspecialidadPrevia;
  })();
  const diagnosticoHcPreviaResumen = diagnosticosPrevios.length > 0
    ? truncarTexto(diagnosticosPrevios[0], 72)
    : 'Sin diagnóstico previo';
  const resumenAsistenteItems = useMemo(() => ([
    `Antecedentes HC encadenados: ${totalHistoriasPrevias}`,
    `Ultima HC registrada: ${fechaHcPreviaResumen}`,
    `Diagnostico previo principal: ${diagnosticoHcPreviaResumen}`,
    `Laboratorio: ${resumenLaboratorioTexto}`,
    `Ecografía: ${resumenEcografiaTexto}`,
    `Medicamentos: ${resumenMedicacionTexto}`,
    `Tratamiento enfermería: ${resumenTratamientoTexto}`,
    `Apoyo diagnostico previo: Lab ${laboratorioDisponible ? 'con resultados' : 'sin resultados'} · Ecografía ${ecografiaDisponible ? 'con imágenes' : 'sin imágenes'}`,
  ]), [
    totalHistoriasPrevias,
    fechaHcPreviaResumen,
    diagnosticoHcPreviaResumen,
    resumenLaboratorioTexto,
    resumenEcografiaTexto,
    resumenMedicacionTexto,
    resumenTratamientoTexto,
    laboratorioDisponible,
    ecografiaDisponible,
  ]);

  const informeProcedimiento = useMemo(() => {
    const normalizeKey = (value) => String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/_+/g, "_");

    const isProcedureLikeKey = (value) => {
      const normalized = normalizeKey(value);
      if (!normalized) return false;
      return (
        normalized === "procedimiento_medico"
        || normalized === "procedimientos_medicos"
        || normalized === "procedimiento"
        || normalized === "procedimientos"
        || normalized === "informe_procedimiento"
        || normalized === "informe_medico"
        || normalized.includes("procedimiento")
        || normalized.includes("procedim")
        || normalized.includes("porcedim")
      );
    };

    const sections = hcTemplateMeta?.sections && typeof hcTemplateMeta.sections === "object"
      ? hcTemplateMeta.sections
      : {};

    const sectionEntry = Object.entries(sections).find(([sectionKey]) => isProcedureLikeKey(sectionKey));

    const fieldsFromTemplate = sectionEntry && sectionEntry[1] && typeof sectionEntry[1] === "object" && !Array.isArray(sectionEntry[1])
      ? Object.keys(sectionEntry[1])
      : [];

    const fieldsWithValue = [];
    const existingKeys = new Set();

    fieldsFromTemplate.forEach((fieldKey) => {
      const value = extraerValorVisible(hc?.[fieldKey]);
      if (!value) return;
      existingKeys.add(fieldKey);
      fieldsWithValue.push({ fieldKey, label: formatFieldLabel(fieldKey), value });
    });

    const aliasFallback = [
      "procedimiento",
      "informe_procedimiento",
      "procedimiento_medico",
      "procedimientos",
      "procedimientos_medicos",
      "informe_medico",
      "descripcion_procedimiento",
      "reporte_procedimiento",
      "porcedimiento_medico",
      "porcedimientos_medicos",
    ];

    aliasFallback.forEach((fieldKey) => {
      if (existingKeys.has(fieldKey)) return;
      const value = extraerValorVisible(hc?.[fieldKey]);
      if (!value) return;
      existingKeys.add(fieldKey);
      fieldsWithValue.push({ fieldKey, label: formatFieldLabel(fieldKey), value });
    });

    const preferred = fieldsWithValue.find((item) => isProcedureLikeKey(item?.fieldKey)) || fieldsWithValue[0] || null;

    const contenidoPrincipal = String(preferred?.value || "").trim();
    const camposDetalle = fieldsWithValue.filter((item) => item.fieldKey !== preferred?.fieldKey);

    return {
      disponible: contenidoPrincipal.length > 0,
      contenidoPrincipal,
      camposDetalle,
    };
  }, [hc, hcTemplateMeta]);
  const informeProcedimientoDisponible = Boolean(informeProcedimiento?.disponible);

  useEffect(() => {
    // FIX: canOpenHistoryDrawer debe verificar que HC previas fueron realmente cargadas, 
    // no solo que hc_origen_id esté seteado. Evita mostrar botón cuando no hay HC anteriores.
    const consultaActualId = Number(consultaActual?.id || 0);
    const consultaObjetivoId = Number(consultaId || 0);
    const contextoConsultaListo = consultaObjetivoId > 0 && consultaActualId === consultaObjetivoId;
    const tieneHcPreviasDisponibles = Boolean(
      contextoConsultaListo
      && totalHistoriasPrevias
      && totalHistoriasPrevias > 0
      && !hcAnteriorLoading
      && !hcAnteriorError
    );
    
    const payload = {
      source: 'historia-clinica',
      available: tieneHcPreviasDisponibles,
      readOnly,
      consultaId: Number(consultaId || 0),
      pacienteId: Number(pacienteId || 0),
      totalHistoriasPrevias,
      hcAnteriorLoading,
      hcAnteriorError,
      resumenItems: resumenAsistenteItems,
      canOpenHistoryDrawer: tieneHcPreviasDisponibles,
    };

    window.dispatchEvent(new CustomEvent('hc-assistant-context-updated', { detail: payload }));

    return () => {
      window.dispatchEvent(new CustomEvent('hc-assistant-context-updated', {
        detail: {
          source: 'historia-clinica',
          available: false,
          readOnly: false,
          consultaId: 0,
          pacienteId: 0,
          totalHistoriasPrevias: 0,
          hcAnteriorLoading: false,
          hcAnteriorError: '',
          resumenItems: [],
          canOpenHistoryDrawer: false,
        },
      }));
    };
  }, [
    consultaActual?.id,
    consultaActual?.hc_origen_id,
    consultaId,
    pacienteId,
    readOnly,
    totalHistoriasPrevias,
    hcAnteriorLoading,
    hcAnteriorError,
    resumenAsistenteItems,
  ]);

  const themedPageBg = {
    background: 'linear-gradient(to bottom right, var(--color-primary-light, #eff6ff), #ffffff, color-mix(in srgb, var(--color-accent, #eef2ff) 32%, white))',
  };
  const themedHeroIconBg = {
    background: 'linear-gradient(to right, var(--color-primary, #2563eb), var(--color-secondary, #4f46e5))',
  };
  const themedAccentIconBg = {
    background: 'linear-gradient(to right, var(--color-secondary, #4f46e5), var(--color-accent, #7c3aed))',
  };
  const themedInfoBadgeBg = {
    background: 'linear-gradient(to right, color-mix(in srgb, var(--color-primary-light, #dbeafe) 72%, white), color-mix(in srgb, var(--color-accent, #c4b5fd) 20%, white))',
  };
  const themedSpinnerStyle = {
    borderColor: 'var(--color-primary, #2563eb)',
    borderTopColor: 'transparent',
  };
  const themedToggleActiveStyle = {
    borderColor: 'var(--color-accent, #06b6d4)',
    backgroundColor: 'color-mix(in srgb, var(--color-primary-light, #dbeafe) 75%, white)',
  };
  const themedToggleIndicatorStyle = {
    borderColor: 'var(--color-primary, #2563eb)',
    backgroundColor: 'var(--color-primary, #2563eb)',
    color: '#fff',
  };
  const themedToggleBadgeStyle = {
    backgroundColor: 'color-mix(in srgb, var(--color-primary-light, #dbeafe) 70%, white)',
    color: 'var(--color-primary-dark, #1d4ed8)',
  };
  const primaryActionStyle = {
    background: 'linear-gradient(to right, var(--color-primary, #2563eb), var(--color-secondary, #4f46e5))',
  };
  const brandActionStyle = {
    background: 'linear-gradient(to right, var(--color-secondary, #4f46e5), var(--color-accent, #7c3aed))',
  };
  const darkBrandActionStyle = {
    background: 'linear-gradient(to right, var(--color-primary-dark, #1d4ed8), var(--color-secondary, #4f46e5))',
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={themedPageBg}>
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl p-8 border border-white/50 flex flex-col items-center gap-4">
        <div className="w-16 h-16 border-4 rounded-full animate-spin" style={themedSpinnerStyle}></div>
        <p className="text-gray-600 font-medium">🏥 Cargando historia clínica...</p>
      </div>
    </div>
  );
  if (error) return (
    <div className="min-h-screen flex items-center justify-center" style={themedPageBg}>
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl p-8 border border-red-200 text-center">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-red-800 mb-2">Error</h3>
        <p className="text-red-600">{error}</p>
      </div>
    </div>
  );
  if (!paciente) return (
    <div className="min-h-screen flex items-center justify-center" style={themedPageBg}>
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl p-8 border border-gray-200 text-center">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-gray-800 mb-2">Paciente no encontrado</h3>
        <p className="text-gray-600">No se encontró información del paciente.</p>
      </div>
    </div>
  );

  const fechaConsultaVisible = formatearFechaConsultaActual(
    consultaActual?.fecha_consulta || consultaActual?.fecha || consultaActual?.created_at || consultaActual?.fecha_hora || fechaConsulta,
    consultaActual?.hora || consultaActual?.hora_consulta || ""
  );

  return (
    <div className="min-h-screen py-4 sm:py-8 px-2 sm:px-4 overflow-x-hidden" style={themedPageBg}>
      <div className="max-w-6xl mx-auto w-full">
        {/* Header profesional de Historia Clínica */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl p-4 sm:p-6 lg:p-8 mb-6 border border-white/50 w-full">
          <div className="flex flex-col sm:flex-row items-center gap-4 mb-6">
            <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full flex items-center justify-center flex-shrink-0" style={themedHeroIconBg}>
              <svg className="w-6 h-6 sm:w-8 sm:h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div className="text-center sm:text-left flex-1 min-w-0">
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold" style={{ color: 'var(--color-primary, #1e3a8a)' }}>
                📋 Historia Clínica
              </h1>
              <p className="text-gray-600 mt-1 text-sm sm:text-base">
                {configuracionClinica?.slogan
                  ? `${configuracionClinica.slogan} - ${configuracionClinica?.nombre_clinica || 'Clínica'}`
                  : `Sistema Médico Integral - ${configuracionClinica?.nombre_clinica || 'Sistema Clínico'}`
                }
              </p>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-full flex-shrink-0" style={themedInfoBadgeBg}>
              <div className="w-2 h-2 sm:w-3 sm:h-3 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-xs sm:text-sm font-medium text-gray-700">En línea</span>
            </div>
          </div>
        </div>
        {/* Información sobre firma digital */}
        {medicoInfo && (
          <div className={`mb-6 p-4 rounded-2xl border ${
            firmaMedico 
              ? 'bg-green-50/80 border-green-200 backdrop-blur-sm' 
              : 'bg-amber-50/80 border-amber-200 backdrop-blur-sm'
          }`}>
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                firmaMedico 
                  ? 'bg-green-500' 
                  : 'bg-amber-500'
              }`}>
                {firmaMedico ? (
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                )}
              </div>
              <div className="flex-1">
                <p className={`text-sm font-medium ${
                  firmaMedico ? 'text-green-800' : 'text-amber-800'
                }`}>
                  {firmaMedico ? (
                    <>✍️ <strong>Firma Digital Activa:</strong> Los documentos impresos incluirán su firma digital.</>
                  ) : (
                    <>⚠️ <strong>Sin Firma Digital:</strong> Los documentos impresos tendrán espacio para firma manual.</>
                  )}
                </p>
                <p className={`text-xs mt-1 ${
                  firmaMedico ? 'text-green-600' : 'text-amber-600'
                }`}>
                  {formatProfesionalName(medicoInfo)} - {formatColegiatura(medicoInfo)}
                </p>
              </div>
            </div>
          </div>
        )}
        {/* Datos básicos del paciente en tarjeta moderna */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg p-6 mb-6 border border-white/50">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-full flex items-center justify-center" style={themedHeroIconBg}>
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-800">👤 Información del Paciente</h2>
          </div>
          <div className="mb-3 text-sm text-gray-700">
            <span className="font-semibold">Fecha de consulta:</span> {fechaConsultaVisible}
          </div>
          <DatosPaciente paciente={paciente} />
        </div>
        {/* Triaje en tarjeta moderna */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg p-6 mb-6 border border-white/50">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 bg-gradient-to-r from-red-500 to-pink-500 rounded-full flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-800">🚨 Triaje y Signos Vitales</h2>
          </div>
          <TriajePaciente triaje={triaje} />
        </div>

        <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg p-3 mb-6 border border-white/50">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setVistaClinicaActiva('registro')}
              className={`px-3 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                vistaClinicaActiva === 'registro'
                  ? 'bg-cyan-600 text-white border-cyan-600'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              Registro actual
            </button>
            <button
              type="button"
              onClick={() => setVistaClinicaActiva('continuidad')}
              className={`px-3 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                vistaClinicaActiva === 'continuidad'
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              Continuidad clínica
            </button>
            <span className="text-xs text-slate-500 ml-auto">
              HC previas encadenadas: {totalHistoriasPrevias}
            </span>
          </div>
        </div>

        {/* Formulario principal de Historia Clínica */}
        {vistaClinicaActiva === 'registro' && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (readOnly) return;
            if (guardando) return;
            if (Date.now() < bloqueoGuardadoHasta) {
              setMsg("Ya se guardo hace un momento. Espera un instante para evitar duplicados.");
              return;
            }
            const proxima = hc.proxima_cita || DEFAULT_PROXIMA_CITA;
            if (proxima.programar && (!proxima.fecha || !proxima.hora)) {
              setMsg("Para programar próxima cita debes indicar fecha y hora.");
              return;
            }

            setGuardando(true);
            setMsg("");
            try {
              const datos = { ...hc, diagnosticos, receta: hc.receta };
              if (!proxima.programar) {
                delete datos.proxima_cita;
              }
              // Incluir información de la plantilla para mantener el diseño al imprimir
              if (hcTemplateMeta?.id) {
                datos.template = {
                  id: hcTemplateMeta.id,
                  version: hcTemplateMeta.version || ''
                };
              }

              const res = await authFetch("api_historia_clinica.php", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ consulta_id: consultaId, datos }),
              });
              const data = await res.json();

              if (data.success) {
                const proximaInfo = data.proxima_cita || null;
                const fechaProxima = String(proximaInfo?.fecha || "").trim();
                const horaProxima = String(proximaInfo?.hora || "").trim();
                const referenciaId = Number(proximaInfo?.consulta_id || 0);
                const referenciaTexto = referenciaId > 0 ? ` (ref. interna ${referenciaId})` : "";

                let successMsg = "Historia clínica guardada correctamente.";
                if (proximaInfo) {
                  if (fechaProxima && horaProxima) {
                    successMsg = `Historia clínica guardada. Próxima cita programada para ${fechaProxima} a las ${horaProxima}${referenciaTexto}.`;
                  } else if (fechaProxima) {
                    successMsg = `Historia clínica guardada. Próxima cita programada para ${fechaProxima}${referenciaTexto}.`;
                  } else {
                    successMsg = `Historia clínica guardada. Próxima cita programada${referenciaTexto}.`;
                  }
                }
                setBloqueoGuardadoHasta(Date.now() + 2500);
                setServerSnapshot(currentSnapshot);
                clearDraft();
                setMensajeModalGuardado(successMsg);
                setMostrarModalGuardado(true);
                setMsg(successMsg);
                // Re-fetch treatment status: saving may create a new pending version
                if (consultaId) {
                  authFetch(
                    `api_tratamientos_enfermeria.php?consulta_id=${consultaId}&estado=pendiente,en_ejecucion,completado,suspendido`,
                    { cache: 'no-store' }
                  )
                    .then((r) => r.json())
                    .then((tdata) => {
                      const rows = Array.isArray(tdata?.data) ? tdata.data : [];
                      const ordered = [...rows].sort((a, b) => {
                        const vd = Number(b?.version_num || 0) - Number(a?.version_num || 0);
                        return vd !== 0 ? vd : Number(b?.id || 0) - Number(a?.id || 0);
                      });
                      const principal = ordered.filter((t) => String(t?.estado || '') !== 'suspendido')[0] || ordered[0] || null;
                      if (principal) {
                        const pct = Math.max(0, Math.min(100, Number(principal?.progreso_pct || 0)));
                        setTratamientoEstado({ loading: false, error: '', data: { ...principal, progreso_pct: pct, total_dias: Number(principal?.total_dias || 0), dias_cerrados: Number(principal?.dias_cerrados || 0), pendientes_hoy: Number(principal?.pendientes_hoy || 0), dia_actual: Number(principal?.dia_actual || 0) } });
                      } else {
                        setTratamientoEstado({ loading: false, data: null, error: '' });
                      }
                    })
                    .catch(() => {});
                }
              } else {
                setMsg(data.error || "Error al guardar");
              }
            } catch {
              setMsg("Error de conexión al guardar");
            } finally {
              setGuardando(false);
            }
          }}
          className="space-y-6"
        >
          {/* Anamnesis y Examen Físico */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg p-6 border border-white/50">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 rounded-full flex items-center justify-center" style={themedAccentIconBg}>
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-gray-800">📝 Anamnesis y Examen Físico</h2>
            </div>
            {HC_TEMPLATE_ENGINE_READ && (
              <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                {hcTemplateDebug.hasTemplate ? (
                  <>
                    <span className="font-semibold text-slate-800">Plantilla activa:</span> {hcTemplateDebug.templateLabel}
                    <span className="mx-2 text-slate-400">|</span>
                    <span className="font-semibold text-slate-800">Origen:</span> {hcTemplateDebug.sourceLabel}
                    <span className="mx-2 text-slate-400">|</span>
                    <span className="font-semibold text-slate-800">Resolución:</span> {hcTemplateDebug.resolvedBy}
                    <span className="mx-2 text-slate-400">|</span>
                    <span className="font-semibold text-slate-800">Modo:</span> {hcTemplateDebug.policyMode}
                    {(hcTemplateDebug.isFallbackBuiltin || hcTemplateDebug.isDefaultFallback) && (
                      <span className="ml-2 inline-flex items-center rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                        Fallback activo
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-amber-700 font-semibold">
                    No se resolvió plantilla HC. Se aplicará esquema mínimo para evitar errores de renderizado.
                  </span>
                )}
              </div>
            )}
            <FormularioHistoriaClinica
              hc={hc}
              setHc={setHc}
              templateSections={hcTemplateMeta?.sections || {}}
            />
          </div>
          {/* Laboratorio y Apoyo Diagnóstico */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg p-6 border border-white/50">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 rounded-full flex items-center justify-center" style={brandActionStyle}>
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-gray-800">🔬 Laboratorio y Apoyo Diagnóstico</h2>
            </div>
            <TabsApoyoDiagnostico
              consultaId={consultaId}
              pacienteId={pacienteId}
              resultadosLab={resultadosLab}
              ordenesLab={ordenesLab}
              onBeforeNavigate={persistDraftNow}
            />
          </div>
          {/* Diagnósticos CIE10 */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg p-6 border border-white/50">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 bg-gradient-to-r from-orange-500 to-red-500 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-gray-800">🩺 Diagnósticos CIE10</h2>
            </div>
            <DiagnosticoCIE10Selector
              diagnosticos={diagnosticos}
              setDiagnosticos={setDiagnosticos}
            />
          </div>
          {/* Tratamiento y Receta Médica */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg p-6 border border-white/50">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 rounded-full flex items-center justify-center" style={themedHeroIconBg}>
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-gray-800">💊 Tratamiento y Receta Médica</h2>
            </div>
            <TratamientoPaciente
              receta={hc.receta || []}
              setReceta={(recetaNueva) =>
                setHc((h) => {
                  const nextReceta = typeof recetaNueva === 'function'
                    ? recetaNueva(h.receta)
                    : recetaNueva;
                  return {
                    ...h,
                    receta: Array.isArray(nextReceta)
                      ? nextReceta.map(({ recomendaciones: _omit, ...item }) => item)
                      : [],
                  };
                })
              }
              tratamiento={hc.tratamiento || ""}
              setTratamiento={valor => setHc(h => ({ ...h, tratamiento: valor }))}
              recomendaciones={hc.recomendaciones || ""}
              setRecomendaciones={valor => setHc(h => ({ ...h, recomendaciones: valor }))}
              sugerenciasReceta={recetaSugerencias}
              consultaId={consultaId}
            />
          </div>
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg p-6 border border-white/50">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={brandActionStyle}>
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2-11H7a2 2 0 00-2 2v10a2 2 0 002 2h5m5-11l2 2-6 6H9v-4l6-6z" />
                  </svg>
                </div>
                <h2 className="text-lg font-semibold text-gray-800">📈 Evolución de Tratamiento (Enfermería)</h2>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${estadoTratamientoBadgeClass}`}>
                {estadoTratamientoLabel}
              </span>
            </div>

            {tratamientoEstado.loading && (
              <p className="text-sm text-gray-500 mt-3">Cargando estado del tratamiento...</p>
            )}

            {!tratamientoEstado.loading && tratamientoEstado.error && (
              <p className="text-sm text-red-600 mt-3">{tratamientoEstado.error}</p>
            )}

            {!tratamientoEstado.loading && !tratamientoEstado.error && !tratamientoEstadoData && (
              <p className="text-sm text-gray-600 mt-3">
                No hay tratamiento de enfermería vinculado a esta consulta todavía.
              </p>
            )}

            {!tratamientoEstado.loading && estadoTratamiento === 'completado' && Array.isArray(hc?.receta) && hc.receta.length > 0 && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 mt-3">
                ⚠️ El tratamiento anterior fue completado. Al guardar la HC con los medicamentos actuales se creará una nueva versión en estado <strong>pendiente</strong>.
              </p>
            )}

            {!tratamientoEstado.loading && !tratamientoEstado.error && tratamientoEstadoData && (
              <>
                <div className="mt-4">
                  <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ${
                        estadoTratamiento === "completado"
                          ? "bg-emerald-500"
                          : estadoTratamiento === "en_ejecucion"
                            ? "bg-amber-500"
                            : "bg-slate-400"
                      }`}
                      style={{ width: `${Math.max(0, Math.min(100, progresoTratamiento))}%` }}
                    />
                  </div>
                  <p className="text-sm font-medium text-gray-700 mt-2">
                    Progreso: {progresoTratamiento.toFixed(0)}%
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-xs text-slate-500">Días cerrados</p>
                    <p className="text-sm font-semibold text-slate-800">
                      {Number(tratamientoEstadoData?.dias_cerrados || 0)} / {Number(tratamientoEstadoData?.total_dias || 0)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-xs text-slate-500">Día actual</p>
                    <p className="text-sm font-semibold text-slate-800">
                      {Number(tratamientoEstadoData?.dia_actual || 0) > 0
                        ? `Día ${Number(tratamientoEstadoData?.dia_actual || 0)}`
                        : "-"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-xs text-slate-500">Pendientes hoy</p>
                    <p className="text-sm font-semibold text-slate-800">{Number(tratamientoEstadoData?.pendientes_hoy || 0)}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-xs text-slate-500">Completado en</p>
                    <p className="text-sm font-semibold text-slate-800">
                      {completadoTratamientoEn || "-"}
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg p-6 border border-white/50">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-8 h-8 rounded-full flex items-center justify-center" style={brandActionStyle}>
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10m-11 9h12a2 2 0 002-2V7a2 2 0 00-2-2H6a2 2 0 00-2 2v11a2 2 0 002 2z" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-gray-800">📅 Próxima cita sugerida</h2>
            </div>

            <div className="space-y-4">
              <label
                className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 cursor-pointer transition-all ${
                  hc.proxima_cita?.programar
                    ? ""
                    : "border-slate-300 bg-white"
                } ${readOnly ? "opacity-70 cursor-not-allowed" : "hover:border-cyan-300"}`}
                style={hc.proxima_cita?.programar ? themedToggleActiveStyle : undefined}
              >
                <div className="flex items-center gap-3 text-sm font-medium text-slate-700">
                  <span
                    className={`h-5 w-5 rounded-md border-2 flex items-center justify-center ${
                      hc.proxima_cita?.programar
                        ? ""
                        : "border-slate-400 bg-white"
                    }`}
                    style={hc.proxima_cita?.programar ? themedToggleIndicatorStyle : undefined}
                  >
                    {hc.proxima_cita?.programar ? "✓" : ""}
                  </span>
                  <span>Programar próxima cita al guardar esta HC</span>
                </div>
                <span className={`text-xs font-semibold px-2 py-1 rounded-full ${hc.proxima_cita?.programar ? "" : "bg-slate-100 text-slate-600"}`} style={hc.proxima_cita?.programar ? themedToggleBadgeStyle : undefined}>
                  {hc.proxima_cita?.programar ? "Activado" : "Desactivado"}
                </span>
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={!!hc.proxima_cita?.programar}
                  onChange={(e) =>
                    setHc((current) => ({
                      ...current,
                      proxima_cita: {
                        ...DEFAULT_PROXIMA_CITA,
                        ...(current.proxima_cita || {}),
                        programar: e.target.checked,
                        medico_id: (current.proxima_cita?.medico_id || (medicoInfo?.id ? String(medicoInfo.id) : "")),
                      },
                    }))
                  }
                  disabled={readOnly}
                />
              </label>

              {hc.proxima_cita?.programar && (
                <>
                  <label
                    className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 cursor-pointer transition-all ${
                      hc.proxima_cita?.es_control
                        ? "border-emerald-400 bg-emerald-50/80"
                        : "border-slate-300 bg-white"
                    } ${readOnly ? "opacity-70 cursor-not-allowed" : "hover:border-emerald-300"}`}
                  >
                    <div className="flex items-center gap-3 text-sm font-medium text-slate-700">
                      <span
                        className={`h-5 w-5 rounded-md border-2 flex items-center justify-center ${
                          hc.proxima_cita?.es_control
                            ? "border-emerald-600 bg-emerald-600 text-white"
                            : "border-slate-400 bg-white"
                        }`}
                      >
                        {hc.proxima_cita?.es_control ? "✓" : ""}
                      </span>
                      <span>Cita de control (sin cobro, se agenda habilitada)</span>
                    </div>
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full ${hc.proxima_cita?.es_control ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
                      {hc.proxima_cita?.es_control ? "Control" : "Normal"}
                    </span>
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={!!hc.proxima_cita?.es_control}
                      onChange={(e) =>
                        setHc((current) => ({
                          ...current,
                          proxima_cita: {
                            ...DEFAULT_PROXIMA_CITA,
                            ...(current.proxima_cita || {}),
                            es_control: e.target.checked,
                          },
                        }))
                      }
                      disabled={readOnly}
                    />
                  </label>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">Fecha</label>
                      <input
                        type="date"
                        className="w-full border rounded-lg px-3 py-2"
                        value={hc.proxima_cita?.fecha || ""}
                        min={new Date().toISOString().slice(0, 10)}
                        onChange={(e) =>
                          setHc((current) => ({
                            ...current,
                            proxima_cita: {
                              ...DEFAULT_PROXIMA_CITA,
                              ...(current.proxima_cita || {}),
                              fecha: e.target.value,
                            },
                          }))
                        }
                        disabled={readOnly}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">Hora</label>
                      <input
                        type="time"
                        className="w-full border rounded-lg px-3 py-2"
                        value={hc.proxima_cita?.hora || ""}
                        onChange={(e) =>
                          setHc((current) => ({
                            ...current,
                            proxima_cita: {
                              ...DEFAULT_PROXIMA_CITA,
                              ...(current.proxima_cita || {}),
                              hora: e.target.value,
                            },
                          }))
                        }
                        disabled={readOnly}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">Profesional</label>
                      <input
                        className="w-full border rounded-lg px-3 py-2 bg-slate-50"
                        value={formatProfesionalName(medicoInfo) || "Profesional actual"}
                        disabled
                      />
                    </div>
                  </div>

                  {Array.isArray(hc.proxima_cita?.historial) && hc.proxima_cita.historial.length > 0 && (
                    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="text-sm font-semibold text-slate-700 mb-2">Historial de cambios</p>
                      <div className="space-y-2 max-h-52 overflow-auto pr-1">
                        {[...hc.proxima_cita.historial]
                          .sort((a, b) => String(b?.fecha_evento || "").localeCompare(String(a?.fecha_evento || "")))
                          .map((evento, idx) => (
                            <div key={`${evento?.fecha_evento || "evt"}-${idx}`} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
                              <div className="font-semibold text-slate-800">
                                {String(evento?.accion || "evento").replace(/_/g, " ")}
                              </div>
                              <div className="text-slate-600 mt-0.5">{formatearFechaEvento(evento?.fecha_evento)} • {evento?.actor || "sistema"}</div>
                              {evento?.antes?.fecha || evento?.despues?.fecha ? (
                                <div className="text-slate-500 mt-1">
                                  {evento?.antes?.fecha ? `Antes: ${evento.antes.fecha} ${evento?.antes?.hora || ""}` : ""}
                                  {evento?.despues?.fecha ? `  |  Ahora: ${evento.despues.fecha} ${evento?.despues?.hora || ""}` : ""}
                                </div>
                              ) : null}
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
          {/* Botones de Acción y Footer Profesional */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg p-6 border border-white/50">
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 gap-3 w-full">
                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-2 px-4 py-3 text-white rounded-xl font-semibold transition-all duration-200 hover:scale-105 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none text-sm whitespace-nowrap"
                  style={primaryActionStyle}
                  disabled={guardando || readOnly || bloqueoGuardadoActivo}
                >
                  {readOnly ? (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>Solo lectura</span>
                    </>
                  ) : guardando ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Guardando...</span>
                    </>
                  ) : bloqueoGuardadoActivo ? (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span>Guardado reciente</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                      </svg>
                      <span>💾 Guardar HC</span>
                    </>
                  )}
                </button>
                {backTo && (
                  <button
                    type="button"
                    onClick={() => navigate(backTo)}
                    className="inline-flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-slate-600 to-slate-700 hover:from-slate-700 hover:to-slate-800 text-white rounded-xl font-semibold transition-all duration-200 hover:scale-105 shadow-lg text-sm whitespace-nowrap"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 17l-5-5m0 0l5-5m-5 5h12" />
                    </svg>
                    <span>Volver</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (printRef.current) {
                      handlePrintHC();
                    } else {
                      console.warn('Referencia de impresión no disponible');
                    }
                  }}
                  className="inline-flex items-center justify-center gap-2 px-4 py-3 text-white rounded-xl font-semibold transition-all duration-200 hover:scale-105 shadow-lg text-sm whitespace-nowrap"
                  style={brandActionStyle}
                  title={firmaMedico ? "Imprimir HC con firma digital" : "Imprimir HC (sin firma digital)"}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  <span>🖨️ HC</span>
                  {firmaMedico && (
                    <span className="text-xs bg-white/20 px-1 rounded">✍️</span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (printLabRef.current && ordenesLab && ordenesLab.length > 0) {
                      handlePrintLab();
                    } else {
                      console.warn('Referencia de laboratorio no disponible o sin órdenes de laboratorio');
                    }
                  }}
                  className="inline-flex items-center justify-center gap-2 px-4 py-3 text-white rounded-xl font-semibold transition-all duration-200 hover:scale-105 shadow-lg text-sm whitespace-nowrap"
                  style={darkBrandActionStyle}
                  disabled={!ordenesLab || ordenesLab.length === 0}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                  </svg>
                  <span>🔬 Lab</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (printImagenRef.current && ordenesImagenPrint && ordenesImagenPrint.length > 0) {
                      handlePrintImagen();
                    } else {
                      console.warn('Referencia de imagen no disponible o sin órdenes de imagen');
                    }
                  }}
                  className="inline-flex items-center justify-center gap-2 px-4 py-3 text-white rounded-xl font-semibold transition-all duration-200 hover:scale-105 shadow-lg text-sm whitespace-nowrap"
                  style={brandActionStyle}
                  disabled={!ordenesImagenPrint || ordenesImagenPrint.length === 0}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                  </svg>
                  <span>🖼️ Img</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (printProcRef.current && ordenesProcedimientosPrint && ordenesProcedimientosPrint.length > 0) {
                      handlePrintProcedimientos();
                    } else {
                      console.warn('Referencia de procedimientos no disponible o sin órdenes');
                    }
                  }}
                  className="inline-flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white rounded-xl font-semibold transition-all duration-200 hover:scale-105 shadow-lg text-sm whitespace-nowrap"
                  disabled={!ordenesProcedimientosPrint || ordenesProcedimientosPrint.length === 0}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M7 7h10M7 17h10M5 21h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  <span>🛠️ Proc</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!informeProcedimientoDisponible) {
                      setMsg("Complete el campo de Procedimiento Medico para emitir el informe.");
                      return;
                    }
                    if (!readOnly && currentSnapshot !== serverSnapshot) {
                      setMsg("Guarde la HC antes de emitir el informe de procedimiento.");
                      return;
                    }
                    if (printInformeProcRef.current) {
                      handlePrintInformeProcedimiento();
                    } else {
                      console.warn('Referencia de informe de procedimiento no disponible');
                    }
                  }}
                  className="inline-flex items-center justify-center gap-2 px-4 py-3 text-white rounded-xl font-semibold transition-all duration-200 hover:scale-105 shadow-lg text-sm whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                  style={darkBrandActionStyle}
                  disabled={!informeProcedimientoDisponible}
                  title="Imprimir informe formal del procedimiento medico"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6M8 4h8a2 2 0 012 2v12a2 2 0 01-2 2H8a2 2 0 01-2-2V6a2 2 0 012-2z" />
                  </svg>
                  <span>📄 Informe Proc</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!hc.receta || hc.receta.length === 0) {
                      console.warn('Referencia de receta no disponible o sin medicamentos');
                      return;
                    }
                    handlePrintReceta();
                  }}
                  className="inline-flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 text-white rounded-xl font-semibold transition-all duration-200 hover:scale-105 shadow-lg text-sm whitespace-nowrap"
                  disabled={!hc.receta || hc.receta.length === 0}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                  </svg>
                  <span>💊 Receta</span>
                </button>
              </div>
              <div className="text-center w-full mt-4 pt-4 border-t border-gray-200">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h14a2 2 0 002-2V7a2 2 0 00-2-2h-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  <span className="text-sm font-medium text-gray-700">✍️ Firma Digital</span>
                </div>
                {firmaMedico ? (
                  <div className="flex flex-col items-center gap-3 max-w-xs mx-auto">
                    <div className="bg-white border-2 border-gray-200 rounded-lg p-3 shadow-sm">
                      <img 
                        src={firmaMedico} 
                        alt="Firma del médico" 
                        className="max-h-16 max-w-[200px] object-contain"
                      />
                    </div>
                    <div className="border-t-2 border-gray-300 pt-2 w-full">
                      <div className="text-xs text-gray-600 font-medium">
                        {medicoInfo?.nombre} {medicoInfo?.apellido}
                      </div>
                      {medicoInfo?.especialidad && (
                        <div className="text-xs text-gray-500">
                          {medicoInfo.especialidad}
                        </div>
                      )}
                      <div className="text-xs text-gray-500">
                        {formatColegiatura(medicoInfo)}
                        {medicoInfo?.rne && ` - R.N.E ${medicoInfo.rne}`}
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        Sistema Médico Digitalizado
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="border-t-2 border-gray-300 pt-2 max-w-xs mx-auto">
                    <div className="text-xs text-gray-500 font-medium">FIRMA Y SELLO MÉDICO</div>
                    <div className="text-xs text-gray-400 mt-1">Sistema Médico Digitalizado</div>
                    <div className="text-xs text-orange-500 mt-2 italic">
                      ⚠️ No hay firma registrada
                    </div>
                  </div>
                )}
              </div>
            </div>
            {msg && (
              <div className={`mt-4 p-4 rounded-xl border text-center font-medium ${
                msg.includes('correctamente') 
                  ? 'bg-green-50 border-green-200 text-green-800' 
                  : 'bg-red-50 border-red-200 text-red-800'
              }`}>
                <div className="flex items-center justify-center gap-2">
                  {msg.includes('correctamente') ? (
                    <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                  {msg}
                </div>
              </div>
            )}
          </div>
        </form>
        )}
      </div>

      {mostrarModalGuardado && (
        <div className="fixed inset-0 z-[80] bg-slate-900/45 flex items-center justify-center px-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200 p-5">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 h-9 w-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-base font-semibold text-slate-800">Guardado exitoso</h3>
                <p className="mt-1 text-sm text-slate-600">{mensajeModalGuardado || "Los datos se guardaron correctamente."}</p>
              </div>
            </div>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setMostrarModalGuardado(false)}
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Vista dedicada de continuidad clínica */}
      {vistaClinicaActiva === 'continuidad' && (
        <section className="max-w-7xl mx-auto px-4 md:px-6 pb-8">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 shadow-sm">
            <div className="sticky top-0 z-10 border-b border-slate-200 bg-slate-100/95 backdrop-blur px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-800">Historial Clínico Previo</p>
                <button
                  type="button"
                  onClick={() => setVistaClinicaActiva('registro')}
                  className="w-8 h-8 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                  title="Volver a registro actual"
                >
                  ←
                </button>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={irHistoriaSiguiente}
                  className="px-2 py-1 rounded-lg bg-white border border-slate-300 text-slate-700 text-xs hover:bg-slate-100 disabled:opacity-50"
                  disabled={hcAnteriorLoading || totalHistoriasPrevias <= 1 || indiceHistoriaPrevia <= 0}
                >
                  ◀
                </button>
                <p className="text-xs text-slate-700 flex-1 text-center font-medium">
                  {totalHistoriasPrevias > 0
                    ? `Consulta del ${formatearFechaCorta(hcAnterior?.fecha_consulta || hcAnterior?.fecha_registro)} - Paso ${indiceHistoriaPrevia + 1} de ${totalHistoriasPrevias}`
                    : 'Sin historias previas'}
                </p>
                <button
                  type="button"
                  onClick={irHistoriaAnterior}
                  className="px-2 py-1 rounded-lg bg-white border border-slate-300 text-slate-700 text-xs hover:bg-slate-100 disabled:opacity-50"
                  disabled={hcAnteriorLoading || totalHistoriasPrevias <= 1 || indiceHistoriaPrevia >= (totalHistoriasPrevias - 1)}
                >
                  ▶
                </button>
                <button
                  type="button"
                  onClick={() => setMostrarHcAnterior((v) => !v)}
                  className="px-2 py-1 rounded-lg bg-amber-600 text-white text-xs hover:bg-amber-700"
                  disabled={hcAnteriorLoading || (!hcAnterior && !hcAnteriorError)}
                >
                  {mostrarHcAnterior ? 'Ocultar detalle' : 'Ver detalle'}
                </button>
                <button
                  type="button"
                  onClick={importarDiagnosticoPrincipalRapido}
                  className="px-2 py-1 rounded-lg bg-cyan-600 text-white text-xs hover:bg-cyan-700 disabled:opacity-50"
                  disabled={readOnly || hcAnteriorLoading || diagnosticosPreviosDetalle.length === 0}
                  title={readOnly ? 'No disponible en solo lectura' : 'Importar solo diagnóstico principal'}
                >
                  Importar DX principal
                </button>
                <button
                  type="button"
                  onClick={importarDiagnosticoDesdeAnterior}
                  className="px-2 py-1 rounded-lg bg-emerald-600 text-white text-xs hover:bg-emerald-700 disabled:opacity-50"
                  disabled={readOnly || hcAnteriorLoading || diagnosticosPreviosDetalle.length === 0}
                  title={readOnly ? 'No disponible en solo lectura' : 'Importar diagnóstico al formulario actual'}
                >
                  Importar diagnóstico
                </button>
              </div>

              {totalHistoriasPrevias > 0 && (
                <div className="mt-3">
                  <p className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide mb-2">Línea de tiempo (acceso directo)</p>
                  <div className="flex flex-wrap gap-2">
                    {historiasPrevias.map((item, index) => {
                      const activo = index === indiceHistoriaPrevia;
                      const fechaNodo = formatearFechaCorta(item?.fecha_consulta || item?.fecha_registro);
                      const consultaNodo = Number(item?.consulta_id || 0);
                      return (
                        <button
                          key={`timeline-hc-${consultaNodo || index}`}
                          type="button"
                          onClick={() => seleccionarHistoriaPrevia(index)}
                          className={`rounded-xl border px-3 py-2 text-left transition-colors ${
                            activo
                              ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                              : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <p className="text-[11px] font-semibold">#{consultaNodo > 0 ? consultaNodo : '-'}</p>
                          <p className="text-[11px]">{fechaNodo}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="px-4 py-4">
              {hcAnteriorLoading && (
                <p className="text-xs text-slate-700">Cargando resumen de la HC anterior...</p>
              )}

              {!hcAnteriorLoading && hcAnteriorError && (
                <p className="text-xs text-red-700">{hcAnteriorError}</p>
              )}

              {!hcAnteriorLoading && !hcAnterior && !hcAnteriorError && (
                <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-600">
                  No hay historias clínicas previas encadenadas para mostrar en este paciente/consulta.
                </div>
              )}

              {!hcAnteriorLoading && hcAnterior?.datos && (
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-slate-700">
                    <div>
                      <span className="font-semibold">Fecha HC previa:</span>{' '}
                      {formatearFechaCorta(hcAnterior?.fecha_registro)}
                    </div>
                    <div>
                      <span className="font-semibold">Consulta origen:</span>{' '}
                      #{Number(hcAnterior?.consulta_id || 0)}
                    </div>
                    <div className="md:col-span-2">
                      <span className="font-semibold">Médico que atendió:</span>{' '}
                      {medicoLabelPrevio}
                    </div>
                  </div>

                  {/* Metadatos de cadena — solo cuando la migración 18 está aplicada */}
                  {hcAnterior?.chain_depth != null && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 border border-indigo-200 px-2 py-0.5 text-[10px] font-medium text-indigo-700">
                        Nodo {Number(hcAnterior.chain_depth) + 1} de la cadena
                      </span>
                      {hcAnterior?.contrato_paciente_id > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                          Contrato #{hcAnterior.contrato_paciente_id}
                        </span>
                      )}
                      {hcAnterior?.chain_status && hcAnterior.chain_status !== 'activa' && (
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium border ${
                          hcAnterior.chain_status === 'cerrada'
                            ? 'bg-slate-50 border-slate-300 text-slate-600'
                            : 'bg-red-50 border-red-200 text-red-700'
                        }`}>
                          {hcAnterior.chain_status === 'cerrada' ? 'Cadena cerrada' : 'Anulada'}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="mt-3 text-xs text-slate-800">
                    <p className="font-semibold">Diagnóstico previo</p>
                    <p className="mt-1 text-slate-700">
                      {diagnosticosPrevios.length > 0 ? diagnosticosPrevios[0] : 'Sin diagnóstico registrado'}
                    </p>
                  </div>

                  <div className="mt-3 text-xs text-slate-800">
                    <p className="font-semibold">Tratamiento previo</p>
                    <p className="mt-1 text-slate-700 whitespace-pre-wrap">
                      {tratamientoPrevio || 'Sin tratamiento registrado'}
                    </p>
                  </div>

                  {mostrarHcAnterior && (
                    <div className="mt-4 space-y-3 border-t border-slate-100 pt-3">
                      {diagnosticosPreviosDetalle.length > 0 && (
                        <div className="text-xs text-slate-800 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                          <p className="font-semibold">Diagnósticos previos (detalle)</p>
                          <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200 bg-white">
                            <table className="min-w-full divide-y divide-slate-200">
                              <thead className="bg-slate-100">
                                <tr>
                                  <th className="px-3 py-2 text-left font-semibold text-slate-700">Código</th>
                                  <th className="px-3 py-2 text-left font-semibold text-slate-700">Diagnóstico</th>
                                  <th className="px-3 py-2 text-left font-semibold text-slate-700">Tipo</th>
                                  <th className="px-3 py-2 text-left font-semibold text-slate-700">Observaciones</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {diagnosticosPreviosDetalle.map((dx) => (
                                  <tr key={dx.key} className="align-top">
                                    <td className="px-3 py-2 text-slate-700">{dx.codigo || '-'}</td>
                                    <td className="px-3 py-2 text-slate-800">{dx.nombre || '-'}</td>
                                    <td className="px-3 py-2 text-slate-700">{dx.tipo || '-'}</td>
                                    <td className="px-3 py-2 text-slate-700 whitespace-pre-wrap">{dx.observaciones || '-'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {mostrarExamenFisicoPrevio && (
                        <div className="text-xs text-slate-800">
                          <p className="font-semibold">Examen físico previo</p>
                          <p className="mt-1 text-slate-700 whitespace-pre-wrap">
                            {examenFisicoPrevio || 'Sin examen físico registrado'}
                          </p>
                        </div>
                      )}

                      {recetaPrevia.length > 0 && (
                        <div className="text-xs text-slate-800 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                          <p className="font-semibold">Receta previa</p>
                          <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200 bg-white">
                            <table className="min-w-full divide-y divide-slate-200">
                              <thead className="bg-slate-100">
                                <tr>
                                  <th className="px-3 py-2 text-left font-semibold text-slate-700">Medicamento</th>
                                  <th className="px-3 py-2 text-left font-semibold text-slate-700">Dosis</th>
                                  <th className="px-3 py-2 text-left font-semibold text-slate-700">Frecuencia</th>
                                  <th className="px-3 py-2 text-left font-semibold text-slate-700">Duración</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {recetaPrevia.map((item, index) => {
                                  const nombre = String(item?.nombre || item?.medicamento || item?.descripcion || '').trim();
                                  const codigo = String(item?.codigo || '').trim();
                                  const dosis = String(item?.dosis || '').trim();
                                  const frecuencia = String(item?.frecuencia || '').trim();
                                  const duracion = String(item?.duracion || '').trim();
                                  const observaciones = String(item?.observaciones || '').trim();

                                  return (
                                    <Fragment key={`receta-previa-${index}`}>
                                      <tr key={`receta-previa-row-${index}`} className="align-top">
                                        <td className="px-3 py-2 text-slate-800">
                                          <div className="font-medium">{nombre || `Medicamento ${index + 1}`}</div>
                                          {codigo && <div className="text-slate-500">Código: {codigo}</div>}
                                        </td>
                                        <td className="px-3 py-2 text-slate-700">{dosis || '-'}</td>
                                        <td className="px-3 py-2 text-slate-700">{frecuencia || '-'}</td>
                                        <td className="px-3 py-2 text-slate-700">{duracion || '-'}</td>
                                      </tr>
                                      {observaciones && (
                                        <tr key={`receta-previa-obs-${index}`} className="bg-slate-50">
                                          <td colSpan={4} className="px-3 py-2 text-slate-600 whitespace-pre-wrap">
                                            <span className="font-medium text-slate-700">Observaciones:</span> {observaciones}
                                          </td>
                                        </tr>
                                      )}
                                    </Fragment>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      <div className="text-xs text-slate-800 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                        <p className="font-semibold">Estado de tratamiento enfermería (HC previa)</p>

                        {tratamientoEstadoHcPrevia.loading && (
                          <p className="mt-2 text-slate-600">Cargando estado...</p>
                        )}

                        {!tratamientoEstadoHcPrevia.loading && tratamientoEstadoHcPrevia.error && (
                          <p className="mt-2 text-red-600">{tratamientoEstadoHcPrevia.error}</p>
                        )}

                        {!tratamientoEstadoHcPrevia.loading && !tratamientoEstadoHcPrevia.error && !tratamientoPrevioEnfermeria && (
                          <p className="mt-2 text-slate-600">Sin registro de tratamiento de enfermería para esta consulta previa.</p>
                        )}

                        {!tratamientoEstadoHcPrevia.loading && !tratamientoEstadoHcPrevia.error && tratamientoPrevioEnfermeria && (
                          <div className="mt-2 space-y-2">
                            {tratamientoPrevioCompletado && (
                              <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                                <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center text-lg font-bold leading-none">
                                  ✓
                                </div>
                                <div>
                                  <p className="text-emerald-800 font-semibold">Tratamiento completado</p>
                                  <p className="text-emerald-700 text-[11px]">
                                    Cierre registrado: {tratamientoPrevioCompletadoEn || "-"}
                                  </p>
                                </div>
                              </div>
                            )}

                            <div className="flex flex-wrap items-center gap-2">
                              <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700">
                                Estado: {estadoTratamientoPrevioLabel}
                              </span>
                              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                                tratamientoPrevioCompletado
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                  : "border-amber-200 bg-amber-50 text-amber-700"
                              }`}>
                                {tratamientoPrevioCompletado ? "Completado: Sí" : "Completado: No"}
                              </span>
                              <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700">
                                Progreso: {Number(tratamientoPrevioEnfermeria?.progreso_pct || 0).toFixed(0)}%
                              </span>
                            </div>

                            {tratamientoPrevioCompletado && (
                              <p className="text-slate-700">
                                Fecha de completado: <span className="font-semibold">{tratamientoPrevioCompletadoEn || "-"}</span>
                              </p>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="text-xs text-slate-800 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                        <p className="font-semibold">Apoyo diagnóstico previo</p>
                        <div className="mt-2 space-y-2">
                          <div className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-white px-2 py-2">
                            <div>
                              <p className="font-medium text-slate-800">Laboratorio</p>
                              <p className="mt-0.5 inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700">
                                Fuente: {fuenteLaboratorioLabel}
                              </p>
                              <p className="text-[11px] text-slate-600">
                                {laboratorioDisponible
                                  ? `Resultados/documentos detectados (${Number(apoyoLaboratorio?.resultados || 0)} resultados, ${Number(apoyoLaboratorio?.documentos || 0)} adjuntos)`
                                  : 'No hay resultados disponibles'}
                              </p>
                            </div>
                            {laboratorioDisponible ? (
                              <button
                                type="button"
                                onClick={() => abrirRecursoHistorialPrevio(apoyoLaboratorio?.target || `/resultados-laboratorio/${Number(apoyoLaboratorio?.consulta_id || hcAnterior?.consulta_id || 0)}`)}
                                className="shrink-0 px-2 py-1 rounded bg-emerald-600 text-white text-[11px] hover:bg-emerald-700"
                              >
                                Ver resultados
                              </button>
                            ) : (
                              <span className="shrink-0 text-[11px] text-slate-400">Sin datos</span>
                            )}
                          </div>

                          <div className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-white px-2 py-2">
                            <div>
                              <p className="font-medium text-slate-800">Ecografía</p>
                              <p className="mt-0.5 inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700">
                                Fuente: {fuenteEcografiaLabel}
                              </p>
                              <p className="text-[11px] text-slate-600">
                                {ecografiaDisponible
                                  ? `Archivos detectados (${Number(apoyoEcografia?.archivos || 0)})`
                                  : 'No hay resultados disponibles'}
                              </p>
                            </div>
                            {ecografiaDisponible ? (
                              <button
                                type="button"
                                onClick={() => abrirRecursoHistorialPrevio(apoyoEcografia?.target || `/visor-imagen/${Number(apoyoEcografia?.ultima_orden_id || 0)}`)}
                                className="shrink-0 px-2 py-1 rounded bg-violet-600 text-white text-[11px] hover:bg-violet-700"
                              >
                                Abrir visor
                              </button>
                            ) : (
                              <span className="shrink-0 text-[11px] text-slate-400">Sin datos</span>
                            )}
                          </div>

                          {ecografiaDisponible && Number(apoyoEcografia?.ultima_orden_id || 0) > 0 && (
                            <div className="rounded-lg border border-violet-200 bg-violet-50 px-2 py-2">
                              <p className="mb-2 text-[11px] font-semibold text-violet-800">
                                Informe de imagenología (HC previa)
                              </p>
                              <VisorInformeImagenologiaHC
                                ordenImagenId={Number(apoyoEcografia?.ultima_orden_id || 0)}
                                servicioNombre="Ecografía"
                                pacienteNombre={`${paciente?.nombre || ""} ${paciente?.apellido || ""}`.trim() || "Paciente"}
                              />
                            </div>
                          )}

                          <div className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-white px-2 py-2">
                            <div>
                              <p className="font-medium text-slate-800">Rayos X</p>
                              <p className="mt-0.5 inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700">
                                Fuente: {fuenteRxLabel}
                              </p>
                              <p className="text-[11px] text-slate-600">
                                {rxDisponible
                                  ? `Archivos detectados (${Number(apoyoRx?.archivos || 0)})`
                                  : 'No hay resultados disponibles'}
                              </p>
                            </div>
                            {rxDisponible ? (
                              <button
                                type="button"
                                onClick={() => abrirRecursoHistorialPrevio(apoyoRx?.target || `/visor-imagen/${Number(apoyoRx?.ultima_orden_id || 0)}`)}
                                className="shrink-0 px-2 py-1 rounded bg-sky-600 text-white text-[11px] hover:bg-sky-700"
                              >
                                Abrir visor
                              </button>
                            ) : (
                              <span className="shrink-0 text-[11px] text-slate-400">Sin datos</span>
                            )}
                          </div>

                          {rxDisponible && Number(apoyoRx?.ultima_orden_id || 0) > 0 && (
                            <div className="rounded-lg border border-sky-200 bg-sky-50 px-2 py-2">
                              <p className="mb-2 text-[11px] font-semibold text-sky-800">
                                Informe de Rayos X (HC previa)
                              </p>
                              <VisorInformeImagenologiaHC
                                ordenImagenId={Number(apoyoRx?.ultima_orden_id || 0)}
                                servicioNombre="Rayos X"
                                pacienteNombre={`${paciente?.nombre || ""} ${paciente?.apellido || ""}`.trim() || "Paciente"}
                              />
                            </div>
                          )}

                          <div className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-white px-2 py-2">
                            <div>
                              <p className="font-medium text-slate-800">Tomografía</p>
                              <p className="mt-0.5 inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700">
                                Fuente: {fuenteTomografiaLabel}
                              </p>
                              <p className="text-[11px] text-slate-600">
                                {tomografiaDisponible
                                  ? `Archivos detectados (${Number(apoyoTomografia?.archivos || 0)})`
                                  : 'No hay resultados disponibles'}
                              </p>
                            </div>
                            {tomografiaDisponible ? (
                              <button
                                type="button"
                                onClick={() => abrirRecursoHistorialPrevio(apoyoTomografia?.target || `/visor-imagen/${Number(apoyoTomografia?.ultima_orden_id || 0)}`)}
                                className="shrink-0 px-2 py-1 rounded bg-amber-600 text-white text-[11px] hover:bg-amber-700"
                              >
                                Abrir visor
                              </button>
                            ) : (
                              <span className="shrink-0 text-[11px] text-slate-400">Sin datos</span>
                            )}
                          </div>

                          {tomografiaDisponible && Number(apoyoTomografia?.ultima_orden_id || 0) > 0 && (
                            <div className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-2">
                              <p className="mb-2 text-[11px] font-semibold text-amber-800">
                                Informe de Tomografía (HC previa)
                              </p>
                              <VisorInformeImagenologiaHC
                                ordenImagenId={Number(apoyoTomografia?.ultima_orden_id || 0)}
                                servicioNombre="Tomografía"
                                pacienteNombre={`${paciente?.nombre || ""} ${paciente?.apellido || ""}`.trim() || "Paciente"}
                              />
                            </div>
                          )}
                        </div>
                      </div>

                      {(adjuntosImagenes.length > 0 || adjuntosPdf.length > 0) && (
                        <div className="text-xs text-slate-800 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                          <p className="font-semibold">Exámenes y adjuntos</p>

                          {adjuntosImagenes.length > 0 && (
                            <div className="mt-2">
                              <p className="text-[11px] font-medium text-slate-700 mb-2">Imágenes</p>
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {adjuntosImagenes.map((archivo, index) => (
                                  <button
                                    key={`adj-img-${archivo.archivo_id || index}`}
                                    type="button"
                                    onClick={() => setPreviewAdjuntoImagen({
                                      url: archivo.url,
                                      nombre: archivo.nombre_original || `Imagen ${index + 1}`,
                                      titulo: archivo._docTitulo,
                                    })}
                                    className="rounded-lg border border-slate-200 bg-white p-1 hover:bg-slate-100 text-left"
                                  >
                                    <img
                                      src={archivo.url}
                                      alt={archivo.nombre_original || `Imagen ${index + 1}`}
                                      className="w-full h-20 object-cover rounded"
                                    />
                                    <p className="mt-1 text-[10px] text-slate-600 truncate" title={archivo._docTitulo}>{archivo._docTitulo}</p>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          {adjuntosPdf.length > 0 && (
                            <div className="mt-3">
                              <p className="text-[11px] font-medium text-slate-700 mb-2">Documentos PDF</p>
                              <div className="space-y-2">
                                {adjuntosPdf.map((archivo, index) => (
                                  <div key={`adj-pdf-${archivo.archivo_id || index}`} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2 py-2">
                                    <div className="min-w-0">
                                      <p className="text-xs font-medium text-slate-800 truncate">{archivo.nombre_original || `Documento ${index + 1}`}</p>
                                      <p className="text-[10px] text-slate-500 truncate">{archivo._docTitulo}</p>
                                    </div>
                                    <a
                                      href={archivo.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="px-2 py-1 rounded bg-slate-700 text-white text-[10px] hover:bg-slate-800 whitespace-nowrap"
                                    >
                                      Ver PDF
                                    </a>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {hcAnterior?.template?.nombre && (
                        <div className="text-xs text-slate-700 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                          Plantilla origen: <span className="font-semibold">{hcAnterior.template.nombre}</span>
                          {hcAnterior?.template?.version ? ` • Versión ${hcAnterior.template.version}` : ''}
                        </div>
                      )}

                      {seccionesPreviasDinamicas.map((section) => (
                        <div key={`prev-section-${section.sectionKey}`} className="text-xs text-slate-800 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                          <p className="font-semibold">{section.label}</p>
                          <div className="mt-2 space-y-2">
                            {section.fields.map((field) => (
                              <div key={`prev-field-${section.sectionKey}-${field.fieldKey}`}>
                                <p className="font-medium text-slate-700">{field.label}</p>
                                <p className="mt-0.5 text-slate-600 whitespace-pre-wrap">{field.value}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}

                      {seccionesPreviasDinamicas.length === 0 && camposPreviosFallback.length > 0 && (
                        <div className="text-xs text-slate-800 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                          <p className="font-semibold">Campos registrados</p>
                          <div className="mt-2 space-y-2">
                            {camposPreviosFallback.map((field) => (
                              <div key={`prev-fallback-${field.fieldKey}`}>
                                <p className="font-medium text-slate-700">{field.label}</p>
                                <p className="mt-0.5 text-slate-600 whitespace-pre-wrap">{field.value}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Modal visor de imagen de adjunto */}
      {previewAdjuntoImagen && (
        <div className="fixed inset-0 z-[70] bg-slate-900/80 flex items-center justify-center p-4" onClick={() => setPreviewAdjuntoImagen(null)}>
          <div className="relative max-w-5xl max-h-[90vh] w-full" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setPreviewAdjuntoImagen(null)}
              className="absolute -top-10 right-0 w-8 h-8 rounded-full bg-white text-slate-800 shadow hover:bg-slate-100"
              title="Cerrar visor"
            >
              ✕
            </button>
            <div className="bg-white rounded-xl overflow-hidden border border-slate-200 shadow-2xl">
              <div className="px-3 py-2 border-b border-slate-200 bg-slate-50">
                <p className="text-xs font-medium text-slate-800 truncate">{previewAdjuntoImagen.titulo || previewAdjuntoImagen.nombre}</p>
                <p className="text-[11px] text-slate-600 truncate">{previewAdjuntoImagen.nombre}</p>
              </div>
              <div className="bg-black flex items-center justify-center max-h-[78vh] overflow-auto">
                <img
                  src={previewAdjuntoImagen.url}
                  alt={previewAdjuntoImagen.nombre}
                  className="max-w-full max-h-[78vh] object-contain"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de importación de diagnóstico */}
      {mostrarImportarDiagnosticoModal && (
        <div className="fixed inset-0 z-[75] bg-slate-900/60 flex items-center justify-center p-4" onClick={() => setMostrarImportarDiagnosticoModal(false)}>
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-200">
              <p className="text-sm font-semibold text-slate-900">Importar diagnóstico desde HC previa</p>
              <p className="text-xs text-slate-600 mt-1">
                Elige cómo quieres llevar el diagnóstico de la historia seleccionada al formulario actual.
              </p>
            </div>
            <div className="px-5 py-4 space-y-3">
              <button
                type="button"
                onClick={() => ejecutarImportacionDiagnostico('replace')}
                className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-medium text-white hover:bg-emerald-700"
              >
                Reemplazar diagnóstico actual
              </button>
              <button
                type="button"
                onClick={() => ejecutarImportacionDiagnostico('append')}
                className="w-full rounded-xl bg-slate-800 px-4 py-3 text-sm font-medium text-white hover:bg-slate-900"
              >
                Agregar al diagnóstico actual
              </button>
              <button
                type="button"
                onClick={() => setMostrarImportarDiagnosticoModal(false)}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Componente oculto para impresión de Historia Clínica */}
      <div style={{ position: 'absolute', top: '-9999px', left: '-9999px' }}>
        <div ref={printRef}>
          <ImpresionHistoriaClinica
            paciente={paciente}
            triaje={triaje}
            hc={hc}
            fechaConsulta={fechaConsulta}
            fechaConsultaTexto={fechaConsultaVisible}
            templateSections={hcTemplateMeta?.sections || {}}
            diagnosticos={diagnosticos}
            medicamentos={hc.receta}
            resultadosLaboratorio={resultadosLab}
            ordenesLaboratorio={ordenesLab}
            ordenesImagen={ordenesImagenPrint}
            ordenesProcedimientos={ordenesProcedimientosPrint}
            medicoInfo={medicoInfo}
            configuracionClinica={configuracionClinica}
          />
        </div>
      </div>
      {/* Componente oculto para impresión de Análisis de Laboratorio */}
      <div style={{ position: 'absolute', top: '-9999px', left: '-9999px' }}>
        <div ref={printLabRef}>
          <ImpresionAnalisisLaboratorio
            paciente={paciente}
            ordenesLaboratorio={ordenesLab}
            medicoInfo={medicoInfo}
            firmaMedico={firmaMedico}
            configuracionClinica={configuracionClinica}
          />
        </div>
      </div>
      {/* Componente oculto para impresión de Receta de Medicamentos */}
      <div style={{ position: 'absolute', top: '-9999px', left: '-9999px' }}>
        <div ref={printRecetaRef}>
          <ImpresionRecetaMedicamentos
            paciente={paciente}
            medicamentos={hc.receta}
            recomendaciones={hc.recomendaciones || ''}
            medicoInfo={medicoInfo}
            configuracionClinica={configuracionClinica}
            diagnosticos={diagnosticos}
          />
        </div>
      </div>
      {/* Componente oculto para impresión de Imágenes Diagnósticas */}
      <div style={{ position: 'absolute', top: '-9999px', left: '-9999px' }}>
        <div ref={printImagenRef}>
          <ImpresionServiciosSolicitados
            paciente={paciente}
            medicoInfo={medicoInfo}
            firmaMedico={firmaMedico}
            configuracionClinica={configuracionClinica}
            ordenes={ordenesImagenPrint}
            tipo="imagen"
          />
        </div>
      </div>
      {/* Componente oculto para impresión de Procedimientos */}
      <div style={{ position: 'absolute', top: '-9999px', left: '-9999px' }}>
        <div ref={printProcRef}>
          <ImpresionServiciosSolicitados
            paciente={paciente}
            medicoInfo={medicoInfo}
            firmaMedico={firmaMedico}
            configuracionClinica={configuracionClinica}
            ordenes={ordenesProcedimientosPrint}
            tipo="procedimientos"
          />
        </div>
      </div>
      {/* Componente oculto para impresión de Informe de Procedimiento */}
      <div style={{ position: 'absolute', top: '-9999px', left: '-9999px' }}>
        <div ref={printInformeProcRef}>
          <ImpresionInformeProcedimiento
            paciente={paciente}
            medicoInfo={medicoInfo}
            firmaMedico={firmaMedico}
            configuracionClinica={configuracionClinica}
            fechaConsultaTexto={fechaConsultaVisible}
            fechaInforme={new Date()}
            contenidoPrincipal={informeProcedimiento?.contenidoPrincipal}
            camposDetalle={informeProcedimiento?.camposDetalle || []}
          />
        </div>
      </div>
    </div>
  );
}

export default HistoriaClinicaPage;
