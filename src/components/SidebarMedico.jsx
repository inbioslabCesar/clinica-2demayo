import { useLocation } from "react-router-dom";

export default function SidebarMedico() {
  const location = useLocation();
  return (
    <nav className="flex flex-col gap-2 p-4 bg-blue-50 min-h-full">
      <Link
        to="/panel-medico"
        className={
          location.pathname.startsWith("/panel-medico")
            ? "font-bold text-blue-700"
            : "text-blue-900 hover:underline"
        }
      >
        Panel principal
      </Link>
      <Link
        to="/mis-consultas"
        className={
          location.pathname.startsWith("/mis-consultas")
            ? "font-bold text-blue-700"
            : "text-blue-900 hover:underline"
        }
      >
        Mis consultas
      </Link>
      <Link
        to="/historial-consultas"
        className={
          location.pathname.startsWith("/historial-consultas")
            ? "font-bold text-blue-700"
            : "text-blue-900 hover:underline"
        }
      >
        Historial de consultas
      </Link>
    </nav>
  );
}
