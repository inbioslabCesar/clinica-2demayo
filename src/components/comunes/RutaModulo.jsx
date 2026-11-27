import { Navigate } from "react-router-dom";
import { ACCESO_MODULO, resolverAccesoModulo } from "../../utils/rutaModulo";

/**
 * Protege una ruta que solo existe si la instalación tiene el módulo activo.
 * Recibe el estado de useModulos (el que ya consulta App) para no repetir la llamada; combínelo con ProtectedRoute para el rol:
 *   <ProtectedRoute ...><RutaModulo modulo="seguimiento_clinico" modulos={modulos} cargando={cargando} redirigirA="/mis-consultas">...</RutaModulo></ProtectedRoute>
 */
export default function RutaModulo({ modulo, modulos, cargando = false, redirigirA = "/", children }) {
  const acceso = resolverAccesoModulo({ modulo, modulos, cargando });
  if (acceso === ACCESO_MODULO.CARGANDO) {
    return <div className="p-8 text-center">Cargando módulo...</div>;
  }
  if (acceso === ACCESO_MODULO.DENEGADO) {
    return <Navigate to={redirigirA} replace />;
  }
  return children;
}
