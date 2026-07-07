import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Icon } from '@fluentui/react';

const preloadSuplenciaPacientesPage = () => import("../../pages/SuplenciaPacientesPage.jsx");

export default function SidebarMedico({ onClose }) {
  const location = useLocation();
  const [abriendoSuplencia, setAbriendoSuplencia] = useState(false);

  useEffect(() => {
    preloadSuplenciaPacientesPage().catch(() => {
      // La navegacion funciona igual; esta precarga solo reduce latencia del primer acceso.
    });
  }, []);

  useEffect(() => {
    if (location.pathname === "/suplencia-pacientes") {
      setAbriendoSuplencia(false);
    }
  }, [location.pathname]);

  const itemStyle = {
    color: "var(--color-secondary)",
  };

  return (
    <>
      <Link to="/mis-consultas" className="py-2 px-3 rounded-lg hover:bg-white/70 font-medium flex items-center gap-2" style={itemStyle} onClick={onClose}>
        <Icon iconName="Contact" className="text-xl" />
        Mis Consultas
      </Link>
      <Link to="/panel-medico" className="py-2 px-3 rounded-lg hover:bg-white/70 font-medium flex items-center gap-2" style={itemStyle} onClick={onClose}>
        <Icon iconName="Calendar" className="text-xl" />
        Disponibilidad
      </Link>
      <Link
        to="/suplencia-pacientes"
        className="py-2 px-3 rounded-lg hover:bg-white/70 font-medium flex items-center gap-2"
        style={itemStyle}
        onMouseEnter={preloadSuplenciaPacientesPage}
        onFocus={preloadSuplenciaPacientesPage}
        onTouchStart={preloadSuplenciaPacientesPage}
        onClick={(event) => {
          if (location.pathname === "/suplencia-pacientes") {
            setAbriendoSuplencia(false);
            onClose?.();
            event.preventDefault();
            return;
          }
          setAbriendoSuplencia(true);
          onClose?.();
        }}
        aria-busy={abriendoSuplencia}
      >
        {abriendoSuplencia ? (
          <span className="inline-flex h-5 w-5 items-center justify-center" aria-hidden="true">
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" className="opacity-25" stroke="currentColor" strokeWidth="3" />
              <path d="M21 12a9 9 0 00-9-9" className="opacity-90" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
          </span>
        ) : (
          <Icon iconName="Switch" className="text-xl" />
        )}
        <span>{abriendoSuplencia ? "Abriendo módulo..." : "Pacientes por Suplencia"}</span>
      </Link>
    </>
  );
}