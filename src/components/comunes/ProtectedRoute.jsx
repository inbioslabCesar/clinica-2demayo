import { Navigate } from "react-router-dom";
import { hasPermiso } from "../../config/recepcionPermisos";

// rolesPermitidos: array de strings con los roles permitidos para la ruta
const homeByRole = {
  administrador: "/usuarios",
  recepcionista: "/pacientes",
  enfermero: "/panel-enfermero",
  medico: "/mis-consultas",
  laboratorista: "/panel-laboratorio"
};

function normalizeRole(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export default function ProtectedRoute({ usuario, rolesPermitidos, permisosRequeridos = [], children }) {
  if (!usuario) {
    return <Navigate to="/" replace />;
  }
  const rolUsuario = normalizeRole(usuario.rol);
  const rolesNormalizados = Array.isArray(rolesPermitidos)
    ? rolesPermitidos.map((rol) => normalizeRole(rol))
    : [];

  if (rolesNormalizados.length > 0 && !rolesNormalizados.includes(rolUsuario)) {
    // Redirigir a la página principal de su rol
    const home = homeByRole[rolUsuario] || "/";
    return <Navigate to={home} replace />;
  }
  if (Array.isArray(permisosRequeridos) && permisosRequeridos.length > 0) {
    const tienePermiso = permisosRequeridos.some((permiso) => hasPermiso(usuario, permiso));
    if (!tienePermiso) {
      const home = homeByRole[rolUsuario] || "/";
      return <Navigate to={home} replace />;
    }
  }
  return children;
}
