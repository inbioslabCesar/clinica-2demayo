
import { useEffect, useState } from "react";
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
};

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
    fetch(`${BASE_URL}api_resultados_laboratorio.php?consulta_id=${consultaId}`, { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.resultados) setResultadosLab(data.resultados);
        else setResultadosLab([]);
      })
      .catch(() => setResultadosLab([]));
    fetch(`${BASE_URL}api_ordenes_laboratorio.php?consulta_id=${consultaId}`, { credentials: 'include' })
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
  const [diagnosticos, setDiagnosticos] = useState([]);
  const [hcTemplateMeta, setHcTemplateMeta] = useState(null);
  const [hcTemplateResolution, setHcTemplateResolution] = useState(null);
  useEffect(() => {
    if (!consultaId) return;
    const templateQuery = HC_TEMPLATE_ENGINE_READ ? '&include_template=1' : '';
    fetch(`${BASE_URL}api_historia_clinica.php?consulta_id=${consultaId}${templateQuery}`, { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.datos) {
          const rawProxima = data.datos.proxima_cita || {};
          setHc({
            ...data.datos,
            receta: Array.isArray(data.datos.receta) ? data.datos.receta : [],
            proxima_cita: {
              ...DEFAULT_PROXIMA_CITA,
              ...(rawProxima && typeof rawProxima === "object" ? rawProxima : {}),
            },
          });
          if (Array.isArray(data.datos.diagnosticos)) {
            setDiagnosticos(data.datos.diagnosticos);
          } else {
            setDiagnosticos([]);
          }
        }
        if (HC_TEMPLATE_ENGINE_READ) {
          setHcTemplateMeta(data.template || null);
          setHcTemplateResolution(data.template_resolution || null);
        }
      });
  }, [consultaId]);
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
            setMedicoInfo(medicoConsulta);
            setFirmaMedico(medicoConsulta.firma || null);
          }
          return;
        }
      } catch {
        // Fallback below to session data when query fails.
      }

      const medicoSession = JSON.parse(sessionStorage.getItem('medico') || 'null');
      if (!cancelled) {
        if (medicoSession) {
          setMedicoInfo(medicoSession);
          setFirmaMedico(medicoSession.firma || null);
        } else {
          setMedicoInfo(null);
          setFirmaMedico(null);
        }
      }
    };

    cargarMedicoDesdeConsulta();

    return () => {
      cancelled = true;
    };
  }, [consultaId]);
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
            const proxima = hc.proxima_cita || DEFAULT_PROXIMA_CITA;
            if (proxima.programar && (!proxima.fecha || !proxima.hora)) {
              setMsg("Para programar próxima cita debes indicar fecha y hora.");
              return;
            }

            setGuardando(true);
            setMsg("");
            const datos = { ...hc, diagnosticos, receta: hc.receta };
            if (!proxima.programar) {
              delete datos.proxima_cita;
            }

            const res = await fetch(`${BASE_URL}api_historia_clinica.php`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ consulta_id: consultaId, datos }),
              credentials: "include"
            });
            const data = await res.json();
            setGuardando(false);
            setMsg(
              data.success
                ? (data.proxima_cita?.consulta_id
                  ? `Guardado correctamente. Próxima cita registrada #${data.proxima_cita.consulta_id}.`
                  : "Guardado correctamente")
                : data.error || "Error al guardar"
            );
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
              <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={Boolean(hc.proxima_cita?.programar)}
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
                Programar próxima cita al guardar esta HC
              </label>

              {Boolean(hc.proxima_cita?.programar) && (
                <>
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
                  disabled={guardando || readOnly}
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
      {/* Componente oculto para impresión de Historia Clínica */}
      <div style={{ position: 'absolute', top: '-9999px', left: '-9999px' }}>
        <div ref={printRef}>
          <ImpresionHistoriaClinica
            paciente={paciente}
            triaje={triaje}
            hc={hc}
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
