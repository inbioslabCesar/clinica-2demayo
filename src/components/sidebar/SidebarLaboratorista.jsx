import { Link } from "react-router-dom";

export default function SidebarLaboratorista({ onClose }) {
  const itemStyle = {
    color: "var(--color-secondary)",
  };

  return (
    <>
      <Link to="/panel-laboratorio" className="py-2 px-3 rounded-lg hover:bg-white/70 font-medium" style={itemStyle} onClick={onClose}>
        Panel Laboratorio
      </Link>
      <Link to="/examenes-laboratorio" className="py-2 px-3 rounded-lg hover:bg-white/70 font-medium" style={itemStyle} onClick={onClose}>
        Gestión de Exámenes
      </Link>
      <Link to="/laboratorio/inventario" className="py-2 px-3 rounded-lg hover:bg-white/70 font-medium" style={itemStyle} onClick={onClose}>
        Inventario Interno
      </Link>
      <Link to="/mi-firma-profesional" className="py-2 px-3 rounded-lg hover:bg-white/70 font-medium" style={itemStyle} onClick={onClose}>
        Firma y Logo
      </Link>
    </>
  );
}