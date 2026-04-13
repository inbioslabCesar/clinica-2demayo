import { useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "@fluentui/react";
import { hasPermiso } from "../../config/recepcionPermisos";
import SidebarSection from "./SidebarSection";

export default function SidebarRecepcionista({ onClose, usuario }) {
  const [openSection, setOpenSection] = useState("finanzas");
  const can = (permiso) => hasPermiso(usuario, permiso);
  const showFinanzas = can("ver_contabilidad") || can("ver_gestion_tarifas") || can("ver_reabrir_caja") || can("ver_cotizaciones");
  const showPacientes = can("ver_pacientes") || can("ver_lista_consultas") || can("ver_recordatorios_citas");
  const showPersonal = can("ver_medicos") || can("ver_panel_enfermeria") || can("ver_panel_laboratorio") || can("ver_modulo_quimico");
  const showInventario = can("ver_inventario_general") || can("ver_inventario_laboratorio");
  const showAdministracion = can("ver_usuarios") || can("ver_configuracion") || can("ver_tema");

  const handleToggleSection = (sectionKey) => {
    setOpenSection((prev) => (prev === sectionKey ? null : sectionKey));
  };

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
      {showFinanzas && (
        <SidebarSection
          title="Finanzas"
          iconName="Money"
          isOpen={openSection === "finanzas"}
          onToggle={() => handleToggleSection("finanzas")}
        >
          {can("ver_contabilidad") && (
            <Link
              to="/contabilidad"
              className="py-2.5 px-3 rounded-lg text-violet-700 hover:bg-gradient-to-r hover:from-violet-50 hover:to-purple-100 font-medium flex items-center gap-3 transition-all duration-300"
              onClick={onClose}
            >
              <Icon iconName="BarChart4" className="text-lg text-violet-600" />
              <span>Reporte de Caja</span>
            </Link>
          )}
          {can("ver_gestion_tarifas") && (
            <Link
              to="/gestion-tarifas"
              className="py-2.5 px-3 rounded-lg text-amber-700 hover:bg-gradient-to-r hover:from-amber-50 hover:to-yellow-100 font-medium flex items-center gap-3 transition-all duration-300"
              onClick={onClose}
            >
              <Icon iconName="Money" className="text-lg text-amber-600" />
              <span>Gestión de Tarifas</span>
            </Link>
          )}
          {can("ver_cotizaciones") && (
            <Link
              to="/cotizaciones"
              className="py-2.5 px-3 rounded-lg text-fuchsia-700 hover:bg-gradient-to-r hover:from-fuchsia-50 hover:to-purple-100 font-medium flex items-center gap-3 transition-all duration-300"
              onClick={onClose}
            >
              <Icon iconName="Paste" className="text-lg text-fuchsia-600" />
              <span>Cotizaciones</span>
            </Link>
          )}
          {can("ver_reabrir_caja") && (
            <Link
              to="/reabrir-caja"
              className="py-2.5 px-3 rounded-lg text-yellow-700 hover:bg-gradient-to-r hover:from-yellow-50 hover:to-yellow-100 font-medium flex items-center gap-3 transition-all duration-300"
              onClick={onClose}
            >
              <Icon iconName="Unlock" className="text-lg text-yellow-600" />
              <span>Reabrir Cajas</span>
            </Link>
          )}
        </SidebarSection>
      )}

      {showPacientes && (
        <SidebarSection
          title="Pacientes"
          iconName="People"
          isOpen={openSection === "pacientes"}
          onToggle={() => handleToggleSection("pacientes")}
        >
          {can("ver_pacientes") && (
            <Link
              to="/pacientes"
              className="py-2.5 px-3 rounded-lg text-cyan-700 hover:bg-gradient-to-r hover:from-cyan-50 hover:to-blue-100 font-medium flex items-center gap-3 transition-all duration-300"
              onClick={onClose}
            >
              <Icon iconName="People" className="text-lg text-cyan-600" />
              <span>Pacientes</span>
            </Link>
          )}
          {can("ver_lista_consultas") && (
            <Link
              to="/lista-consultas"
              className="py-2.5 px-3 rounded-lg text-indigo-700 hover:bg-gradient-to-r hover:from-indigo-50 hover:to-blue-100 font-medium flex items-center gap-3 transition-all duration-300"
              onClick={onClose}
            >
              <Icon iconName="Calendar" className="text-lg text-indigo-600" />
              <span>Lista de Consultas</span>
            </Link>
          )}
          {can("ver_recordatorios_citas") && (
            <Link
              to="/recordatorios-citas"
              className="py-2.5 px-3 rounded-lg text-sky-700 hover:bg-gradient-to-r hover:from-sky-50 hover:to-cyan-100 font-medium flex items-center gap-3 transition-all duration-300"
              onClick={onClose}
            >
              <Icon iconName="ReminderTime" className="text-lg text-sky-600" />
              <span>Recordatorios Citas</span>
            </Link>
          )}
        </SidebarSection>
      )}

      {showPersonal && (
        <SidebarSection
          title="Personal Clínico"
          iconName="Medical"
          isOpen={openSection === "personal"}
          onToggle={() => handleToggleSection("personal")}
        >
          {can("ver_medicos") && (
            <Link
              to="/medicos"
              className="py-2.5 px-3 rounded-lg text-teal-700 hover:bg-gradient-to-r hover:from-teal-50 hover:to-cyan-100 font-medium flex items-center gap-3 transition-all duration-300"
              onClick={onClose}
            >
              <Icon iconName="Medical" className="text-lg text-teal-600" />
              <span>Medicos</span>
            </Link>
          )}
          {can("ver_panel_enfermeria") && (
            <Link
              to="/panel-enfermero"
              className="py-2.5 px-3 rounded-lg text-rose-700 hover:bg-gradient-to-r hover:from-rose-50 hover:to-pink-100 font-medium flex items-center gap-3 transition-all duration-300"
              onClick={onClose}
            >
              <Icon iconName="Heart" className="text-lg text-rose-600" />
              <span>Panel Enfermeria</span>
            </Link>
          )}
          {can("ver_panel_laboratorio") && (
            <Link
              to="/panel-laboratorio"
              className="py-2.5 px-3 rounded-lg text-purple-700 hover:bg-gradient-to-r hover:from-purple-50 hover:to-indigo-100 font-medium flex items-center gap-3 transition-all duration-300"
              onClick={onClose}
            >
              <Icon iconName="TestBeaker" className="text-lg text-purple-600" />
              <span>Panel Laboratorio</span>
            </Link>
          )}
          {can("ver_modulo_quimico") && (
            <Link
              to="/medicamentos"
              className="py-2.5 px-3 rounded-lg text-indigo-700 hover:bg-gradient-to-r hover:from-indigo-50 hover:to-blue-100 font-medium flex items-center gap-3 transition-all duration-300"
              onClick={onClose}
            >
              <Icon iconName="Pill" className="text-lg text-indigo-600" />
              <span>Modulo Quimico</span>
            </Link>
          )}
        </SidebarSection>
      )}

      {showInventario && (
        <SidebarSection
          title="Inventario"
          iconName="FabricFolder"
          isOpen={openSection === "inventario"}
          onToggle={() => handleToggleSection("inventario")}
        >
          {can("ver_inventario_general") && (
            <Link
              to="/inventario-general"
              className="py-2.5 px-3 rounded-lg text-emerald-700 hover:bg-gradient-to-r hover:from-emerald-50 hover:to-teal-100 font-medium flex items-center gap-3 transition-all duration-300"
              onClick={onClose}
            >
              <Icon iconName="FabricFolder" className="text-lg text-emerald-600" />
              <span>Inventario General</span>
            </Link>
          )}
          {can("ver_inventario_laboratorio") && (
            <Link
              to="/laboratorio/inventario"
              className="py-2.5 px-3 rounded-lg text-purple-700 hover:bg-gradient-to-r hover:from-purple-50 hover:to-indigo-100 font-medium flex items-center gap-3 transition-all duration-300"
              onClick={onClose}
            >
              <Icon iconName="TestBeaker" className="text-lg text-purple-600" />
              <span>Inventario Lab</span>
            </Link>
          )}
        </SidebarSection>
      )}

      {showAdministracion && (
        <SidebarSection
          title="Administración"
          iconName="Settings"
          isOpen={openSection === "administracion"}
          onToggle={() => handleToggleSection("administracion")}
        >
          {can("ver_usuarios") && (
            <Link
              to="/usuarios"
              className="py-2.5 px-3 rounded-lg text-blue-700 hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-100 font-medium flex items-center gap-3 transition-all duration-300"
              onClick={onClose}
            >
              <Icon iconName="People" className="text-lg text-blue-600" />
              <span>Usuarios</span>
            </Link>
          )}
          {can("ver_configuracion") && (
            <Link
              to="/configuracion"
              className="py-2.5 px-3 rounded-lg text-gray-700 hover:bg-gradient-to-r hover:from-gray-50 hover:to-slate-100 font-medium flex items-center gap-3 transition-all duration-300"
              onClick={onClose}
            >
              <Icon iconName="Settings" className="text-lg text-gray-600" />
              <span>Configuración</span>
            </Link>
          )}
          {can("ver_tema") && (
            <Link
              to="/tema"
              className="py-2.5 px-3 rounded-lg text-purple-700 hover:bg-gradient-to-r hover:from-purple-50 hover:to-indigo-100 font-medium flex items-center gap-3 transition-all duration-300"
              onClick={onClose}
            >
              <Icon iconName="Color" className="text-lg text-purple-600" />
              <span>Personalización</span>
            </Link>
          )}
        </SidebarSection>
      )}
    </>
  );
}
