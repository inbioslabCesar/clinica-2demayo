import { Link } from "react-router-dom";

export default function SidebarEnfermero({ onClose }) {
  const itemStyle = {
    color: "var(--color-secondary)",
  };

  return (
    <>
      <Link to="/panel-enfermero" className="py-2 px-3 rounded-lg hover:bg-white/70 font-medium" style={itemStyle} onClick={onClose}>
        Panel Enfermería
      </Link>
      <Link to="/mi-firma-profesional" className="py-2 px-3 rounded-lg hover:bg-white/70 font-medium" style={itemStyle} onClick={onClose}>
        Mi Firma Profesional
      </Link>
    </>
  );
}