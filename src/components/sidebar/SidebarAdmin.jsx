import { Link } from "react-router-dom";
import { Icon } from "@fluentui/react";

export default function SidebarAdmin({ onClose }) {
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
        to="/usuarios"
        className="py-3 px-4 rounded-lg text-blue-700 hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-100 font-medium flex items-center gap-3 transition-all duration-300 hover:shadow-md hover:scale-[1.01]"
        onClick={onClose}
      >
        <Icon iconName="People" className="text-xl text-blue-600" />
        <span>Usuarios</span>
      </Link>
      <Link
        to="/medicos"
        className="py-3 px-4 rounded-lg text-emerald-700 hover:bg-gradient-to-r hover:from-emerald-50 hover:to-green-100 font-medium flex items-center gap-3 transition-all duration-300 hover:shadow-md hover:scale-[1.01]"
        onClick={onClose}
      >
        <Icon iconName="Health" className="text-xl text-emerald-600" />
        <span>Médicos</span>
      </Link>
      <Link
        to="/gestion-tarifas"
        className="py-3 px-4 rounded-lg text-amber-700 hover:bg-gradient-to-r hover:from-amber-50 hover:to-yellow-100 font-medium flex items-center gap-3 transition-all duration-300 hover:shadow-md hover:scale-[1.01]"
        onClick={onClose}
      >
        <Icon iconName="Money" className="text-xl text-amber-600" />
        <span>Gestión de Tarifas</span>
      </Link>
      <Link
        to="/contabilidad"
        className="py-3 px-4 rounded-lg text-violet-700 hover:bg-gradient-to-r hover:from-violet-50 hover:to-purple-100 font-medium flex items-center gap-3 transition-all duration-300 hover:shadow-md hover:scale-[1.01]"
        onClick={onClose}
      >
        <Icon iconName="BarChart4" className="text-xl text-violet-600" />
        <span>Reportes</span>
      </Link>
      <Link
        to="/configuracion"
        className="py-3 px-4 rounded-lg text-gray-700 hover:bg-gradient-to-r hover:from-gray-50 hover:to-slate-100 font-medium flex items-center gap-3 transition-all duration-300 hover:shadow-md hover:scale-[1.01]"
        onClick={onClose}
      >
        <Icon iconName="Settings" className="text-xl text-gray-600" />
        <span>Configuración</span>
      </Link>
      <Link
        to="/reabrir-caja"
        className="py-3 px-4 rounded-lg text-yellow-700 hover:bg-gradient-to-r hover:from-yellow-50 hover:to-yellow-100 font-medium flex items-center gap-3 transition-all duration-300 hover:shadow-md hover:scale-[1.01]"
        onClick={onClose}
      >
        <Icon iconName="Unlock" className="text-xl text-yellow-600" />
        <span>Reabrir Cajas</span>
      </Link>
    </>
  );
}
