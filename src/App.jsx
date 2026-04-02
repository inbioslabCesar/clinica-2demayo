import React, { useState, useEffect, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import ErrorBoundary from "./components/comunes/ErrorBoundary.jsx";
import { QuoteCartProvider } from "./context/QuoteCartContext";
import { ThemeProvider } from "./context/ThemeContext";
import { hasPermiso, normalizePermisos } from "./config/recepcionPermisos";
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
const DashboardLayout = lazy(() => import("./components/dashboard/DashboardLayout"));
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
const TemaPage = lazy(() => import("./pages/TemaPage.jsx"));
const GestionTarifasPage = lazy(() => import("./pages/GestionTarifasPage.jsx"));
const ProtectedRoute = lazy(() => import("./components/comunes/ProtectedRoute.jsx"));
const MedicamentosList = lazy(() => import("./farmacia/MedicamentosList.jsx"));
const FarmaciaCotizadorPage = lazy(() => import("./pages/FarmaciaCotizadorPage.jsx"));
const CotizarProcedimientosPage = lazy(() =>
  import("./pages/CotizarProcedimientosPage.jsx")
);
const ConsumoPacientePage = lazy(() =>
  import("./pages/ConsumoPacientePage.jsx")
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

// Reinicia el ErrorBoundary en cada cambio de ruta para que errores de una
// página no persistan al navegar a otra (ej. presionar el botón Back).
function RouteErrorBoundary({ children }) {
  const location = useLocation();
  return <ErrorBoundary key={location.pathname}>{children}</ErrorBoundary>;
}

function hydrateUsuario(rawUsuario) {
  if (!rawUsuario || typeof rawUsuario !== "object") return null;
  return {
    ...rawUsuario,
    permisos: normalizePermisos(rawUsuario.permisos || []),
  };
}

function App() {
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

  // Logout sin render intermedio para evitar parpadeo visual
  const handleLogout = () => {
    fetch("/policlinico-2demayo/api_logout.php", {
      method: "POST",
      credentials: "include",
      keepalive: true,
    }).catch((err) => {
      console.error("Error al cerrar sesión en el backend:", err);
    });

    sessionStorage.removeItem("usuario");
    sessionStorage.removeItem("medico");
    window.location.replace("/");
  };

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
        if (hasPermiso(usuario, "ver_medicos")) return "/medicos";
        if (hasPermiso(usuario, "ver_cotizaciones")) return "/cotizaciones";
        if (hasPermiso(usuario, "ver_contabilidad")) return "/contabilidad";
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
      <BrowserRouter>
        {/* Suspense envuelve todo el contenido para lazy loading global */}
        <Suspense fallback={<div className="p-8 text-center">Cargando módulo...</div>}>
          {usuario ? (
            <DashboardLayout usuario={usuario} onLogout={handleLogout}>
            <RouteErrorBoundary>
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
                </>
              )}
              {(usuario?.rol === "químico" || usuario?.rol === "quimico" || usuario?.rol === "recepcionista") && (
                <>
                  <Route
                    path="/medicamentos"
                    element={
                      <ProtectedRoute
                        usuario={usuario}
                        rolesPermitidos={["químico", "quimico", "recepcionista"]}
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
                        rolesPermitidos={["químico", "quimico", "recepcionista"]}
                        permisosRequeridos={["ver_modulo_quimico"]}
                      >
                        <FarmaciaCotizadorPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/farmacia/ventas"
                    element={
                      <ProtectedRoute
                        usuario={usuario}
                        rolesPermitidos={["químico", "quimico", "recepcionista"]}
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
                        <FarmaciaCotizadorPage />
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
                        <CerrarCajaView />
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
            </RouteErrorBoundary>
            </DashboardLayout>
          ) : (
            <Login onLogin={setUsuario} />
        )}
        {/* Puedes agregar más rutas aquí */}
      </Suspense>
    </BrowserRouter>
    </QuoteCartProvider>
    </ThemeProvider>
  );
}

export default App;
