import { Link } from "react-router-dom";

export default function SidebarQuimico({ onClose }) {
  const itemStyle = {
    color: "var(--color-secondary)",
  };

  return (
    <>
      <Link to="/medicamentos" className="py-2 px-3 rounded-lg hover:bg-white/70 font-medium" style={itemStyle} onClick={onClose}>
        Medicamentos
      </Link>
      <Link to="/farmacia/cotizador" className="py-2 px-3 rounded-lg hover:bg-white/70 font-medium" style={itemStyle} onClick={onClose}>
        Cotizador Farmacia
      </Link>
      <Link to="/farmacia/ventas" className="py-2 px-3 rounded-lg hover:bg-white/70 font-medium" style={itemStyle} onClick={onClose}>
        Ventas de Farmacia
      </Link>
      <Link to="/mi-firma-profesional" className="py-2 px-3 rounded-lg hover:bg-white/70 font-medium" style={itemStyle} onClick={onClose}>
        Mi Firma Profesional
      </Link>
    </>
  );
}