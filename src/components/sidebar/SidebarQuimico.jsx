import { Link } from "react-router-dom";

export default function SidebarQuimico({ onClose }) {
  return (
    <>
      <Link to="/medicamentos" className="py-2 px-3 rounded-lg text-pink-700 hover:bg-pink-100 font-medium" onClick={onClose}>
        Medicamentos
      </Link>
      <Link to="/farmacia/cotizador" className="py-2 px-3 rounded-lg text-blue-700 hover:bg-blue-100 font-medium" onClick={onClose}>
        Cotizador Farmacia
      </Link>
      <Link to="/farmacia/ventas" className="py-2 px-3 rounded-lg text-green-700 hover:bg-green-100 font-medium" onClick={onClose}>
        Ventas de Farmacia
      </Link>
    </>
  );
}