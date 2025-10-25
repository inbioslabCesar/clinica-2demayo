import { Link } from "react-router-dom";
import { Icon } from '@fluentui/react';

export default function SidebarMedico({ onClose }) {
  return (
    <>
      <Link to="/mis-consultas" className="py-2 px-3 rounded-lg text-indigo-700 hover:bg-indigo-100 font-medium flex items-center gap-2" onClick={onClose}>
        <Icon iconName="Contact" className="text-xl" />
        Mis Consultas
      </Link>
      <Link to="/panel-medico" className="py-2 px-3 rounded-lg text-blue-700 hover:bg-blue-100 font-medium flex items-center gap-2" onClick={onClose}>
        <Icon iconName="Calendar" className="text-xl" />
        Disponibilidad
      </Link>
      <Link to="/historial-consultas" className="py-2 px-3 rounded-lg text-blue-700 hover:bg-blue-100 font-medium flex items-center gap-2" onClick={onClose}>
        <Icon iconName="History" className="text-xl" />
        Historial de consultas
      </Link>
    </>
  );
}