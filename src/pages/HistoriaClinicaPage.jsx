
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { BASE_URL } from "../config/config";
import TabsApoyoDiagnostico from "../components/examenes/TabsApoyoDiagnostico";
import { FormularioHistoriaClinica, TriajePaciente, DatosPaciente, TratamientoPaciente } from "../components/paciente";
import DiagnosticoCIE10Selector from "../components/diagnostico/DiagnosticoCIE10Selector";
import ImpresionHistoriaClinica from "../components/print/ImpresionHistoriaClinica";
import ImpresionAnalisisLaboratorio from "../components/print/ImpresionAnalisisLaboratorio";
import ImpresionRecetaMedicamentos from "../components/print/ImpresionRecetaMedicamentos";
import { usePrintHistoriaClinica, usePrintLaboratorio, usePrintReceta } from "../hooks/usePrint";
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
const HC_DRAFT_STORAGE_PREFIX = "hc_draft_v1";
const HC_DRAFT_TTL_MS = 72 * 60 * 60 * 1000;

function buildDraftStorageKey(consultaId, pacienteId) {
  const consulta = String(consultaId || "").trim();
  const paciente = String(pacienteId || "").trim();
  if (!consulta || !paciente) return "";
  return `${HC_DRAFT_STORAGE_PREFIX}_${consulta}_${paciente}`;
}

function normalizeHistoriaData(rawDatos) {
  const source = rawDatos && typeof rawDatos === "object" ? rawDatos : {};
  const rawProxima = source.proxima_cita || {};
  return {
    ...source,
    receta: Array.isArray(source.receta) ? source.receta : [],
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
  const readOnly = location.pathname.startsWith('/historia-clinica-lectura') || searchParams.get('read_only') === '1';
  const backTo = searchParams.get('back_to') || '';
  const { componentRef: printRef, handlePrint: handlePrintHC } = usePrintHistoriaClinica();
  const { componentRef: printLabRef, handlePrint: handlePrintLab } = usePrintLaboratorio();
  const { componentRef: printRecetaRef, handlePrint: handlePrintReceta } = usePrintReceta();
  const [medicoInfo, setMedicoInfo] = useState(null);
  const [configuracionClinica, setConfiguracionClinica] = useState(null);
  const [firmaMedico, setFirmaMedico] = useState(null);
  const [resultadosLab, setResultadosLab] = useState([]);
  const [ordenesLab, setOrdenesLab] = useState([]);
  const [usuarioSesion, setUsuarioSesion] = useState(null);
  const [fechaConsulta, setFechaConsulta] = useState("");
  const [consultaActual, setConsultaActual] = useState(null);
  const [historiasPrevias, setHistoriasPrevias] = useState([]);
  const [indiceHistoriaPrevia, setIndiceHistoriaPrevia] = useState(0);
  const [hcAnterior, setHcAnterior] = useState(null);
  const [hcAnteriorError, setHcAnteriorError] = useState("");
  const [hcAnteriorLoading, setHcAnteriorLoading] = useState(false);
  const [drawerHistorialAbierto, setDrawerHistorialAbierto] = useState(false);
  const [mostrarHcAnterior, setMostrarHcAnterior] = useState(false);
  const [previewAdjuntoImagen, setPreviewAdjuntoImagen] = useState(null);
  const [mostrarImportarDiagnosticoModal, setMostrarImportarDiagnosticoModal] = useState(false);
  useEffect(() => {
    const usuarioRaw = sessionStorage.getItem("usuario");
    if (usuarioRaw) {
      try {
        setUsuarioSesion(JSON.parse(usuarioRaw));
      } catch {
        setUsuarioSesion(null);
      }
    } else {
      setUsuarioSesion(null);
    }
  }, []);
  useEffect(() => {
    if (!consultaId) return;
    const noCache = `_t=${Date.now()}`;
    fetch(`${BASE_URL}api_resultados_laboratorio.php?consulta_id=${consultaId}&${noCache}`, {
      credentials: 'include',
      cache: 'no-store',
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.resultados) setResultadosLab(data.resultados);
        else setResultadosLab([]);
      })
      .catch(() => setResultadosLab([]));
    fetch(`${BASE_URL}api_ordenes_laboratorio.php?consulta_id=${consultaId}&${noCache}`, {
      credentials: 'include',
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
    fetch(`${BASE_URL}api_historia_clinica.php?consulta_id=${consultaId}${templateQuery}`, { credentials: 'include' })
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
      persistDraftNow();
    }, 800);
    return () => window.clearTimeout(timer);
  }, [clearDraft, currentSnapshot, draftHydrated, draftKey, persistDraftNow, readOnly, serverSnapshot]);
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
        const res = await fetch(`${BASE_URL}api_consultas.php?paciente_id=${actualPacienteId}&solo_activas=1`, {
          credentials: 'include',
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
    fetch(`${BASE_URL}api_pacientes.php?id=${pacienteId}`)
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
    fetch(`${BASE_URL}api_triaje.php?consulta_id=${consultaId}`, { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.triaje && data.triaje.datos)
          setTriaje(data.triaje.datos);
        else setTriaje(null);
      })
      .catch(() => setTriaje(null));
  }, [consultaId]);
  useEffect(() => {
    fetch(`${BASE_URL}api_get_configuracion.php`, { credentials: 'include' })
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
        const res = await fetch(`${BASE_URL}api_consultas.php?consulta_id=${consultaId}`, {
          credentials: 'include',
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
    const hcOrigenId = Number(consultaActual?.hc_origen_id || 0);
    if (hcOrigenId <= 0) {
      setHistoriasPrevias([]);
      setIndiceHistoriaPrevia(0);
      setHcAnterior(null);
      setHcAnteriorError("");
      setDrawerHistorialAbierto(false);
      setMostrarHcAnterior(false);
      return;
    }

    let cancelled = false;
    setHcAnteriorError("");

    const cacheKey = `hc_previas_chain_v1_${consultaId}`;
    let cacheHit = false;
    try {
      const raw = sessionStorage.getItem(cacheKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        const ageMs = Date.now() - Number(parsed?.timestamp || 0);
        const sameOrigen = Number(parsed?.hc_origen_id || 0) === hcOrigenId;
        if (sameOrigen && ageMs >= 0 && ageMs <= HC_PREVIAS_CACHE_TTL_MS && Array.isArray(parsed?.chain)) {
          const chain = parsed.chain;
          setHistoriasPrevias(chain);
          setIndiceHistoriaPrevia(0);
          setHcAnterior(chain[0] || null);
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
        const res = await fetch(`${BASE_URL}api_historia_clinica.php?consulta_id=${consultaId}&include_chain=1`, { credentials: 'include' });
        const data = await res.json();
        if (cancelled) return;
        const chain = Array.isArray(data.historias_previas) ? data.historias_previas : [];
        if (data.success || chain.length > 0) {
          setHistoriasPrevias(chain);
          setIndiceHistoriaPrevia(0);
          setHcAnterior(chain[0] || null);
          setHcAnteriorError("");
          try {
            sessionStorage.setItem(cacheKey, JSON.stringify({
              timestamp: Date.now(),
              hc_origen_id: hcOrigenId,
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
  }, [consultaActual?.hc_origen_id, consultaId]);

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

  const totalHistoriasPrevias = Array.isArray(historiasPrevias) ? historiasPrevias.length : 0;
  useEffect(() => {
    const handleOpenHistoryDrawer = () => {
      if (Number(consultaActual?.hc_origen_id || 0) <= 0) return;
      setDrawerHistorialAbierto(true);
    };

    window.addEventListener('hc-assistant-open-history-drawer', handleOpenHistoryDrawer);
    return () => window.removeEventListener('hc-assistant-open-history-drawer', handleOpenHistoryDrawer);
  }, [consultaActual?.hc_origen_id]);

  const irHistoriaAnterior = () => {
    if (totalHistoriasPrevias <= 0) return;
    setIndiceHistoriaPrevia((prev) => Math.min(prev + 1, totalHistoriasPrevias - 1));
  };
  const irHistoriaSiguiente = () => {
    if (totalHistoriasPrevias <= 0) return;
    setIndiceHistoriaPrevia((prev) => Math.max(prev - 1, 0));
  };
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
  const laboratorioDisponible = Boolean(apoyoLaboratorio?.has_resultados);
  const ecografiaDisponible = Boolean(apoyoEcografia?.has_resultados) && Number(apoyoEcografia?.ultima_orden_id || 0) > 0;
  const fuenteLaboratorioLabel = (() => {
    const resultados = Number(apoyoLaboratorio?.resultados || 0);
    const documentos = Number(apoyoLaboratorio?.documentos || 0);
    if (resultados > 0 && documentos > 0) return 'Interno + adjuntos externos';
    if (resultados > 0) return 'Resultados internos';
    if (documentos > 0) return 'Adjuntos externos';
    return 'Sin fuente';
  })();
  const fuenteEcografiaLabel = ecografiaDisponible ? 'Visor de imágenes' : 'Sin fuente';

  const abrirRecursoHistorialPrevio = (targetPath) => {
    const path = String(targetPath || '').trim();
    if (!path) return;
    window.open(path, '_blank', 'noopener,noreferrer');
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

  const fechaHcPreviaResumen = hcAnterior?.fecha_registro
    ? formatearFechaCorta(hcAnterior.fecha_registro)
    : '-';
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
    `Apoyo diagnostico previo: Lab ${laboratorioDisponible ? 'con resultados' : 'sin resultados'} · Ecografía ${ecografiaDisponible ? 'con imágenes' : 'sin imágenes'}`,
  ]), [
    totalHistoriasPrevias,
    fechaHcPreviaResumen,
    diagnosticoHcPreviaResumen,
    resumenLaboratorioTexto,
    resumenEcografiaTexto,
    resumenMedicacionTexto,
    laboratorioDisponible,
    ecografiaDisponible,
  ]);

  useEffect(() => {
    const payload = {
      source: 'historia-clinica',
      available: Number(consultaActual?.hc_origen_id || 0) > 0,
      readOnly,
      consultaId: Number(consultaId || 0),
      pacienteId: Number(pacienteId || 0),
      totalHistoriasPrevias,
      hcAnteriorLoading,
      hcAnteriorError,
      resumenItems: resumenAsistenteItems,
      canOpenHistoryDrawer: Number(consultaActual?.hc_origen_id || 0) > 0,
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
    consultaActual?.hc_origen_id,
    consultaId,
    pacienteId,
    readOnly,
    totalHistoriasPrevias,
    hcAnteriorLoading,
    hcAnteriorError,
    resumenAsistenteItems,
  ]);

  if (loading) return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center">
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl p-8 border border-white/50 flex flex-col items-center gap-4">
        <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-gray-600 font-medium">🏥 Cargando historia clínica...</p>
      </div>
    </div>
  );
  if (error) return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center">
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center">
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
    <div className="min-h-screen py-4 sm:py-8 px-2 sm:px-4 overflow-x-hidden" style={{ background: 'linear-gradient(to bottom right, var(--color-primary-light, #eff6ff), #ffffff, var(--color-accent, #eef2ff))' }}>
      <div className="max-w-6xl mx-auto w-full">
        {/* Header profesional de Historia Clínica */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl p-4 sm:p-6 lg:p-8 mb-6 border border-white/50 w-full">
          <div className="flex flex-col sm:flex-row items-center gap-4 mb-6">
            <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(to right, var(--color-primary, #2563eb), var(--color-secondary, #4f46e5))' }}>
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
            <div className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-green-100 to-blue-100 rounded-full flex-shrink-0">
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
            <div className="w-8 h-8 bg-gradient-to-r from-green-500 to-emerald-500 rounded-full flex items-center justify-center">
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
        {readOnly && (
          <div className="mb-6 p-4 rounded-2xl border bg-blue-50/80 border-blue-200 backdrop-blur-sm">
            <p className="text-sm font-medium text-blue-800">
              Vista de solo lectura. No se permiten cambios ni guardado de la historia clínica desde este acceso.
            </p>
          </div>
        )}

        {HC_TEMPLATE_ENGINE_READ && hcTemplateMeta && (
          <div className="mb-6 p-4 rounded-2xl border bg-indigo-50/80 border-indigo-200 backdrop-blur-sm">
            <p className="text-sm font-medium text-indigo-800">
              Plantilla HC activa: {hcTemplateMeta.nombre || hcTemplateMeta.id || "General"}
            </p>
            <p className="text-xs text-indigo-700 mt-1">
              ID: {hcTemplateMeta.id || "medicina_general"} | Version: {hcTemplateMeta.version || "n/a"}
              {hcTemplateResolution?.resolved_by === "clinica_default"
                ? " | Modo: por defecto (todas las especialidades)"
                : hcTemplateResolution?.resolved_by === "consulta_especialidad" || hcTemplateResolution?.resolved_by === "especialidad"
                  ? ` | Modo: por especialidad${hcTemplateResolution?.especialidad_detectada ? ` (${hcTemplateResolution.especialidad_detectada})` : ""}`
                  : hcTemplateResolution?.resolved_by
                    ? ` | ${hcTemplateResolution.resolved_by}`
                    : ""}
            </p>
            {usuarioSesion?.rol === "administrador" && (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => navigate("/configuracion/plantillas-hc")}
                  className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-xs hover:bg-indigo-700"
                >
                  Configurar Plantillas HC
                </button>
              </div>
            )}
          </div>
        )}
        {/* Formulario principal de Historia Clínica */}
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

              const res = await fetch(`${BASE_URL}api_historia_clinica.php`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ consulta_id: consultaId, datos }),
                credentials: "include"
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
              <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-violet-500 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-gray-800">📝 Anamnesis y Examen Físico</h2>
            </div>
            <FormularioHistoriaClinica
              hc={hc}
              setHc={setHc}
              templateSections={hcTemplateMeta?.sections || {}}
            />
          </div>
          {/* Laboratorio y Apoyo Diagnóstico */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg p-6 border border-white/50">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full flex items-center justify-center">
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
              <div className="w-8 h-8 bg-gradient-to-r from-emerald-500 to-green-500 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-gray-800">💊 Tratamiento y Receta Médica</h2>
            </div>
            <TratamientoPaciente
              receta={hc.receta || []}
              setReceta={(recetaNueva) =>
                setHc((h) => ({
                  ...h,
                  receta:
                    typeof recetaNueva === 'function'
                      ? recetaNueva(h.receta)
                      : recetaNueva,
                }))
              }
              tratamiento={hc.tratamiento || ""}
              setTratamiento={valor => setHc(h => ({ ...h, tratamiento: valor }))}
            />
          </div>
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg p-6 border border-white/50">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-8 h-8 bg-gradient-to-r from-cyan-500 to-sky-500 rounded-full flex items-center justify-center">
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
                    ? "border-cyan-400 bg-cyan-50/80"
                    : "border-slate-300 bg-white"
                } ${readOnly ? "opacity-70 cursor-not-allowed" : "hover:border-cyan-300"}`}
              >
                <div className="flex items-center gap-3 text-sm font-medium text-slate-700">
                  <span
                    className={`h-5 w-5 rounded-md border-2 flex items-center justify-center ${
                      hc.proxima_cita?.programar
                        ? "border-cyan-600 bg-cyan-600 text-white"
                        : "border-slate-400 bg-white"
                    }`}
                  >
                    {hc.proxima_cita?.programar ? "✓" : ""}
                  </span>
                  <span>Programar próxima cita al guardar esta HC</span>
                </div>
                <span className={`text-xs font-semibold px-2 py-1 rounded-full ${hc.proxima_cita?.programar ? "bg-cyan-100 text-cyan-800" : "bg-slate-100 text-slate-600"}`}>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 w-full">
                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-semibold transition-all duration-200 hover:scale-105 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none text-sm whitespace-nowrap"
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
                  className="inline-flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded-xl font-semibold transition-all duration-200 hover:scale-105 shadow-lg text-sm whitespace-nowrap"
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
                  className="inline-flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl font-semibold transition-all duration-200 hover:scale-105 shadow-lg text-sm whitespace-nowrap"
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
                    if (printRecetaRef.current && hc.receta && hc.receta.length > 0) {
                      handlePrintReceta();
                    } else {
                      console.warn('Referencia de receta no disponible o sin medicamentos');
                    }
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

      {/* Drawer lateral de historial de HC previas */}
      {Number(consultaActual?.hc_origen_id || 0) > 0 && (
        <>
          <div
            className={`fixed inset-0 z-40 bg-slate-900/40 transition-opacity duration-300 ${drawerHistorialAbierto ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
            onClick={() => setDrawerHistorialAbierto(false)}
          />
          <aside
            className={`fixed top-0 right-0 z-50 h-screen w-full sm:w-[92vw] lg:w-[40vw] bg-slate-50 border-l border-slate-200 shadow-2xl transition-transform duration-300 ${drawerHistorialAbierto ? 'translate-x-0' : 'translate-x-full'}`}
            aria-hidden={!drawerHistorialAbierto}
          >
            <div className="sticky top-0 z-10 border-b border-slate-200 bg-slate-100/95 backdrop-blur px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-800">Historial Clínico Previo</p>
                <button
                  type="button"
                  onClick={() => setDrawerHistorialAbierto(false)}
                  className="w-8 h-8 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                  title="Cerrar historial"
                >
                  ✕
                </button>
              </div>
              <div className="mt-3 flex items-center gap-2">
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
                  onClick={importarDiagnosticoDesdeAnterior}
                  className="px-2 py-1 rounded-lg bg-emerald-600 text-white text-xs hover:bg-emerald-700 disabled:opacity-50"
                  disabled={readOnly || hcAnteriorLoading || diagnosticosPreviosDetalle.length === 0}
                  title={readOnly ? 'No disponible en solo lectura' : 'Importar diagnóstico al formulario actual'}
                >
                  Importar diagnóstico
                </button>
              </div>
            </div>

            <div className="h-[calc(100vh-122px)] overflow-y-auto px-4 py-4">
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
          </aside>
        </>
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
            medicoInfo={medicoInfo}
            configuracionClinica={configuracionClinica}
          />
        </div>
      </div>
    </div>
  );
}

export default HistoriaClinicaPage;
