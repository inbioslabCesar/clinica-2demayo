import { Link } from "react-router-dom";

export default function SidebarEnfermero({ onClose }) {
  return (
    <Link to="/panel-enfermero" className="py-2 px-3 rounded-lg text-green-700 hover:bg-green-100 font-medium" onClick={onClose}>
      Panel Enfermería
    </Link>
  );
}