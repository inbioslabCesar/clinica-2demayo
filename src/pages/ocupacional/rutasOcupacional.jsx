import { createElement, lazy } from "react";
import { Route } from "react-router-dom";
import ProtectedRoute from "../../components/comunes/ProtectedRoute";

const EmpresasOcupacionalesPage = lazy(() => import("./EmpresasOcupacionalesPage.jsx"));
const TrabajadoresOcupacionalesPage = lazy(() => import("./TrabajadoresOcupacionalesPage.jsx"));
const CatalogosLaboralesEmpresaPage = lazy(() => import("./CatalogosLaboralesEmpresaPage.jsx"));
const ExamenesOcupacionalesPage = lazy(() => import("./ExamenesOcupacionalesPage.jsx"));
const TiposEvaluacionOcupacionalesPage = lazy(() => import("./TiposEvaluacionOcupacionalesPage.jsx"));
const GruposExamenesOcupacionalesPage = lazy(() => import("./GruposExamenesOcupacionalesPage.jsx"));
const CatalogoEmpresaExamenesPage = lazy(() => import("./CatalogoEmpresaExamenesPage.jsx"));
const ProtocolosOcupacionalesPage = lazy(() => import("./ProtocolosOcupacionalesPage.jsx"));
const OrdenesOcupacionalesPage = lazy(() => import("./OrdenesOcupacionalesPage.jsx"));
const EvaluacionMedicaOcupacionalPage = lazy(() => import("./EvaluacionMedicaOcupacionalPage.jsx"));
const FormatoClinicoExamenPage = lazy(() => import("./FormatoClinicoExamenPage.jsx"));

const GESTION = "gestionar_empresas_ocupacional";
const REGISTRO = "registrar_trabajadores_ocupacional";

const RUTAS = [
  ["empresas", GESTION, EmpresasOcupacionalesPage],
  ["trabajadores", REGISTRO, TrabajadoresOcupacionalesPage],
  ["catalogos-laborales", GESTION, CatalogosLaboralesEmpresaPage],
  ["examenes-generales", GESTION, ExamenesOcupacionalesPage],
  ["tipos-evaluacion", GESTION, TiposEvaluacionOcupacionalesPage],
  ["grupos-examenes", GESTION, GruposExamenesOcupacionalesPage],
  ["catalogo-examenes", GESTION, CatalogoEmpresaExamenesPage],
  ["protocolos", GESTION, ProtocolosOcupacionalesPage],
  ["ordenes", REGISTRO, OrdenesOcupacionalesPage],
  ["evaluacion-medica", REGISTRO, EvaluacionMedicaOcupacionalPage],
  ["evaluacion-medica/:ordenId/examen/:detalleId", REGISTRO, FormatoClinicoExamenPage],
];

// Cada ruta exige el permiso de acceso Y el específico (ProtectedRoute acepta cualquiera de la lista, por eso van anidados).
// El backend vuelve a validar todo; esto solo evita mostrar pantallas que no corresponden.
function elementoProtegido(usuario, permiso, pagina) {
  const roles = ["administrador", "recepcionista"];
  return (
    <ProtectedRoute usuario={usuario} rolesPermitidos={roles} permisosRequeridos={["access_salud_ocupacional"]}>
      <ProtectedRoute usuario={usuario} rolesPermitidos={roles} permisosRequeridos={[permiso]}>
        {pagina}
      </ProtectedRoute>
    </ProtectedRoute>
  );
}

// Se llama como función dentro de <Routes> (no como componente) y solo cuando el módulo 'ocupacional' está activo.
export function rutasOcupacional(usuario) {
  return RUTAS.map(([ruta, permiso, Pagina]) => (
    <Route
      key={ruta}
      path={`/salud-ocupacional/${ruta}`}
      element={elementoProtegido(usuario, permiso, createElement(Pagina))}
    />
  ));
}
