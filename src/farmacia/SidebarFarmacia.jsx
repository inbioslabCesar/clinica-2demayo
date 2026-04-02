import { Link, useLocation } from "react-router-dom";

export default function SidebarFarmacia() {
  const location = useLocation();
  const getLinkStyle = (active) => (
    active
      ? {
          background: "var(--color-primary-light)",
          color: "var(--color-secondary)",
          fontWeight: 700,
        }
      : {
          color: "var(--color-secondary)",
        }
  );

  return (
    <nav
      className="flex flex-col gap-2 p-4 min-h-full"
      style={{
        background: "linear-gradient(180deg, var(--color-primary-light) 0%, #ffffff 100%)",
      }}
    >
      <Link
        to="/medicamentos"
        className="rounded-lg px-3 py-2 hover:underline"
        style={getLinkStyle(location.pathname.startsWith("/medicamentos"))}
      >
        Medicamentos
      </Link>
      <Link
        to="/farmacia/cotizador"
        className="rounded-lg px-3 py-2 hover:underline"
        style={getLinkStyle(location.pathname.startsWith("/farmacia/cotizador"))}
      >
        Cotizador Farmacia
      </Link>
      <Link
        to="/farmacia/ventas"
        className="rounded-lg px-3 py-2 hover:underline"
        style={getLinkStyle(location.pathname.startsWith("/farmacia/ventas"))}
      >
        Ventas de Farmacia
      </Link>
    </nav>
  );
}
