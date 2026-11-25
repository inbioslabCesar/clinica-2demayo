import { Link } from "react-router-dom";
import { Icon } from "@fluentui/react";
import useModulos from "../../hooks/useModulos";

// Enlace "Portal del paciente" del menú: solo si la instalación tiene el módulo activo y el usuario el permiso.
// `can` es la función de permisos del menú.
export default function EnlacePortalPaciente({ can, onClose }) {
  const { tiene } = useModulos();
  if (!tiene("portal_pacientes") || !can("gestionar_portal_pacientes")) return null;
  return (
    <Link
      to="/portal-paciente"
      className="py-2.5 px-3 rounded-lg text-teal-700 hover:bg-gradient-to-r hover:from-teal-50 hover:to-cyan-100 font-medium flex items-center gap-3 transition-all duration-300"
      onClick={onClose}
    >
      <Icon iconName="Contact" className="text-lg text-teal-600" />
      <span>Portal del paciente</span>
    </Link>
  );
}
