import { useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { FiUsers, FiBell, FiClipboard, FiBarChart2, FiFileText } from "react-icons/fi";
import { hasPermiso } from "../../config/recepcionPermisos";

const LINK_CATALOG = {
  pacientes: {
    label: "Pacientes",
    to: "/pacientes",
    icon: FiUsers,
    permiso: "ver_pacientes",
  },
  recordatorios: {
    label: "Recordatorios de Citas",
    to: "/recordatorios-citas",
    icon: FiBell,
    permiso: "ver_recordatorios_citas",
  },
  listaConsultas: {
    label: "Lista de Consultas",
    to: "/lista-consultas",
    icon: FiClipboard,
    permiso: "ver_lista_consultas",
  },
  reporteCaja: {
    label: "Reporte de Caja",
    to: "/contabilidad",
    icon: FiBarChart2,
    permiso: "ver_contabilidad",
  },
  cotizaciones: {
    label: "Cotizaciones",
    to: "/cotizaciones",
    icon: FiFileText,
    permiso: "ver_cotizaciones",
  },
};

export default function QuickAccessNav({
  keys = ["pacientes", "recordatorios", "reporteCaja"],
  className = "mb-4",
}) {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const usuarioSesion = useMemo(() => {
    try {
      return JSON.parse(sessionStorage.getItem("usuario") || "null");
    } catch {
      return null;
    }
  }, []);

  const quickLinks = useMemo(() => {
    const selected = keys
      .map((k) => LINK_CATALOG[k])
      .filter(Boolean);

    if (!usuarioSesion?.rol) return selected.filter((item) => item.to !== pathname);
    return selected.filter(
      (item) => hasPermiso(usuarioSesion, item.permiso) && item.to !== pathname
    );
  }, [keys, usuarioSesion, pathname]);

  if (quickLinks.length === 0) return null;

  return (
    <div className={`${className} grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2`}>
      {quickLinks.map((item) => {
        const IconComp = item.icon;
        return (
          <button
            key={item.to}
            type="button"
            onClick={() => navigate(item.to)}
            className="w-full text-left px-3 py-2 rounded-lg border bg-white hover:bg-gray-50 transition-all duration-200 flex items-center gap-2"
            style={{
              color: "var(--color-primary-dark)",
              borderColor: "var(--color-primary-light)",
            }}
          >
            <IconComp className="text-base" />
            <span className="font-medium text-sm">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
