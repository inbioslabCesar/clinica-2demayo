import React, { useState, useEffect, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
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
const HistorialConsultasMedico = lazy(() =>
  import("./historia_clinica/HistorialConsultasMedico.jsx")
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
const ResultadosLaboratorioPage = lazy(() =>
  import("./pages/ResultadosLaboratorioPage.jsx")
);
const ReportesPage = lazy(() => import("./pages/ReportesPage.jsx"));
const ListaConsultasPage = lazy(() => import("./pages/ListaConsultasPage.jsx"));
const ReportePacientesPage = lazy(() =>
  import("./pages/ReportePacientesPage.jsx")
);
const ReporteFinanzasPage = lazy(() =>
  import("./pages/ReporteFinanzasPage.jsx")
);
const ConfiguracionPage = lazy(() => import("./pages/ConfiguracionPage.jsx"));
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

function App() {
  const [usuario, setUsuario] = useState(() => {
    // Restaurar usuario o medico desde sessionStorage si existe
    const storedUsuario = sessionStorage.getItem("usuario");
    const storedMedico = sessionStorage.getItem("medico");
    if (storedUsuario) return JSON.parse(storedUsuario);
    if (storedMedico) return JSON.parse(storedMedico);
    return null;
  });

  // Al hacer logout, limpiar sessionStorage y destruir sesión en backend
  const handleLogout = async () => {
    try {
      await fetch("/policlinico-2demayo/api_logout.php", {
        method: "POST",
        credentials: "include",
      });
    } catch (err) {
      console.error("Error al cerrar sesión en el backend:", err);
    }
    setUsuario(null);
    sessionStorage.removeItem("usuario");
    sessionStorage.removeItem("medico");
    window.location.href = "/";
  };

  useEffect(() => {
    // Si cambia el usuario, sincronizar sessionStorage
    if (usuario) {
      if (usuario.rol === "medico") {
        sessionStorage.setItem("medico", JSON.stringify(usuario));
        sessionStorage.removeItem("usuario");
      } else {
        sessionStorage.setItem("usuario", JSON.stringify(usuario));
        sessionStorage.removeItem("medico");
      }
    }
  }, [usuario]);

  return (
    <BrowserRouter>
      {/* Suspense envuelve todo el contenido para lazy loading global */}
      <Suspense fallback={<div className="p-8 text-center">Cargando módulo...</div>}>
        {usuario ? (
          <DashboardLayout usuario={usuario} onLogout={handleLogout}>
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
                    rolesPermitidos={["administrador"]}
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
                    path="/historial-consultas"
                    element={
                      <ProtectedRoute
                        usuario={usuario}
                        rolesPermitidos={["medico"]}
                      >
                        <HistorialConsultasMedico medicoId={usuario.id} />
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
                </>
              )}
              {(usuario?.rol === "químico" || usuario?.rol === "quimico") && (
                <>
                  <Route
                    path="/medicamentos"
                    element={
                      <ProtectedRoute
                        usuario={usuario}
                        rolesPermitidos={["químico", "quimico"]}
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
                        rolesPermitidos={["químico", "quimico"]}
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
                        rolesPermitidos={["químico", "quimico"]}
                      >
                        <FarmaciaVentasPage />
                      </ProtectedRoute>
                    }
                  />
                </>
              )}
              {/* Solo visible para enfermeros */}
              {usuario?.rol === "enfermero" && (
                <Route
                  path="/panel-enfermero"
                  element={
                    <ProtectedRoute
                      usuario={usuario}
                      rolesPermitidos={["enfermero"]}
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
                        rolesPermitidos={["administrador"]}
                      >
                        <MedicosPage />
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
                      >
                        <ListaConsultasPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/reporte-pacientes"
                    element={
                      <ProtectedRoute
                        usuario={usuario}
                        rolesPermitidos={["administrador", "recepcionista"]}
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
                        rolesPermitidos={["administrador"]}
                      >
                        <ConfiguracionPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/gestion-tarifas"
                    element={
                      <ProtectedRoute
                        usuario={usuario}
                        rolesPermitidos={["administrador"]}
                      >
                        <GestionTarifasPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/contabilidad/liquidacion-honorarios"
                    element={
                      <ProtectedRoute
                        usuario={usuario}
                        rolesPermitidos={["administrador", "recepcionista"]}
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
                      >
                        <ConsumoPacientePage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/contabilidad/egresos"
                    element={
                      <ProtectedRoute
                        usuario={usuario}
                        rolesPermitidos={["administrador", "recepcionista"]}
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
                        rolesPermitidos={["administrador"]}
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
                      >
                        <DescuentosPage />
                      </ProtectedRoute>
                    }
                  />
                </>
              )}
              {/* Solo visible para laboratoristas */}
              {usuario?.rol === "laboratorista" && (
                <>
                  <Route
                    path="/panel-laboratorio"
                    element={
                      <ProtectedRoute
                        usuario={usuario}
                        rolesPermitidos={["laboratorista"]}
                      >
                        <LaboratorioPanelPage />
                      </ProtectedRoute>
                    }
                  />
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
                </>
              )}
              {/* Solo visible para químicos */}
              {(usuario?.rol === "químico" || usuario?.rol === "quimico") && (
                <>
                  <Route
                    path="/medicamentos"
                    element={
                      <ProtectedRoute
                        usuario={usuario}
                        rolesPermitidos={["químico", "quimico"]}
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
                        rolesPermitidos={["químico", "quimico"]}
                      >
                        <FarmaciaCotizadorPage />
                      </ProtectedRoute>
                    }
                  />
                </>
              )}
              {/* Puedes agregar más rutas aquí */}
            </Routes>
          </DashboardLayout>
        ) : (
          <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-800 via-blue-500 to-green-400">
            <Login onLogin={setUsuario} />
          </div>
        )}
        {/* Puedes agregar más rutas aquí */}
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
