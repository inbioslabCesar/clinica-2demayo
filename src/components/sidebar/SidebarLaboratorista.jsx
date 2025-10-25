import { Link } from "react-router-dom";

export default function SidebarLaboratorista({ onClose }) {
  return (
    <>
      <Link to="/panel-laboratorio" className="py-2 px-3 rounded-lg text-green-700 hover:bg-green-100 font-medium" onClick={onClose}>
        Panel Laboratorio
      </Link>
      <Link to="/examenes-laboratorio" className="py-2 px-3 rounded-lg text-green-700 hover:bg-green-100 font-medium" onClick={onClose}>
        Gestión de Exámenes
      </Link>
    </>
  );
}