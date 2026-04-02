import { Link } from "react-router-dom";
import { Icon } from '@fluentui/react';

export default function SidebarMedico({ onClose }) {
  const itemStyle = {
    color: "var(--color-secondary)",
  };

  return (
    <>
      <Link to="/mis-consultas" className="py-2 px-3 rounded-lg hover:bg-white/70 font-medium flex items-center gap-2" style={itemStyle} onClick={onClose}>
        <Icon iconName="Contact" className="text-xl" />
        Mis Consultas
      </Link>
      <Link to="/panel-medico" className="py-2 px-3 rounded-lg hover:bg-white/70 font-medium flex items-center gap-2" style={itemStyle} onClick={onClose}>
        <Icon iconName="Calendar" className="text-xl" />
        Disponibilidad
      </Link>
    </>
  );
}