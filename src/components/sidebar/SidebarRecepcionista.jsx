import { Link } from "react-router-dom";
import { Icon } from "@fluentui/react";

export default function SidebarRecepcionista({ onClose }) {
  return (
    <>
      <Link
        to="/"
        className="group relative py-3 px-4 rounded-xl bg-gradient-to-r from-purple-600 via-purple-700 to-indigo-800 text-white font-semibold shadow-lg hover:shadow-xl transform hover:scale-[1.02] transition-all duration-300 flex items-center gap-3 overflow-hidden"
        onClick={onClose}
      >
        <Icon iconName="ViewDashboard" className="text-xl text-white" />
        <span className="relative z-10 text-lg">Dashboard</span>
      </Link>
      <Link
        to="/pacientes"
        className="py-3 px-4 rounded-lg text-cyan-700 hover:bg-gradient-to-r hover:from-cyan-50 hover:to-blue-100 font-medium flex items-center gap-3 transition-all duration-300 hover:shadow-md hover:scale-[1.01]"
        onClick={onClose}
      >
        <Icon iconName="People" className="text-xl text-cyan-600" />
        <span>Pacientes</span>
      </Link>
      <Link
        to="/contabilidad"
        className="py-3 px-4 rounded-lg text-violet-700 hover:bg-gradient-to-r hover:from-violet-50 hover:to-purple-100 font-medium flex items-center gap-3 transition-all duration-300 hover:shadow-md hover:scale-[1.01]"
        onClick={onClose}
      >
        <Icon iconName="BarChart4" className="text-xl text-violet-600" />
        <span>Reportes</span>
      </Link>
    </>
  );
}
