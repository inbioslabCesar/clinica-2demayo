import { Navigate } from "react-router-dom";

// rolesPermitidos: array de strings con los roles permitidos para la ruta
const homeByRole = {
  administrador: "/usuarios",
  recepcionista: "/pacientes",
  enfermero: "/panel-enfermero",
  medico: "/mis-consultas",
  laboratorista: "/panel-laboratorio"
};

export default function ProtectedRoute({ usuario, rolesPermitidos, children }) {
  if (!usuario) {
    return <Navigate to="/" replace />;
  }
  if (rolesPermitidos && !rolesPermitidos.includes(usuario.rol)) {
    // Redirigir a la página principal de su rol
    const home = homeByRole[usuario.rol] || "/";
    return <Navigate to={home} replace />;
  }
  return children;
}
