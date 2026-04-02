import { Link } from "react-router-dom";
import { Icon } from "@fluentui/react";
import { hasPermiso } from "../../config/recepcionPermisos";

export default function SidebarRecepcionista({ onClose, usuario }) {
  return (
    <>
      <Link
        to="/"
        className="group relative py-3 px-4 rounded-xl text-white font-semibold shadow-lg hover:shadow-xl transform hover:scale-[1.02] transition-all duration-300 flex items-center gap-3 overflow-hidden"
        style={{ background: 'linear-gradient(to right, var(--color-sidebar-from), var(--color-sidebar-via), var(--color-sidebar-to))' }}
        onClick={onClose}
      >
        <Icon iconName="ViewDashboard" className="text-xl text-white" />
        <span className="relative z-10 text-lg">Dashboard</span>
      </Link>
      {hasPermiso(usuario, "ver_pacientes") && (
        <Link
          to="/pacientes"
          className="py-3 px-4 rounded-lg text-cyan-700 hover:bg-gradient-to-r hover:from-cyan-50 hover:to-blue-100 font-medium flex items-center gap-3 transition-all duration-300 hover:shadow-md hover:scale-[1.01]"
          onClick={onClose}
        >
          <Icon iconName="People" className="text-xl text-cyan-600" />
          <span>Pacientes</span>
        </Link>
      )}
      {hasPermiso(usuario, "ver_contabilidad") && (
        <Link
          to="/contabilidad"
          className="py-3 px-4 rounded-lg text-violet-700 hover:bg-gradient-to-r hover:from-violet-50 hover:to-purple-100 font-medium flex items-center gap-3 transition-all duration-300 hover:shadow-md hover:scale-[1.01]"
          onClick={onClose}
        >
          <Icon iconName="BarChart4" className="text-xl text-violet-600" />
          <span>Reportes</span>
        </Link>
      )}
      {hasPermiso(usuario, "ver_medicos") && (
        <Link
          to="/medicos"
          className="py-3 px-4 rounded-lg text-teal-700 hover:bg-gradient-to-r hover:from-teal-50 hover:to-cyan-100 font-medium flex items-center gap-3 transition-all duration-300 hover:shadow-md hover:scale-[1.01]"
          onClick={onClose}
        >
          <Icon iconName="Medical" className="text-xl text-teal-600" />
          <span>Medicos</span>
        </Link>
      )}
      {hasPermiso(usuario, "ver_panel_enfermeria") && (
        <Link
          to="/panel-enfermero"
          className="py-3 px-4 rounded-lg text-rose-700 hover:bg-gradient-to-r hover:from-rose-50 hover:to-pink-100 font-medium flex items-center gap-3 transition-all duration-300 hover:shadow-md hover:scale-[1.01]"
          onClick={onClose}
        >
          <Icon iconName="Heart" className="text-xl text-rose-600" />
          <span>Panel Enfermeria</span>
        </Link>
      )}
      {hasPermiso(usuario, "ver_panel_laboratorio") && (
        <Link
          to="/panel-laboratorio"
          className="py-3 px-4 rounded-lg text-purple-700 hover:bg-gradient-to-r hover:from-purple-50 hover:to-indigo-100 font-medium flex items-center gap-3 transition-all duration-300 hover:shadow-md hover:scale-[1.01]"
          onClick={onClose}
        >
          <Icon iconName="TestBeaker" className="text-xl text-purple-600" />
          <span>Panel Laboratorio</span>
        </Link>
      )}
      {hasPermiso(usuario, "ver_modulo_quimico") && (
        <Link
          to="/medicamentos"
          className="py-3 px-4 rounded-lg text-indigo-700 hover:bg-gradient-to-r hover:from-indigo-50 hover:to-blue-100 font-medium flex items-center gap-3 transition-all duration-300 hover:shadow-md hover:scale-[1.01]"
          onClick={onClose}
        >
          <Icon iconName="Pill" className="text-xl text-indigo-600" />
          <span>Modulo Quimico</span>
        </Link>
      )}
      {hasPermiso(usuario, "ver_cotizaciones") && (
        <Link
          to="/cotizaciones"
          className="py-3 px-4 rounded-lg text-fuchsia-700 hover:bg-gradient-to-r hover:from-fuchsia-50 hover:to-purple-100 font-medium flex items-center gap-3 transition-all duration-300 hover:shadow-md hover:scale-[1.01]"
          onClick={onClose}
        >
          <Icon iconName="Paste" className="text-xl text-fuchsia-600" />
          <span>Cotizaciones</span>
        </Link>
      )}
      {hasPermiso(usuario, "ver_usuarios") && (
        <Link
          to="/usuarios"
          className="py-3 px-4 rounded-lg text-blue-700 hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-100 font-medium flex items-center gap-3 transition-all duration-300 hover:shadow-md hover:scale-[1.01]"
          onClick={onClose}
        >
          <Icon iconName="People" className="text-xl text-blue-600" />
          <span>Usuarios</span>
        </Link>
      )}
      {hasPermiso(usuario, "ver_lista_consultas") && (
        <Link
          to="/lista-consultas"
          className="py-3 px-4 rounded-lg text-indigo-700 hover:bg-gradient-to-r hover:from-indigo-50 hover:to-blue-100 font-medium flex items-center gap-3 transition-all duration-300 hover:shadow-md hover:scale-[1.01]"
          onClick={onClose}
        >
          <Icon iconName="Calendar" className="text-xl text-indigo-600" />
          <span>Lista de Consultas</span>
        </Link>
      )}
      {hasPermiso(usuario, "ver_gestion_tarifas") && (
        <Link
          to="/gestion-tarifas"
          className="py-3 px-4 rounded-lg text-amber-700 hover:bg-gradient-to-r hover:from-amber-50 hover:to-yellow-100 font-medium flex items-center gap-3 transition-all duration-300 hover:shadow-md hover:scale-[1.01]"
          onClick={onClose}
        >
          <Icon iconName="Money" className="text-xl text-amber-600" />
          <span>Gestión de Tarifas</span>
        </Link>
      )}
      {hasPermiso(usuario, "ver_inventario_general") && (
        <Link
          to="/inventario-general"
          className="py-3 px-4 rounded-lg text-emerald-700 hover:bg-gradient-to-r hover:from-emerald-50 hover:to-teal-100 font-medium flex items-center gap-3 transition-all duration-300 hover:shadow-md hover:scale-[1.01]"
          onClick={onClose}
        >
          <Icon iconName="FabricFolder" className="text-xl text-emerald-600" />
          <span>Inventario General</span>
        </Link>
      )}
      {hasPermiso(usuario, "ver_configuracion") && (
        <Link
          to="/configuracion"
          className="py-3 px-4 rounded-lg text-gray-700 hover:bg-gradient-to-r hover:from-gray-50 hover:to-slate-100 font-medium flex items-center gap-3 transition-all duration-300 hover:shadow-md hover:scale-[1.01]"
          onClick={onClose}
        >
          <Icon iconName="Settings" className="text-xl text-gray-600" />
          <span>Configuración</span>
        </Link>
      )}
      {hasPermiso(usuario, "ver_tema") && (
        <Link
          to="/tema"
          className="py-3 px-4 rounded-lg text-purple-700 hover:bg-gradient-to-r hover:from-purple-50 hover:to-indigo-100 font-medium flex items-center gap-3 transition-all duration-300 hover:shadow-md hover:scale-[1.01]"
          onClick={onClose}
        >
          <Icon iconName="Color" className="text-xl text-purple-600" />
          <span>Personalización</span>
        </Link>
      )}
      {hasPermiso(usuario, "ver_reabrir_caja") && (
        <Link
          to="/reabrir-caja"
          className="py-3 px-4 rounded-lg text-yellow-700 hover:bg-gradient-to-r hover:from-yellow-50 hover:to-yellow-100 font-medium flex items-center gap-3 transition-all duration-300 hover:shadow-md hover:scale-[1.01]"
          onClick={onClose}
        >
          <Icon iconName="Unlock" className="text-xl text-yellow-600" />
          <span>Reabrir Cajas</span>
        </Link>
      )}
      {hasPermiso(usuario, "ver_recordatorios_citas") && (
        <Link
          to="/recordatorios-citas"
          className="py-3 px-4 rounded-lg text-sky-700 hover:bg-gradient-to-r hover:from-sky-50 hover:to-cyan-100 font-medium flex items-center gap-3 transition-all duration-300 hover:shadow-md hover:scale-[1.01]"
          onClick={onClose}
        >
          <Icon iconName="ReminderTime" className="text-xl text-sky-600" />
          <span>Recordatorios Citas</span>
        </Link>
      )}
    </>
  );
}
