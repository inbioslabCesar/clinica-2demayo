import { useLocation, Link } from "react-router-dom";
import { useState } from "react";
import FirmaDigitalMedico from "../FirmaDigitalMedico";

export default function SidebarMedico() {
  const location = useLocation();
  const [showFirmaModal, setShowFirmaModal] = useState(false);
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
      
      {/* Botón Firma Digital */}
      <div className="border-t border-blue-200 pt-3 mt-3">
        <button
          onClick={() => setShowFirmaModal(true)}
          className="w-full text-left px-3 py-2 text-blue-900 hover:bg-blue-100 rounded-lg transition-colors flex items-center gap-3"
        >
          <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h14a2 2 0 002-2V7a2 2 0 00-2-2h-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          <span className="font-medium">✍️ Firma Digital</span>
        </button>
      </div>

      {/* Modal Firma Digital */}
      <FirmaDigitalMedico 
        isOpen={showFirmaModal}
        onClose={() => setShowFirmaModal(false)}
      />
    </nav>
  );
}
