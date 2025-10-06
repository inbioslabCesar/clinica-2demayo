import React from "react";
import { Link, useLocation } from "react-router-dom";

export default function SidebarFarmacia() {
  const location = useLocation();
  return (
    <nav className="flex flex-col gap-2 p-4 bg-blue-50 min-h-full">
      <Link
        to="/medicamentos"
        className={location.pathname.startsWith("/medicamentos") ? "font-bold text-blue-700" : "text-blue-900 hover:underline"}
      >
        Medicamentos
      </Link>
      <Link
        to="/farmacia/cotizador"
        className={location.pathname.startsWith("/farmacia/cotizador") ? "font-bold text-blue-700" : "text-blue-900 hover:underline"}
      >
        Cotizador Farmacia
      </Link>
      <Link
        to="/farmacia/ventas"
        className={location.pathname.startsWith("/farmacia/ventas") ? "font-bold text-blue-700" : "text-blue-900 hover:underline"}
      >
        Ventas de Farmacia
      </Link>
    </nav>
  );
}
