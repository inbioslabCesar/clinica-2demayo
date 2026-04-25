import { useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "@fluentui/react";
import SidebarSection from "./SidebarSection";

export default function SidebarAdmin({ onClose }) {
  const [openSection, setOpenSection] = useState("finanzas");

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
      <SidebarSection
        title="Finanzas"
        iconName="Money"
        isOpen={openSection === "finanzas"}
        onToggle={() => handleToggleSection("finanzas")}
      >
        <Link
          to="/contabilidad"
          className="py-2.5 px-3 rounded-lg text-violet-700 hover:bg-gradient-to-r hover:from-violet-50 hover:to-purple-100 font-medium flex items-center gap-3 transition-all duration-300"
          onClick={onClose}
        >
          <Icon iconName="BarChart4" className="text-lg text-violet-600" />
          <span>Reporte de Caja</span>
        </Link>
        <Link
          to="/gestion-tarifas"
          className="py-2.5 px-3 rounded-lg text-amber-700 hover:bg-gradient-to-r hover:from-amber-50 hover:to-yellow-100 font-medium flex items-center gap-3 transition-all duration-300"
          onClick={onClose}
        >
          <Icon iconName="Money" className="text-lg text-amber-600" />
          <span>Gestión de Tarifas</span>
        </Link>
        <Link
          to="/paquetes-perfiles"
          className="py-2.5 px-3 rounded-lg text-blue-700 hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-100 font-medium flex items-center gap-3 transition-all duration-300"
          onClick={onClose}
        >
          <Icon iconName="Product" className="text-lg text-blue-600" />
          <span>Paquetes y Perfiles</span>
        </Link>
        <Link
          to="/cotizaciones"
          className="py-2.5 px-3 rounded-lg text-fuchsia-700 hover:bg-gradient-to-r hover:from-fuchsia-50 hover:to-purple-100 font-medium flex items-center gap-3 transition-all duration-300"
          onClick={onClose}
        >
          <Icon iconName="Paste" className="text-lg text-fuchsia-600" />
          <span>Cotizaciones Prueba</span>
        </Link>
        <Link
          to="/contratos"
          className="py-2.5 px-3 rounded-lg text-emerald-700 hover:bg-gradient-to-r hover:from-emerald-50 hover:to-teal-100 font-medium flex items-center gap-3 transition-all duration-300"
          onClick={onClose}
        >
          <Icon iconName="ClipboardList" className="text-lg text-emerald-600" />
          <span>Contratos</span>
        </Link>
        <Link
          to="/reabrir-caja"
          className="py-2.5 px-3 rounded-lg text-yellow-700 hover:bg-gradient-to-r hover:from-yellow-50 hover:to-yellow-100 font-medium flex items-center gap-3 transition-all duration-300"
          onClick={onClose}
        >
          <Icon iconName="Unlock" className="text-lg text-yellow-600" />
          <span>Reabrir Cajas</span>
        </Link>
      </SidebarSection>

      <SidebarSection
        title="Pacientes"
        iconName="People"
        isOpen={openSection === "pacientes"}
        onToggle={() => handleToggleSection("pacientes")}
      >
        <Link
          to="/pacientes"
          className="py-2.5 px-3 rounded-lg text-cyan-700 hover:bg-gradient-to-r hover:from-cyan-50 hover:to-blue-100 font-medium flex items-center gap-3 transition-all duration-300"
          onClick={onClose}
        >
          <Icon iconName="People" className="text-lg text-cyan-600" />
          <span>Pacientes</span>
        </Link>
        <Link
          to="/lista-consultas"
          className="py-2.5 px-3 rounded-lg text-indigo-700 hover:bg-gradient-to-r hover:from-indigo-50 hover:to-blue-100 font-medium flex items-center gap-3 transition-all duration-300"
          onClick={onClose}
        >
          <Icon iconName="Calendar" className="text-lg text-indigo-600" />
          <span>Lista de Consultas</span>
        </Link>
        <Link
          to="/recordatorios-citas"
          className="py-2.5 px-3 rounded-lg text-sky-700 hover:bg-gradient-to-r hover:from-sky-50 hover:to-cyan-100 font-medium flex items-center gap-3 transition-all duration-300"
          onClick={onClose}
        >
          <Icon iconName="ReminderTime" className="text-lg text-sky-600" />
          <span>Recordatorios Citas</span>
        </Link>
      </SidebarSection>

      <SidebarSection
        title="Personal Clínico"
        iconName="Medical"
        isOpen={openSection === "personal"}
        onToggle={() => handleToggleSection("personal")}
      >
        <Link
          to="/medicos"
          className="py-2.5 px-3 rounded-lg text-emerald-700 hover:bg-gradient-to-r hover:from-emerald-50 hover:to-green-100 font-medium flex items-center gap-3 transition-all duration-300"
          onClick={onClose}
        >
          <Icon iconName="Health" className="text-lg text-emerald-600" />
          <span>Médicos</span>
        </Link>
        <Link
          to="/panel-enfermero"
          className="py-2.5 px-3 rounded-lg text-rose-700 hover:bg-gradient-to-r hover:from-rose-50 hover:to-pink-100 font-medium flex items-center gap-3 transition-all duration-300"
          onClick={onClose}
        >
          <Icon iconName="Heart" className="text-lg text-rose-600" />
          <span>Panel Enfermería</span>
        </Link>
        <Link
          to="/panel-laboratorio"
          className="py-2.5 px-3 rounded-lg text-teal-700 hover:bg-gradient-to-r hover:from-teal-50 hover:to-cyan-100 font-medium flex items-center gap-3 transition-all duration-300"
          onClick={onClose}
        >
          <Icon iconName="TestBeaker" className="text-lg text-teal-600" />
          <span>Panel Laboratorio</span>
        </Link>
        <Link
          to="/medicamentos"
          className="py-2.5 px-3 rounded-lg text-green-700 hover:bg-gradient-to-r hover:from-green-50 hover:to-teal-100 font-medium flex items-center gap-3 transition-all duration-300"
          onClick={onClose}
        >
          <Icon iconName="Pill" className="text-lg text-green-600" />
          <span>Módulo Quimico</span>
        </Link>
      </SidebarSection>

      <SidebarSection
        title="Inventario"
        iconName="FabricFolder"
        isOpen={openSection === "inventario"}
        onToggle={() => handleToggleSection("inventario")}
      >
        <Link
          to="/laboratorio/inventario"
          className="py-2.5 px-3 rounded-lg text-purple-700 hover:bg-gradient-to-r hover:from-purple-50 hover:to-indigo-100 font-medium flex items-center gap-3 transition-all duration-300"
          onClick={onClose}
        >
          <Icon iconName="TestBeaker" className="text-lg text-purple-600" />
          <span>Inventario Lab</span>
        </Link>
        <Link
          to="/inventario-general"
          className="py-2.5 px-3 rounded-lg text-emerald-700 hover:bg-gradient-to-r hover:from-emerald-50 hover:to-teal-100 font-medium flex items-center gap-3 transition-all duration-300"
          onClick={onClose}
        >
          <Icon iconName="FabricFolder" className="text-lg text-emerald-600" />
          <span>Inventario General</span>
        </Link>
      </SidebarSection>

      <SidebarSection
        title="Administración"
        iconName="Settings"
        isOpen={openSection === "administracion"}
        onToggle={() => handleToggleSection("administracion")}
      >
        <Link
          to="/usuarios"
          className="py-2.5 px-3 rounded-lg text-blue-700 hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-100 font-medium flex items-center gap-3 transition-all duration-300"
          onClick={onClose}
        >
          <Icon iconName="People" className="text-lg text-blue-600" />
          <span>Usuarios</span>
        </Link>
        <Link
          to="/configuracion"
          className="py-2.5 px-3 rounded-lg text-gray-700 hover:bg-gradient-to-r hover:from-gray-50 hover:to-slate-100 font-medium flex items-center gap-3 transition-all duration-300"
          onClick={onClose}
        >
          <Icon iconName="Settings" className="text-lg text-gray-600" />
          <span>Configuración</span>
        </Link>
        <Link
          to="/configuracion/plantillas-hc"
          className="py-2.5 px-3 rounded-lg text-cyan-700 hover:bg-gradient-to-r hover:from-cyan-50 hover:to-sky-100 font-medium flex items-center gap-3 transition-all duration-300"
          onClick={onClose}
        >
          <Icon iconName="EditCreate" className="text-lg text-cyan-600" />
          <span>Plantillas HC</span>
        </Link>
        <Link
          to="/tema"
          className="py-2.5 px-3 rounded-lg text-purple-700 hover:bg-gradient-to-r hover:from-purple-50 hover:to-indigo-100 font-medium flex items-center gap-3 transition-all duration-300"
          onClick={onClose}
        >
          <Icon iconName="Color" className="text-lg text-purple-600" />
          <span>Personalización</span>
        </Link>
      </SidebarSection>

      <SidebarSection
        title="Web"
        iconName="Globe"
        isOpen={openSection === "web"}
        onToggle={() => handleToggleSection("web")}
      >
        <Link
          to="/web-servicios"
          className="py-2.5 px-3 rounded-lg text-sky-700 hover:bg-gradient-to-r hover:from-sky-50 hover:to-blue-100 font-medium flex items-center gap-3 transition-all duration-300"
          onClick={onClose}
        >
          <Icon iconName="Repair" className="text-lg text-sky-600" />
          <span>Servicios Web</span>
        </Link>
        <Link
          to="/web-ofertas"
          className="py-2.5 px-3 rounded-lg text-pink-700 hover:bg-gradient-to-r hover:from-pink-50 hover:to-rose-100 font-medium flex items-center gap-3 transition-all duration-300"
          onClick={onClose}
        >
          <Icon iconName="Financial" className="text-lg text-pink-600" />
          <span>Ofertas Web</span>
        </Link>
        <Link
          to="/web-banners"
          className="py-2.5 px-3 rounded-lg text-indigo-700 hover:bg-gradient-to-r hover:from-indigo-50 hover:to-blue-100 font-medium flex items-center gap-3 transition-all duration-300"
          onClick={onClose}
        >
          <Icon iconName="Picture" className="text-lg text-indigo-600" />
          <span>Banners Web</span>
        </Link>
      </SidebarSection>
    </>
  );
}
