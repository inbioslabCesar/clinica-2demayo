import { Link } from "react-router-dom";
import { Icon } from '@fluentui/react';

export default function SidebarMedico({ onClose }) {
  const itemStyle = {
    color: "var(--color-secondary)",
  };

  return (
    <>
      <Link to="/dashboard-medico" className="py-2 px-3 rounded-lg hover:bg-white/70 font-medium flex items-center gap-2" style={itemStyle} onClick={onClose}>
        <Icon iconName="BIDashboard" className="text-xl" />
        Dashboard Médico
      </Link>
      <Link to="/mis-consultas" className="py-2 px-3 rounded-lg hover:bg-white/70 font-medium flex items-center gap-2" style={itemStyle} onClick={onClose}>
        <Icon iconName="Contact" className="text-xl" />
        Mis Consultas
      </Link>
      <Link to="/mis-informes-imagenologia" className="py-2 px-3 rounded-lg hover:bg-white/70 font-medium flex items-center gap-2" style={itemStyle} onClick={onClose}>
        <Icon iconName="DiagnosticDataBarTooltip" className="text-xl" />
        Informes Imagenología
      </Link>
      <Link to="/mis-procedimientos" className="py-2 px-3 rounded-lg hover:bg-white/70 font-medium flex items-center gap-2" style={itemStyle} onClick={onClose}>
        <Icon iconName="Processing" className="text-xl" />
        Mis Procedimientos
      </Link>
      <Link to="/panel-medico" className="py-2 px-3 rounded-lg hover:bg-white/70 font-medium flex items-center gap-2" style={itemStyle} onClick={onClose}>
        <Icon iconName="Calendar" className="text-xl" />
        Disponibilidad
      </Link>
    </>
  );
}