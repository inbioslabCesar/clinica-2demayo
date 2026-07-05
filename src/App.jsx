import React, { useState, useEffect, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import ErrorBoundary from "./components/comunes/ErrorBoundary.jsx";
import { QuoteCartProvider } from "./context/QuoteCartContext";
import { ThemeProvider } from "./context/ThemeContext";
import { hasPermiso, normalizePermisos } from "./config/recepcionPermisos";
import { APP_BASE_PATH, BASE_URL } from "./config/config";
import { authFetch } from "./utils/apiClient";
import DashboardLayout from "./components/dashboard/DashboardLayout";
import ModalAperturaCaja from "./components/caja/ModalAperturaCaja.jsx";
// Lazy loading para todos los componentes y páginas principales
const Login = lazy(() => import("./components/usuario/Login.jsx"));
const DashboardEstadisticasAdmin = lazy(() =>
  import("./pages/DashboardEstadisticasAdmin.jsx")
);
const ReabrirCajaPage = lazy(() =>
  import("./components/caja/ReabrirCajaPage.jsx")
);
const EgresosPage = lazy(() => import("./pages/EgresosPage.jsx"));
const RegistrarEgresoPage = lazy(() =>
  import("./pages/RegistrarEgresoPage.jsx")
);
const HistorialReaperturasPage = lazy(() =>
  import("./components/caja/HistorialReaperturasPage.jsx")
);
const LiquidacionHonorariosPage = lazy(() =>
  import("./pages/LiquidacionHonorariosPage.jsx")
);
const LiquidacionLaboratorioReferenciaPage = lazy(() =>
  import("./pages/LiquidacionLaboratorioReferenciaPage.jsx")
);
const ContabilidadPage = lazy(() => import("./pages/ContabilidadPage.jsx"));
const CerrarCajaView = lazy(() =>
  import("./components/caja/CerrarCajaView.jsx")
);
const Dashboard = lazy(() => import("./components/dashboard/Dashboard.jsx"));
const PacientesPage = lazy(() => import("./pages/PacientesPage.jsx"));
const UsuariosPage = lazy(() => import("./pages/UsuariosPage.jsx"));
const AgendarConsultaPage = lazy(() =>
  import("./pages/AgendarConsultaPage.jsx")
);
const MedicoConsultasPage = lazy(() =>
  import("./pages/MedicoConsultasPage.jsx")
);
const MedicosPage = lazy(() => import("./pages/MedicosPage.jsx"));
const PanelMedicoPage = lazy(() => import("./pages/PanelMedicoPage.jsx"));
const HistoriaClinicaPage = lazy(() =>
  import("./pages/HistoriaClinicaPage.jsx")
);
const EnfermeroPanelPage = lazy(() => import("./pages/EnfermeroPanelPage.jsx"));
const SolicitudLaboratorioPage = lazy(() =>
  import("./pages/SolicitudLaboratorioPage.jsx")
);
const ExamenesLaboratorioCrudPage = lazy(() =>
  import("./pages/ExamenesLaboratorioCrudPage.jsx")
);
const CotizarLaboratorioPage = lazy(() =>
  import("./pages/CotizarLaboratorioPage.jsx")
);
const CotizarRayosXPage = lazy(() => import("./pages/CotizarRayosXPage.jsx"));
const CotizarEcografiaPage = lazy(() =>
  import("./pages/CotizarEcografiaPage.jsx")
);
const CotizarOperacionPage = lazy(() =>
  import("./pages/CotizarOperacionPage.jsx")
);
const LaboratorioPanelPage = lazy(() =>
  import("./pages/LaboratorioPanelPage.jsx")
);
const LaboratorioCompararResultadosPage = lazy(() =>
  import("./pages/LaboratorioCompararResultadosPage.jsx")
);
const InventarioLaboratorioPage = lazy(() =>
  import("./pages/InventarioLaboratorioPage.jsx")
);
const InventarioGeneralPage = lazy(() =>
  import("./pages/InventarioGeneralPage.jsx")
);
const ResultadosLaboratorioPage = lazy(() =>
  import("./pages/ResultadosLaboratorioPage.jsx")
);
const ReportesPage = lazy(() => import("./pages/ReportesPage.jsx"));
const ListaConsultasPage = lazy(() => import("./pages/ListaConsultasPage.jsx"));
const RecordatoriosCitasPage = lazy(() => import("./pages/RecordatoriosCitasPage.jsx"));
const ReportePacientesPage = lazy(() =>
  import("./pages/ReportePacientesPage.jsx")
);
const ReporteFinanzasPage = lazy(() =>
  import("./pages/ReporteFinanzasPage.jsx")
);
const ConfiguracionPage = lazy(() => import("./pages/ConfiguracionPage.jsx"));
const PlantillasHCPage = lazy(() => import("./pages/PlantillasHCPage.jsx"));
const PlantillasImagenologiaPage = lazy(() => import("./pages/PlantillasImagenologiaPage.jsx"));
const TemaPage = lazy(() => import("./pages/TemaPage.jsx"));
const GestionTarifasPage = lazy(() => import("./pages/GestionTarifasPage.jsx"));
const PaquetesPerfilesPage = lazy(() => import("./pages/PaquetesPerfilesPage.jsx"));
const ProtectedRoute = lazy(() => import("./components/comunes/ProtectedRoute.jsx"));
const MedicamentosList = lazy(() => import("./farmacia/MedicamentosList.jsx"));
const FarmaciaCotizadorPage = lazy(() => import("./pages/FarmaciaCotizadorPage.jsx"));
const CotizarProcedimientosPage = lazy(() =>
  import("./pages/CotizarProcedimientosPage.jsx")
);
const CotizarPaquetesPerfilesPage = lazy(() =>
  import("./pages/CotizarPaquetesPerfilesPage.jsx")
);
const CotizarServicioPage = lazy(() =>
  import("./pages/CotizarServicioPage.jsx")
);
const ConsumoPacientePage = lazy(() =>
  import("./pages/ConsumoPacientePage.jsx")
);
const EstadoCuentaContratoPage = lazy(() =>
  import("./pages/EstadoCuentaContratoPage.jsx")
);
const FarmaciaVentasPage = lazy(() => import("./pages/FarmaciaVentasPage.jsx"));
const SeleccionarServicioPage = lazy(() =>
  import("./pages/SeleccionarServicioPage.jsx")
);
const DescuentosPage = lazy(() => import("./pages/DescuentosPage.jsx"));
const AuditoriaEliminacionesPage = lazy(() => import("./pages/AuditoriaEliminacionesPage.jsx"));
const WebServiciosCrudPage = lazy(() => import("./pages/WebServiciosCrudPage.jsx"));
const WebOfertasCrudPage = lazy(() => import("./pages/WebOfertasCrudPage.jsx"));
const WebBannersCrudPage = lazy(() => import("./pages/WebBannersCrudPage.jsx"));
const CotizacionesPage = lazy(() => import("./pages/CotizacionesPage.jsx"));
const DetalleCotizacionPage = lazy(() => import("./pages/DetalleCotizacionPage.jsx"));
const CobrarCotizacionPage = lazy(() => import("./pages/CobrarCotizacionPage.jsx"));
const MiFirmaProfesionalPage = lazy(() => import("./pages/MiFirmaProfesionalPage.jsx"));
const DocumentosPacientePage = lazy(() => import("./pages/DocumentosPacientePage.jsx"));
const OrdenesImagenPacientePage = lazy(() => import("./pages/OrdenesImagenPacientePage.jsx"));
const VisorImagenPage = lazy(() => import("./pages/VisorImagenPage.jsx"));
const SolicitudImagenPage = lazy(() => import("./pages/SolicitudImagenPage.jsx"));
const ContratosPage = lazy(() => import("./pages/ContratosPage.jsx"));
const ContinuidadClinicaPage = lazy(() =>
  import("./pages/ContinuidadClinicaPage.jsx")
);
const SuplenciaPacientesPage = lazy(() =>
  import("./pages/SuplenciaPacientesPage.jsx")
);

// Reinicia el ErrorBoundary en cada cambio de ruta para que errores de una
// página no persistan al navegar a otra (ej. presionar el botón Back).
function RouteErrorBoundary({ children }) {
  const location = useLocation();
  return <ErrorBoundary key={location.pathname}>{children}</ErrorBoundary>;
}

const ROUTER_BASENAME = APP_BASE_PATH.replace(/\/+$/, "") || "/";

async function fetchInfraDiagnosis(fallbackDetail = "") {
  const fallback = String(fallbackDetail || "").trim() || "No fue posible conectar con el backend";
  try {
    const r = await authFetch("api_health.php", { cache: "no-store" });
    const payload = await r.json().catch(() => null);
    const checks = payload?.checks && typeof payload.checks === "object" ? payload.checks : null;
    const statusCode = String(payload?.status_code || "").trim();

    if (checks?.db?.ok === false) {
      const message = String(checks?.db?.message || "Base de datos no disponible").trim();
      const detail = message || fallback;
      return { detail: statusCode ? `${detail} (${statusCode})` : detail, checks };
    }

    if (!r.ok) {
      const message = String(payload?.error || payload?.message || `HTTP ${r.status}`).trim();
      const detail = message || fallback;
      return { detail: statusCode ? `${detail} (${statusCode})` : detail, checks };
    }

    if (checks?.app?.ok === false) {
      const message = String(checks?.app?.message || "Backend no disponible").trim();
      const detail = message || fallback;
      return { detail: statusCode ? `${detail} (${statusCode})` : detail, checks };
    }

    return {
      detail: fallback,
      checks,
    };
  } catch {
    return {
      detail: fallback,
      checks: null,
    };
  }
}

function getSupportAdvice(code) {
  const normalized = String(code || "").trim().toUpperCase();
  switch (normalized) {
    case "DB_DOWN":
      return "Verificar servicio MySQL/MariaDB y credenciales activas de la instancia.";
    case "DB_INIT_FAILED":
      return "Revisar extensiones de PHP para MySQLi y configuracion de runtime (DB_HOST/DB_PORT).";
    case "UNHEALTHY":
      return "Confirmar conectividad backend->BD y revisar logs de PHP para detalles del fallo.";
    case "APP_DOWN":
      return "Validar que Apache/Nginx y PHP-FPM esten arriba y sin errores fatales.";
    case "APP_OK":
      return "Backend operativo; enfocar diagnostico en conectividad o disponibilidad de BD.";
    default:
      return "Reintentar y, si persiste, validar estado de backend, base de datos y red local.";
  }
}

function SistemaNoDisponible({ detail, checks, onRetry, onGoToLogin }) {
  const [copyState, setCopyState] = useState("idle");
  const host = String(window.location.hostname || "").toLowerCase();
  const isLocalHost = host === "localhost" || host === "127.0.0.1" || host === "::1";
  const publicUrl = isLocalHost
    ? `${window.location.protocol}//${host}:5174/`
    : `${window.location.origin}/`;
  const appCode = String(checks?.app?.code || "APP_UNKNOWN");
  const dbCode = String(checks?.db?.code || "DB_UNKNOWN");
  const [incidentId] = useState(() => {
    const safeApp = appCode.replace(/[^A-Z0-9_]/gi, "").slice(0, 8).toUpperCase() || "APPUNK";
    const safeDb = dbCode.replace(/[^A-Z0-9_]/gi, "").slice(0, 8).toUpperCase() || "DBUNK";
    const stamp = Date.now().toString(36).toUpperCase();
    return `INC-${safeApp}-${safeDb}-${stamp}`;
  });
  const supportAdvice = checks?.db?.ok === false
    ? getSupportAdvice(dbCode)
    : getSupportAdvice(appCode);

  const buildDiagnosticText = () => {
    const lines = [
      "Diagnostico de contingencia",
      `Incidencia: ${incidentId}`,
      `Fecha: ${new Date().toISOString()}`,
      `Host: ${window.location.host}`,
      `Detalle: ${String(detail || "Sin detalle")}`,
      `App code: ${appCode}`,
      `DB code: ${dbCode}`,
      `App ok: ${checks?.app?.ok === false ? "false" : "true"}`,
      `DB ok: ${checks?.db?.ok === false ? "false" : "true"}`,
      `Accion sugerida: ${supportAdvice}`,
    ];
    return lines.join("\n");
  };

  const copyDiagnostic = async () => {
    const payload = buildDiagnosticText();
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(payload);
        setCopyState("ok");
      } else {
        throw new Error("clipboard_api_unavailable");
      }
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = payload;
        ta.setAttribute("readonly", "");
        ta.style.position = "absolute";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        const copied = document.execCommand("copy");
        document.body.removeChild(ta);
        setCopyState(copied ? "ok" : "error");
      } catch {
        setCopyState("error");
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-100">
      <div className="w-full max-w-2xl bg-white border border-slate-200 shadow-lg rounded-2xl p-8">
        <h1 className="text-2xl font-bold text-slate-900">Sistema temporalmente no disponible</h1>
        <p className="mt-3 text-slate-700">
          Detectamos un problema de conectividad con el backend o la base de datos.
          Tu sesion no fue cerrada automaticamente.
        </p>
        {detail ? (
          <p className="mt-2 text-sm text-slate-500">Detalle tecnico: {detail}</p>
        ) : null}
        <p className="mt-1 text-xs text-slate-500">Incidencia: {incidentId}</p>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-lg border border-slate-200 p-3 bg-slate-50">
            <p className="text-xs uppercase tracking-wide text-slate-500">Estado app</p>
            <p className="text-sm font-semibold text-slate-800">
              {checks?.app?.ok === false ? "Error" : "Operativo"}
            </p>
            <p className="text-xs mt-1 text-slate-500">
              Codigo: {appCode}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 p-3 bg-slate-50">
            <p className="text-xs uppercase tracking-wide text-slate-500">Estado base de datos</p>
            <p className="text-sm font-semibold text-slate-800">
              {checks?.db?.ok === false ? "Sin conexion" : "Operativa"}
            </p>
            <p className="text-xs mt-1 text-slate-500">
              Codigo: {dbCode}
            </p>
          </div>
        </div>
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs uppercase tracking-wide text-amber-700">Accion sugerida</p>
          <p className="text-sm text-amber-900">{supportAdvice}</p>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onRetry}
            className="px-4 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition"
          >
            Reintentar conexion
          </button>
          <button
            type="button"
            onClick={onGoToLogin}
            className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 transition"
          >
            Ir a login
          </button>
          <a
            href={publicUrl}
            className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 transition"
          >
            Abrir portal publico
          </a>
          <button
            type="button"
            onClick={copyDiagnostic}
            className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 transition"
          >
            Copiar diagnostico
          </button>
        </div>
        {copyState === "ok" ? (
          <p className="mt-2 text-sm text-emerald-700">Diagnostico copiado al portapapeles.</p>
        ) : null}
        {copyState === "error" ? (
          <p className="mt-2 text-sm text-rose-700">No se pudo copiar automaticamente el diagnostico.</p>
        ) : null}
      </div>
    </div>
  );
}

function RequireCajaAbierta({ children }) {
  const location = useLocation();
  const [estado, setEstado] = useState({ loading: true, abierta: true });

  useEffect(() => {
    let activo = true;
    const verificar = async () => {
      try {
        const r = await authFetch("api_caja_estado.php", {
          cache: 'no-store',
        });
        const data = await r.json();
        const abierta = Boolean(data?.success) && String(data?.estado || '').toLowerCase() === 'abierta';
        if (activo) setEstado({ loading: false, abierta });
      } catch {
        // Fail-open para no romper flujo por un fallo temporal de red.
        if (activo) setEstado({ loading: false, abierta: true });
      }
    };
    verificar();
    return () => {
      activo = false;
    };
  }, [location.key]);

  if (estado.loading) {
    return <div className="p-8 text-center">Validando estado de caja...</div>;
  }

  if (!estado.abierta) {
    return <Navigate to="/contabilidad" replace />;
  }

  return children;
}

// Cache compartido para evitar re-verificar en cada navegación.
// TTL de 2 minutos: suficiente para no generar falsos positivos por errores transitorios.
const CAJA_CACHE_TTL_MS = 2 * 60 * 1000;
const cajaCache = { ts: 0, abierta: true };

function CajaAperturaGuard({ usuario }) {
  const location = useLocation();
  const navigate = useNavigate();
  // Inicializar loading:true para evitar el flash de modal antes del primer resultado.
  const [state, setState] = useState({ loading: true, cajaAbierta: true });

  const rol = String(usuario?.rol || "").toLowerCase();
  const aplicaBloqueo = rol === "administrador" || rol === "recepcionista";
  const pathname = String(location?.pathname || "/");

  const rutaPermitidaSinCaja =
    pathname === "/contabilidad" ||
    pathname === "/reabrir-caja";

  useEffect(() => {
    if (!aplicaBloqueo) {
      setState({ loading: false, cajaAbierta: true });
      return;
    }

    // Si el último resultado sigue vigente, usarlo directamente sin nueva llamada.
    const ahora = Date.now();
    if (ahora - cajaCache.ts < CAJA_CACHE_TTL_MS) {
      setState({ loading: false, cajaAbierta: cajaCache.abierta });
      return;
    }

    let activo = true;

    // Escuchar evento de apertura manual de caja para invalidar el cache inmediatamente.
    const onAperturaExterna = () => {
      cajaCache.ts = 0;
    };
    window.addEventListener("caja-apertura-realizada", onAperturaExterna);

    const verificar = async () => {
      try {
        const response = await authFetch("api_caja_verificar.php", { cache: "no-store" });
        const data = await response.json();
        const cajaAbierta = Boolean(data?.success && data?.caja_abierta);
        if (activo) {
          cajaCache.ts = Date.now();
          cajaCache.abierta = cajaAbierta;
          setState({ loading: false, cajaAbierta });
        }
      } catch {
        // Fail-open en error transitorio: no bloquear al usuario por un fallo de red.
        // Si la caja realmente está cerrada, el backend rechazará el cobro de todas formas.
        if (activo) {
          setState({ loading: false, cajaAbierta: true });
        }
      }
    };

    verificar();
    return () => {
      activo = false;
      window.removeEventListener("caja-apertura-realizada", onAperturaExterna);
    };
  }, [aplicaBloqueo, location.key]);

  if (!aplicaBloqueo) return null;

  const mostrarModal = !state.loading && !state.cajaAbierta && !rutaPermitidaSinCaja;
  if (!mostrarModal) return null;

  return (
    <ModalAperturaCaja
      open
      mensaje="¡Atención! No puedes realizar operaciones sin una caja activa."
      onIrReporteCaja={() => {
        // Invalidar cache para que al volver se re-verifique.
        cajaCache.ts = 0;
        navigate("/contabilidad");
      }}
    />
  );
}

function hydrateUsuario(rawUsuario) {
  if (!rawUsuario || typeof rawUsuario !== "object") return null;
  return {
    ...rawUsuario,
    permisos: normalizePermisos(rawUsuario.permisos || []),
  };
}

function App() {
  const clearClientSessionState = () => {
    sessionStorage.removeItem("usuario");
    sessionStorage.removeItem("medico");
    localStorage.removeItem("enfermero_panel_tab");
  };

  // Capturar si había sesión en sessionStorage ANTES del primer render.
  // Si estaba vacío el usuario debe hacer login manual; no auto-restaurar desde cookie PHP.
  const hadSessionOnMount = React.useRef(
    Boolean(sessionStorage.getItem("usuario") || sessionStorage.getItem("medico"))
  );

  const [usuario, setUsuario] = useState(() => {
    // Restaurar usuario o medico desde sessionStorage si existe
    const storedUsuario = sessionStorage.getItem("usuario");
    const storedMedico = sessionStorage.getItem("medico");
    if (storedUsuario) {
      try {
        return hydrateUsuario(JSON.parse(storedUsuario));
      } catch {
        return null;
      }
    }
    if (storedMedico) {
      try {
        return hydrateUsuario(JSON.parse(storedMedico));
      } catch {
        return null;
      }
    }
    return null;
  });

  const [authBootstrap, setAuthBootstrap] = useState(() => ({
    phase: hadSessionOnMount.current ? "checking" : "idle",
    detail: "",
    checks: null,
  }));
  const [authRetryNonce, setAuthRetryNonce] = useState(0);

  // Logout sin render intermedio para evitar parpadeo visual
  const handleLogout = () => {
    authFetch("api_logout.php", {
      method: "POST",
      keepalive: true,
    }).catch((err) => {
      console.error("Error al cerrar sesión en el backend:", err);
    });

    clearClientSessionState();
    window.location.replace(BASE_URL);
  };

  const goToLoginManual = () => {
    hadSessionOnMount.current = false;
    clearClientSessionState();
    setUsuario(null);
    setAuthBootstrap({ phase: "idle", detail: "", checks: null });
  };

  useEffect(() => {
    // Solo validar contra el backend si había una sesión activa en sessionStorage.
    // Si sessionStorage estaba vacío, el usuario debe ingresar manualmente sus credenciales.
    if (!hadSessionOnMount.current) {
      setAuthBootstrap((prev) => (prev.phase === "idle" ? prev : { phase: "idle", detail: "", checks: null }));
      return;
    }

    let activo = true;
    setAuthBootstrap({ phase: "checking", detail: "", checks: null });

    const validarSesionBackend = async () => {
      try {
        const r = await authFetch("api_auth_status.php", {
          cache: "no-store",
        });

        if (!r.ok) {
          if (r.status === 401 || r.status === 403) {
            if (activo) {
              clearClientSessionState();
              setUsuario(null);
              setAuthBootstrap({ phase: "idle", detail: "", checks: null });
            }
            return;
          }

          let errorDetail = `HTTP ${r.status}`;
          try {
            const dataErr = await r.json();
            if (dataErr?.error) {
              errorDetail = String(dataErr.error);
            }
          } catch {
            // keep fallback detail
          }

          if (activo) {
            const infra = await fetchInfraDiagnosis(errorDetail);
            if (!activo) return;
            setAuthBootstrap({ phase: "infra_error", detail: infra.detail, checks: infra.checks });
          }
          return;
        }

        const data = await r.json().catch(() => null);
        const autenticado = Boolean(data?.success) && Boolean(data?.authenticated);

        if (!autenticado && activo) {
          clearClientSessionState();
          setUsuario(null);
          setAuthBootstrap({ phase: "idle", detail: "", checks: null });
          return;
        }

        if (autenticado && activo && data?.usuario && typeof data.usuario === "object") {
          setUsuario(hydrateUsuario(data.usuario));
          setAuthBootstrap({ phase: "ok", detail: "", checks: null });
          return;
        }

        if (autenticado && activo) {
          const usuarioFromBackend = {
            id: data?.usuario_id ?? null,
            nombre: data?.nombre ?? "",
            rol: data?.rol ?? "",
            usuario: typeof data?.usuario === "string" ? data.usuario : "",
            permisos: Array.isArray(data?.permisos) ? data.permisos : [],
          };
          setUsuario(hydrateUsuario(usuarioFromBackend));
          setAuthBootstrap({ phase: "ok", detail: "", checks: null });
        }
      } catch {
        if (activo) {
          const infra = await fetchInfraDiagnosis("No fue posible conectar con el backend");
          if (!activo) return;
          setAuthBootstrap({
            phase: "infra_error",
            detail: infra.detail,
            checks: infra.checks,
          });
        }
      }
    };

    validarSesionBackend();
    return () => {
      activo = false;
    };
  }, [authRetryNonce]);

  useEffect(() => {
    // Si cambia el usuario, sincronizar sessionStorage
    if (usuario) {
      const payload = hydrateUsuario(usuario);
      if (usuario.rol === "medico") {
        sessionStorage.setItem("medico", JSON.stringify(payload));
        sessionStorage.removeItem("usuario");
      } else {
        sessionStorage.setItem("usuario", JSON.stringify(payload));
        sessionStorage.removeItem("medico");
      }
    }
  }, [usuario]);

  useEffect(() => {
    const handleUsuarioSessionUpdated = (event) => {
      const detail = event?.detail;
      if (detail && typeof detail === "object") {
        setUsuario(hydrateUsuario(detail));
        return;
      }

      // Fallback defensivo: recargar desde sessionStorage si no llega detail.
      try {
        const rawUsuario = sessionStorage.getItem("usuario");
        if (rawUsuario) {
          setUsuario(hydrateUsuario(JSON.parse(rawUsuario)));
        }
      } catch {
        // ignore
      }
    };

    window.addEventListener("usuario-session-updated", handleUsuarioSessionUpdated);
    return () => {
      window.removeEventListener("usuario-session-updated", handleUsuarioSessionUpdated);
    };
  }, []);

  const getHomeByRole = (rol) => {
    switch (rol) {
      case "medico":
        return "/mis-consultas";
      case "laboratorista":
        return "/panel-laboratorio";
      case "enfermero":
        return "/panel-enfermero";
      case "recepcionista":
        if (hasPermiso(usuario, "ver_pacientes")) return "/pacientes";
        if (hasPermiso(usuario, "ver_usuarios")) return "/usuarios";
        if (hasPermiso(usuario, "ver_medicos")) return "/medicos";
        if (hasPermiso(usuario, "ver_cotizaciones")) return "/cotizaciones";
        if (hasPermiso(usuario, "ver_contabilidad")) return "/contabilidad";
        if (hasPermiso(usuario, "ver_paquetes_perfiles")) return "/paquetes-perfiles";
        if (hasPermiso(usuario, "ver_contratos")) return "/contratos";
        if (hasPermiso(usuario, "ver_gestion_tarifas")) return "/gestion-tarifas";
        if (hasPermiso(usuario, "ver_reabrir_caja")) return "/reabrir-caja";
        if (hasPermiso(usuario, "ver_lista_consultas")) return "/lista-consultas";
        if (hasPermiso(usuario, "ver_recordatorios_citas")) return "/recordatorios-citas";
        if (hasPermiso(usuario, "ver_panel_enfermeria")) return "/panel-enfermero";
        if (hasPermiso(usuario, "ver_inventario_general")) return "/inventario-general";
        if (hasPermiso(usuario, "ver_inventario_laboratorio")) return "/laboratorio/inventario";
        if (hasPermiso(usuario, "ver_configuracion")) return "/configuracion";
        if (hasPermiso(usuario, "ver_plantillas_hc")) return "/configuracion/plantillas-hc";
        if (hasPermiso(usuario, "ver_tema")) return "/tema";
        if (hasPermiso(usuario, "ver_web_servicios")) return "/web-servicios";
        if (hasPermiso(usuario, "ver_web_ofertas")) return "/web-ofertas";
        if (hasPermiso(usuario, "ver_web_banners")) return "/web-banners";
        if (hasPermiso(usuario, "ver_panel_laboratorio")) return "/panel-laboratorio";
        if (hasPermiso(usuario, "ver_modulo_quimico")) return "/medicamentos";
        return "/";
      case "administrador":
        return "/usuarios";
      case "químico":
      case "quimico":
        return "/medicamentos";
      default:
        return "/";
    }
  };

  return (
    <ThemeProvider>
    <QuoteCartProvider>
      {authBootstrap.phase === "infra_error" ? (
        <SistemaNoDisponible
          detail={authBootstrap.detail}
          checks={authBootstrap.checks}
          onRetry={() => setAuthRetryNonce((prev) => prev + 1)}
          onGoToLogin={goToLoginManual}
        />
      ) : null}
      {authBootstrap.phase === "checking" ? (
        <div className="p-8 text-center">Validando sesion...</div>
      ) : null}
      {authBootstrap.phase === "infra_error" || authBootstrap.phase === "checking" ? null : (
      <BrowserRouter basename={ROUTER_BASENAME}>
        {usuario ? (
          <>
          <CajaAperturaGuard usuario={usuario} />
          <DashboardLayout usuario={usuario} onLogout={handleLogout}>
            <RouteErrorBoundary>
            {/* Suspense solo para el contenido de rutas: evita que desaparezca todo el layout */}
            <Suspense fallback={<div className="p-8 text-center">Cargando módulo...</div>}>
            <Routes>
              {/* Redirigir a médicos y laboratoristas que intenten acceder a '/' */}
              <Route
                path="/"
                element={
                  usuario?.rol === "medico" ? (
                    <Navigate to="/mis-consultas" replace />
                  ) : usuario?.rol === "laboratorista" ? (
                    <Navigate to="/panel-laboratorio" replace />
                  ) : usuario?.rol === "enfermero" ? (
                    <Navigate to="/panel-enfermero" replace />
                  ) : usuario?.rol === "químico" ||
                    usuario?.rol === "quimico" ? (
                    <Navigate to="/medicamentos" replace />
                  ) : (
                    <Dashboard usuario={usuario} />
                  )
                }
              />
              <Route
                path="/pacientes"
                element={
                  <ProtectedRoute
                    usuario={usuario}
                    rolesPermitidos={["administrador", "recepcionista"]}
                    permisosRequeridos={["ver_pacientes"]}
                  >
                    <PacientesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/usuarios"
                element={
                  <ProtectedRoute
                    usuario={usuario}
                    rolesPermitidos={["administrador", "recepcionista"]}
                    permisosRequeridos={["ver_usuarios"]}
                  >
                    <UsuariosPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/agendar-consulta"
                element={
                  <ProtectedRoute
                    usuario={usuario}
                    rolesPermitidos={["administrador", "recepcionista"]}
                    permisosRequeridos={["ver_pacientes"]}
                  >
                    <AgendarConsultaPage />
                  </ProtectedRoute>
                }
              />
              {/* Solo visible para médicos */}
              {usuario?.rol === "medico" && (
                <>
                  <Route
                    path="/mis-consultas"
                    element={
                      <ProtectedRoute
                        usuario={usuario}
                        rolesPermitidos={["medico"]}
                      >
                        <MedicoConsultasPage usuario={usuario} />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/panel-medico"
                    element={
                      <ProtectedRoute
                        usuario={usuario}
                        rolesPermitidos={["medico"]}
                      >
                        <PanelMedicoPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/historia-clinica/:pacienteId"
                    element={
                      <ProtectedRoute
                        usuario={usuario}
                        rolesPermitidos={["medico"]}
                      >
                        <HistoriaClinicaPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/historia-clinica/:pacienteId/:consultaId"
                    element={
                      <ProtectedRoute
                        usuario={usuario}
                        rolesPermitidos={["medico"]}
                      >
                        <HistoriaClinicaPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/solicitud-laboratorio/:consultaId"
                    element={
                      <ProtectedRoute
                        usuario={usuario}
                        rolesPermitidos={["medico"]}
                      >
                        <SolicitudLaboratorioPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/resultados-laboratorio/:consultaId"
                    element={
                      <ProtectedRoute
                        usuario={usuario}
                        rolesPermitidos={["medico"]}
                      >
                        <ResultadosLaboratorioPage />
                      </ProtectedRoute>
                    }
                  />
                  {/* Visor de imágenes diagnósticas — también accesible para médicos */}
                  <Route
                    path="/visor-imagen/:ordenId"
                    element={
                      <ProtectedRoute
                        usuario={usuario}
                        rolesPermitidos={["medico"]}
                      >
                        <VisorImagenPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/solicitud-imagen/:consultaId/:tipo"
                    element={
                      <ProtectedRoute
                        usuario={usuario}
                        rolesPermitidos={["medico"]}
                      >
                        <SolicitudImagenPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/suplencia-pacientes"
                    element={
                      <ProtectedRoute
                        usuario={usuario}
                        rolesPermitidos={["medico"]}
                      >
                        <SuplenciaPacientesPage />
                      </ProtectedRoute>
                    }
                  />
                </>
              )}
              {(usuario?.rol === "químico" || usuario?.rol === "quimico" || usuario?.rol === "recepcionista" || usuario?.rol === "administrador") && (
                <>
                  <Route
                    path="/medicamentos"
                    element={
                      <ProtectedRoute
                        usuario={usuario}
                        rolesPermitidos={["químico", "quimico", "recepcionista", "administrador"]}
                        permisosRequeridos={["ver_modulo_quimico"]}
                      >
                        <MedicamentosList />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/farmacia/cotizador"
                    element={
                      <ProtectedRoute
                        usuario={usuario}
                        rolesPermitidos={["químico", "quimico", "recepcionista", "administrador"]}
                        permisosRequeridos={["ver_modulo_quimico"]}
                      >
                        <FarmaciaCotizadorPage usuario={usuario} />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/farmacia/ventas"
                    element={
                      <ProtectedRoute
                        usuario={usuario}
                        rolesPermitidos={["químico", "quimico", "recepcionista", "administrador"]}
                        permisosRequeridos={["ver_modulo_quimico"]}
                      >
                        <FarmaciaVentasPage />
                      </ProtectedRoute>
                    }
                  />
                </>
              )}
              {/* Visible para enfermería, admin y recepción */}
              {(usuario?.rol === "enfermero" ||
                usuario?.rol === "administrador" ||
                usuario?.rol === "recepcionista") && (
                <Route
                  path="/panel-enfermero"
                  element={
                    <ProtectedRoute
                      usuario={usuario}
                      rolesPermitidos={["enfermero", "administrador", "recepcionista"]}
                      permisosRequeridos={["ver_panel_enfermeria"]}
                    >
                      <EnfermeroPanelPage />
                    </ProtectedRoute>
                  }
                />
              )}
              {/* Solo visible para administradores y recepcionistas */}
              {(usuario?.rol === "administrador" ||
                usuario?.rol === "recepcionista") && (
                <>
                  <Route
                    path="/admin/dashboard-estadisticas"
                    element={
                      <ProtectedRoute
                        usuario={usuario}
                        rolesPermitidos={["administrador"]}
                      >
                        <DashboardEstadisticasAdmin />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/continuidad-clinica"
                    element={
                      <ProtectedRoute
                        usuario={usuario}
                        rolesPermitidos={["administrador"]}
                      >
                        <ContinuidadClinicaPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/medicos"
                    element={
                      <ProtectedRoute
                        usuario={usuario}
                        rolesPermitidos={["administrador", "recepcionista"]}
                        permisosRequeridos={["ver_medicos"]}
                      >
                        <MedicosPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/medicos/:medicoId/disponibilidad"
                    element={
                      <ProtectedRoute
                        usuario={usuario}
                        rolesPermitidos={["administrador", "recepcionista"]}
                        permisosRequeridos={["ver_medicos"]}
                      >
                        <PanelMedicoPage />
                      </ProtectedRoute>
                    }
                  />
                  {
                    <Route
                      path="/contabilidad"
                      element={
                        <ProtectedRoute
                          usuario={usuario}
                          rolesPermitidos={["administrador", "recepcionista"]}
                          permisosRequeridos={["ver_contabilidad"]}
                        >
                          <ContabilidadPage />
                        </ProtectedRoute>
                      }
                    />
                  }

                  <Route
                    path="/lista-consultas"
                    element={
                      <ProtectedRoute
                        usuario={usuario}
                        rolesPermitidos={["administrador", "recepcionista"]}
                        permisosRequeridos={["ver_lista_consultas"]}
                      >
                        <ListaConsultasPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/recordatorios-citas"
                    element={
                      <ProtectedRoute
                        usuario={usuario}
                        rolesPermitidos={["administrador", "recepcionista"]}
                        permisosRequeridos={["ver_recordatorios_citas"]}
                      >
                        <RecordatoriosCitasPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/reporte-pacientes"
                    element={
                      <ProtectedRoute
                        usuario={usuario}
                        rolesPermitidos={["administrador", "recepcionista"]}
                        permisosRequeridos={["ver_contabilidad"]}
                      >
                        <ReportePacientesPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/reporte-finanzas"
                    element={
                      <ProtectedRoute
                        usuario={usuario}
                        rolesPermitidos={["administrador", "recepcionista"]}
                        permisosRequeridos={["ver_contabilidad"]}
                      >
                        <ReporteFinanzasPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/configuracion"
                    element={
                      <ProtectedRoute
                        usuario={usuario}
                        rolesPermitidos={["administrador", "recepcionista"]}
                        permisosRequeridos={["ver_configuracion"]}
                      >
                        <ConfiguracionPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/configuracion/plantillas-hc"
                    element={
                      <ProtectedRoute
                        usuario={usuario}
                        rolesPermitidos={["administrador", "recepcionista"]}
                        permisosRequeridos={["ver_plantillas_hc"]}
                      >
                        <PlantillasHCPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/configuracion/plantillas-imagen"
                    element={
                      <ProtectedRoute
                        usuario={usuario}
                        rolesPermitidos={["administrador"]}
                        permisosRequeridos={["ver_plantillas_imagen"]}
                      >
                        <PlantillasImagenologiaPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/tema"
                    element={
                      <ProtectedRoute
                        usuario={usuario}
                        rolesPermitidos={["administrador", "recepcionista"]}
                        permisosRequeridos={["ver_tema"]}
                      >
                        <TemaPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/gestion-tarifas"
                    element={
                      <ProtectedRoute
                        usuario={usuario}
                        rolesPermitidos={["administrador", "recepcionista"]}
                        permisosRequeridos={["ver_gestion_tarifas"]}
                      >
                        <GestionTarifasPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/paquetes-perfiles"
                    element={
                      <ProtectedRoute
                        usuario={usuario}
                        rolesPermitidos={["administrador", "recepcionista"]}
                        permisosRequeridos={["ver_paquetes_perfiles"]}
                      >
                        <PaquetesPerfilesPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/inventario-general"
                    element={
                      <ProtectedRoute
                        usuario={usuario}
                        rolesPermitidos={["administrador", "recepcionista"]}
                        permisosRequeridos={["ver_inventario_general"]}
                      >
                        <InventarioGeneralPage />
                      </ProtectedRoute>
                    }
                  />

                  <Route
                    path="/web-servicios"
                    element={
                      <ProtectedRoute usuario={usuario} rolesPermitidos={["administrador", "recepcionista"]} permisosRequeridos={["ver_web_servicios"]}>
                        <WebServiciosCrudPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/web-ofertas"
                    element={
                      <ProtectedRoute usuario={usuario} rolesPermitidos={["administrador", "recepcionista"]} permisosRequeridos={["ver_web_ofertas"]}>
                        <WebOfertasCrudPage />
                      </ProtectedRoute>
                    }
                  />

                  <Route
                    path="/web-banners"
                    element={
                      <ProtectedRoute usuario={usuario} rolesPermitidos={["administrador", "recepcionista"]} permisosRequeridos={["ver_web_banners"]}>
                        <WebBannersCrudPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/contabilidad/liquidacion-honorarios"
                    element={
                      <ProtectedRoute
                        usuario={usuario}
                        rolesPermitidos={["administrador", "recepcionista"]}
                        permisosRequeridos={["ver_contabilidad"]}
                      >
                        <LiquidacionHonorariosPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/contabilidad/liquidacion-laboratorio-referencia"
                    element={
                      <ProtectedRoute
                        usuario={usuario}
                        rolesPermitidos={["administrador", "recepcionista"]}
                        permisosRequeridos={["ver_contabilidad"]}
                      >
                        <LiquidacionLaboratorioReferenciaPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/cotizar-laboratorio/:pacienteId"
                    element={
                      <ProtectedRoute
                        usuario={usuario}
                        rolesPermitidos={["administrador", "recepcionista"]}
                        permisosRequeridos={["ver_cotizaciones"]}
                      >
                        <CotizarLaboratorioPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/cotizar-rayosx/:pacienteId"
                    element={
                      <ProtectedRoute
                        usuario={usuario}
                        rolesPermitidos={["administrador", "recepcionista"]}
                        permisosRequeridos={["ver_cotizaciones"]}
                      >
                        <CotizarRayosXPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/cotizar-ecografia/:pacienteId"
                    element={
                      <ProtectedRoute
                        usuario={usuario}
                        rolesPermitidos={["administrador", "recepcionista"]}
                        permisosRequeridos={["ver_cotizaciones"]}
                      >
                        <CotizarEcografiaPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/cotizar-operacion/:pacienteId"
                    element={
                      <ProtectedRoute
                        usuario={usuario}
                        rolesPermitidos={["administrador", "recepcionista"]}
                        permisosRequeridos={["ver_cotizaciones"]}
                      >
                        <CotizarOperacionPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/cotizar-farmacia/:pacienteId"
                    element={
                      <ProtectedRoute
                        usuario={usuario}
                        rolesPermitidos={["administrador", "recepcionista"]}
                        permisosRequeridos={["ver_cotizaciones"]}
                      >
                        <FarmaciaCotizadorPage usuario={usuario} />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/cotizar-procedimientos/:pacienteId"
                    element={
                      <ProtectedRoute
                        usuario={usuario}
                        rolesPermitidos={["administrador", "recepcionista"]}
                        permisosRequeridos={["ver_cotizaciones"]}
                      >
                        <CotizarProcedimientosPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/cotizar-paquetes-perfiles/:pacienteId"
                    element={
                      <ProtectedRoute
                        usuario={usuario}
                        rolesPermitidos={["administrador", "recepcionista"]}
                        permisosRequeridos={["ver_cotizaciones"]}
                      >
                        <CotizarPaquetesPerfilesPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/cotizar-servicio/:pacienteId/:servicioTipo"
                    element={
                      <ProtectedRoute
                        usuario={usuario}
                        rolesPermitidos={["administrador", "recepcionista"]}
                        permisosRequeridos={["ver_cotizaciones"]}
                      >
                        <CotizarServicioPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/seleccionar-servicio"
                    element={
                      <ProtectedRoute
                        usuario={usuario}
                        rolesPermitidos={["administrador", "recepcionista"]}
                        permisosRequeridos={["ver_cotizaciones"]}
                      >
                        <SeleccionarServicioPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/consumo-paciente/:pacienteId"
                    element={
                      <ProtectedRoute
                        usuario={usuario}
                        rolesPermitidos={["administrador", "recepcionista"]}
                        permisosRequeridos={["ver_cotizaciones"]}
                      >
                        <ConsumoPacientePage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/estado-cuenta/:pacienteId"
                    element={
                      <ProtectedRoute
                        usuario={usuario}
                        rolesPermitidos={["administrador", "recepcionista"]}
                        permisosRequeridos={["ver_cotizaciones"]}
                      >
                        <EstadoCuentaContratoPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/historia-clinica-lectura/:pacienteId/:consultaId"
                    element={
                      <ProtectedRoute
                        usuario={usuario}
                        rolesPermitidos={["administrador", "recepcionista"]}
                        permisosRequeridos={["ver_pacientes"]}
                      >
                        <HistoriaClinicaPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/cotizaciones"
                    element={
                      <ProtectedRoute
                        usuario={usuario}
                        rolesPermitidos={["administrador", "recepcionista"]}
                        permisosRequeridos={["ver_cotizaciones"]}
                      >
                        <CotizacionesPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/contratos"
                    element={
                      <ProtectedRoute
                        usuario={usuario}
                        rolesPermitidos={["administrador", "recepcionista"]}
                        permisosRequeridos={["ver_contratos"]}
                      >
                        <ContratosPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/cotizaciones/:cotizacionId/detalle"
                    element={
                      <ProtectedRoute
                        usuario={usuario}
                        rolesPermitidos={["administrador", "recepcionista"]}
                        permisosRequeridos={["ver_cotizaciones"]}
                      >
                        <DetalleCotizacionPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/cobrar-cotizacion/:cotizacionId"
                    element={
                      <ProtectedRoute
                        usuario={usuario}
                        rolesPermitidos={["administrador", "recepcionista"]}
                        permisosRequeridos={["ver_cotizaciones"]}
                      >
                        <CobrarCotizacionPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/contabilidad/egresos"
                    element={
                      <ProtectedRoute
                        usuario={usuario}
                        rolesPermitidos={["administrador", "recepcionista"]}
                        permisosRequeridos={["ver_contabilidad"]}
                      >
                        <EgresosPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/contabilidad/registrar-egreso"
                    element={
                      <ProtectedRoute
                        usuario={usuario}
                        rolesPermitidos={["administrador", "recepcionista"]}
                        permisosRequeridos={["ver_contabilidad"]}
                      >
                        <RegistrarEgresoPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/contabilidad/cerrar-caja"
                    element={
                      <ProtectedRoute
                        usuario={usuario}
                        rolesPermitidos={["administrador", "recepcionista"]}
                        permisosRequeridos={["ver_contabilidad"]}
                      >
                        <RequireCajaAbierta>
                          <CerrarCajaView />
                        </RequireCajaAbierta>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/reabrir-caja"
                    element={
                      <ProtectedRoute
                        usuario={usuario}
                        rolesPermitidos={["administrador", "recepcionista"]}
                        permisosRequeridos={["ver_reabrir_caja"]}
                      >
                        <ReabrirCajaPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/historial-reaperturas"
                    element={
                      <ProtectedRoute
                        usuario={usuario}
                        rolesPermitidos={["administrador"]}
                      >
                        <HistorialReaperturasPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/contabilidad/descuentos"
                    element={
                      <ProtectedRoute
                        usuario={usuario}
                        rolesPermitidos={["administrador", "recepcionista"]}
                        permisosRequeridos={["ver_contabilidad"]}
                      >
                        <DescuentosPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/contabilidad/auditoria-eliminaciones"
                    element={
                      <ProtectedRoute
                        usuario={usuario}
                        rolesPermitidos={["administrador", "recepcionista"]}
                        permisosRequeridos={["ver_contabilidad"]}
                      >
                        <AuditoriaEliminacionesPage />
                      </ProtectedRoute>
                    }
                  />
                </>
              )}
              {/* Visible para admin, recepcionista y laboratorista */}
              <Route
                path="/documentos-paciente/:pacienteId"
                element={
                  <ProtectedRoute
                    usuario={usuario}
                    rolesPermitidos={["administrador", "recepcionista", "laboratorista"]}
                    permisosRequeridos={["ver_panel_laboratorio"]}
                  >
                    <DocumentosPacientePage usuario={usuario} />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/imagenes-paciente/:pacienteId"
                element={
                  <ProtectedRoute
                    usuario={usuario}
                    rolesPermitidos={["administrador", "recepcionista", "laboratorista"]}
                    permisosRequeridos={["ver_panel_laboratorio"]}
                  >
                    <OrdenesImagenPacientePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/visor-imagen/:ordenId"
                element={
                  <ProtectedRoute
                    usuario={usuario}
                    rolesPermitidos={["administrador", "recepcionista", "laboratorista"]}
                    permisosRequeridos={["ver_panel_laboratorio"]}
                  >
                    <VisorImagenPage />
                  </ProtectedRoute>
                }
              />
              {/* Visible para admin, recepcionista y laboratorista */}
              {(usuario?.rol === "administrador" || usuario?.rol === "recepcionista" || usuario?.rol === "laboratorista") && (
                <Route
                  path="/panel-laboratorio"
                  element={
                    <ProtectedRoute
                      usuario={usuario}
                      rolesPermitidos={["administrador", "recepcionista", "laboratorista"]}
                      permisosRequeridos={["ver_panel_laboratorio"]}
                    >
                      <LaboratorioPanelPage />
                    </ProtectedRoute>
                  }
                />
              )}
              {/* Solo visible para laboratoristas */}
              {usuario?.rol === "laboratorista" && (
                <>
                  <Route
                    path="/examenes-laboratorio"
                    element={
                      <ProtectedRoute
                        usuario={usuario}
                        rolesPermitidos={["laboratorista"]}
                      >
                        <ExamenesLaboratorioCrudPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/laboratorio/comparar-resultados/:pacienteId"
                    element={
                      <ProtectedRoute
                        usuario={usuario}
                        rolesPermitidos={["laboratorista"]}
                      >
                        <LaboratorioCompararResultadosPage />
                      </ProtectedRoute>
                    }
                  />
                </>
              )}
              {(usuario?.rol === "administrador" || usuario?.rol === "laboratorista" || usuario?.rol === "recepcionista") && (
                <Route
                  path="/laboratorio/inventario"
                  element={
                    <ProtectedRoute
                      usuario={usuario}
                      rolesPermitidos={["administrador", "laboratorista", "recepcionista"]}
                      permisosRequeridos={["ver_inventario_laboratorio"]}
                    >
                      <InventarioLaboratorioPage />
                    </ProtectedRoute>
                  }
                />
              )}
              {usuario && (
                <Route
                  path="/mi-firma-profesional"
                  element={
                    <ProtectedRoute
                      usuario={usuario}
                      rolesPermitidos={["administrador", "recepcionista", "enfermero", "laboratorista", "químico", "quimico"]}
                    >
                      <MiFirmaProfesionalPage />
                    </ProtectedRoute>
                  }
                />
              )}
              <Route path="*" element={<Navigate to={getHomeByRole(usuario?.rol)} replace />} />
              {/* Puedes agregar más rutas aquí */}
            </Routes>
            </Suspense>
            </RouteErrorBoundary>
          </DashboardLayout>
          </>
        ) : (
          <Suspense fallback={<div className="p-8 text-center">Cargando módulo...</div>}>
            <Login onLogin={setUsuario} />
          </Suspense>
        )}
    </BrowserRouter>
      )}
    </QuoteCartProvider>
    </ThemeProvider>
  );
}

export default App;
