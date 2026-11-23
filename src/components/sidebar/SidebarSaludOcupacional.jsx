import { Link } from "react-router-dom";
import { Icon } from "@fluentui/react";
import SidebarSection from "./SidebarSection";
import useModulos from "../../hooks/useModulos";

const GESTION = "gestionar_empresas_ocupacional";
const REGISTRO = "registrar_trabajadores_ocupacional";

const ENLACES = [
  { to: "/salud-ocupacional/empresas", permiso: GESTION, icono: "CityNext", texto: "Empresas", color: "cyan", hover: "hover:to-sky-100" },
  { to: "/salud-ocupacional/trabajadores", permiso: REGISTRO, icono: "Work", texto: "Trabajadores", color: "emerald", hover: "hover:to-teal-100" },
  { to: "/salud-ocupacional/examenes-generales", permiso: GESTION, icono: "TestBeaker", texto: "Exámenes Generales", color: "blue", hover: "hover:to-indigo-100" },
  { to: "/salud-ocupacional/tipos-evaluacion", permiso: GESTION, icono: "NumberSequence", texto: "Tipos Evaluación", color: "indigo", hover: "hover:to-blue-100" },
  { to: "/salud-ocupacional/grupos-examenes", permiso: GESTION, icono: "BulletedTreeList", texto: "Grupo Exámenes", color: "teal", hover: "hover:to-cyan-100" },
  { to: "/salud-ocupacional/catalogo-examenes", permiso: GESTION, icono: "Switch", texto: "Catálogo por Empresa", color: "violet", hover: "hover:to-fuchsia-100" },
  { to: "/salud-ocupacional/protocolos", permiso: GESTION, icono: "BulletedTreeList", texto: "Protocolos", color: "rose", hover: "hover:to-orange-100" },
  { to: "/salud-ocupacional/ordenes", permiso: REGISTRO, icono: "BulletedTreeList", texto: "Ordenes", color: "amber", hover: "hover:to-yellow-100" },
  { to: "/salud-ocupacional/evaluacion-medica", permiso: REGISTRO, icono: "Medical", texto: "Evaluación Médica", color: "cyan", hover: "hover:to-emerald-100" },
];

// Las clases completas van escritas para que Tailwind las detecte.
const CLASES = {
  cyan: ["text-cyan-700 hover:from-cyan-50", "text-cyan-600"],
  emerald: ["text-emerald-700 hover:from-emerald-50", "text-emerald-600"],
  blue: ["text-blue-700 hover:from-blue-50", "text-blue-600"],
  indigo: ["text-indigo-700 hover:from-indigo-50", "text-indigo-600"],
  teal: ["text-teal-700 hover:from-teal-50", "text-teal-600"],
  violet: ["text-violet-700 hover:from-violet-50", "text-violet-600"],
  rose: ["text-rose-700 hover:from-rose-50", "text-rose-600"],
  amber: ["text-amber-700 hover:from-amber-50", "text-amber-600"],
};

// Sección "Salud Ocupacional" del menú lateral. Solo aparece si la instalación tiene el módulo activo
// y el usuario tiene el permiso de acceso más alguno de los específicos. `can` es la función de permisos del menú.
export default function SidebarSaludOcupacional({ can, isOpen, onToggle, onClose }) {
  const { tiene } = useModulos();
  if (!tiene("ocupacional") || !can("access_salud_ocupacional")) return null;
  const visibles = ENLACES.filter((e) => can(e.permiso));
  if (visibles.length === 0) return null;

  return (
    <SidebarSection title="Salud Ocupacional" iconName="Medical" isOpen={isOpen} onToggle={onToggle}>
      {visibles.map((e) => (
        <Link
          key={e.to}
          to={e.to}
          className={`py-2.5 px-3 rounded-lg ${CLASES[e.color][0]} hover:bg-gradient-to-r ${e.hover} font-medium flex items-center gap-3 transition-all duration-300`}
          onClick={onClose}
        >
          <Icon iconName={e.icono} className={`text-lg ${CLASES[e.color][1]}`} />
          <span>{e.texto}</span>
        </Link>
      ))}
    </SidebarSection>
  );
}
