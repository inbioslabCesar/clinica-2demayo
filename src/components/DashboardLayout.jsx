import React, { useState } from "react";
import { Link } from "react-router-dom";
import Footer from "./Footer";
import { Icon } from '@fluentui/react';
import { initializeIcons } from '@fluentui/font-icons-mdl2';
initializeIcons();
function Sidebar({ open, onClose, onLogout, usuario }) {
  // Sidebar fijo en PC (md+), drawer en móvil/tablet
  return (
    <>
      {/* Overlay para móvil/tablet */}
      <div
        className={`fixed inset-0 z-40 bg-black bg-opacity-40 transition-opacity duration-200 md:hidden ${open ? 'block' : 'hidden'}`}
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Sidebar */}
      <aside
        className={`fixed z-50 top-0 left-0 h-full w-64 bg-white border-r border-blue-500 shadow-lg transform transition-transform duration-200 ease-in-out
        ${open ? 'translate-x-0' : '-translate-x-full'}
        md:translate-x-0 md:static md:flex md:flex-col md:z-10 md:h-auto md:shadow-none md:bg-white md:w-64`}
      >
        <div className="flex flex-col h-full min-h-0">
          <div className="flex flex-col items-center py-6">
            <img src="/2demayo.svg" alt="Logo" className="h-14 w-14 object-contain bg-white rounded-full p-1 mb-2 shadow" onError={e => { e.target.onerror = null; e.target.src = '/logo.svg'; }} />
            <h5 className="text-lg font-bold text-purple-800 mb-2">Clínica 2 de Mayo</h5>
          </div>
          <nav className="flex flex-col gap-2 px-4 flex-1 overflow-y-auto">
            {usuario?.rol === 'medico' ? (
              <>
                <Link to="/mis-consultas" className="py-2 px-3 rounded-lg text-indigo-700 hover:bg-indigo-100 font-medium flex items-center gap-2" onClick={onClose}>
                  <Icon iconName="Contact" className="text-xl" />
                  Mis Consultas
                </Link>
                <Link to="/panel-medico" className="py-2 px-3 rounded-lg text-blue-700 hover:bg-blue-100 font-medium flex items-center gap-2" onClick={onClose}>
                  <Icon iconName="Calendar" className="text-xl" />
                  Disponibilidad
                </Link>
                <Link to="/historial-consultas" className="py-2 px-3 rounded-lg text-blue-700 hover:bg-blue-100 font-medium flex items-center gap-2" onClick={onClose}>
                  <Icon iconName="History" className="text-xl" />
                  Historial de consultas
                </Link>
              </>
            ) : usuario?.rol === 'enfermero' ? (
              <>
                <Link to="/panel-enfermero" className="py-2 px-3 rounded-lg text-green-700 hover:bg-green-100 font-medium" onClick={onClose}>Panel Enfermería</Link>
              </>
            ) : usuario?.rol === 'laboratorista' ? (
              <>
                <Link to="/panel-laboratorio" className="py-2 px-3 rounded-lg text-green-700 hover:bg-green-100 font-medium" onClick={onClose}>Panel Laboratorio</Link>
                <Link to="/examenes-laboratorio" className="py-2 px-3 rounded-lg text-green-700 hover:bg-green-100 font-medium" onClick={onClose}>Gestión de Exámenes</Link>
              </>
            ) : (usuario?.rol === 'químico' || usuario?.rol === 'quimico') ? (
              <>
                <Link to="/medicamentos" className="py-2 px-3 rounded-lg text-pink-700 hover:bg-pink-100 font-medium" onClick={onClose}>Medicamentos</Link>
              </>
            ) : (
              <>
                <Link to="/" className="py-2 px-3 rounded-lg text-blue-700 hover:bg-blue-100 font-medium" onClick={onClose}>Dashboard</Link>
                <Link to="/pacientes" className="py-2 px-3 rounded-lg text-blue-700 hover:bg-blue-100 font-medium" onClick={onClose}>Pacientes</Link>
                {usuario?.rol === 'administrador' && (
                  <>
                    <Link to="/usuarios" className="py-2 px-3 rounded-lg text-blue-700 hover:bg-blue-100 font-medium" onClick={onClose}>Usuarios</Link>
                    <Link to="/medicos" className="py-2 px-3 rounded-lg text-blue-700 hover:bg-blue-100 font-medium" onClick={onClose}>Médicos</Link>
                  </>
                )}
                <Link to="/reportes" className="py-2 px-3 rounded-lg text-blue-700 hover:bg-blue-100 font-medium" onClick={onClose}>Reportes</Link>
                <Link to="/configuracion" className="py-2 px-3 rounded-lg text-blue-700 hover:bg-blue-100 font-medium" onClick={onClose}>Configuración</Link>
              </>
            )}
          </nav>

          <div className="mt-auto p-4">
            <button onClick={onLogout} className="w-full bg-purple-800 text-white font-bold rounded-lg py-2 shadow hover:bg-blue-500 transition-colors">Cerrar sesión</button>
          </div>
        </div>
      </aside>
    </>
  );
}

function Navbar({ usuario, onMenu }) {
  // Botón hamburguesa a la derecha en móvil/tablet
  return (
    <header className="flex items-center justify-between px-6 py-3 bg-purple-800 shadow text-white">
      <div className="flex items-center gap-3">
        <img src="/2demayo.svg" alt="Logo" className="h-10 w-10 object-contain bg-white rounded-full p-1 shadow" />
        <span className="text-xl font-bold drop-shadow">Clínica 2 de Mayo</span>
      </div>
      <div className="flex items-center gap-4">
        <span className="font-semibold text-white/90">{usuario?.nombre || "Usuario"}</span>
        {/* Botón hamburguesa solo visible en móvil/tablet */}
        <button className="md:hidden ml-2" onClick={onMenu} aria-label="Abrir menú">
          <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
      </div>
    </header>
  );
}


import { useEffect } from "react";

function DashboardLayout({ usuario, onLogout, children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Cierra el sidebar automáticamente al cambiar a móvil/tablet
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setSidebarOpen(false); // en PC, el sidebar siempre visible por CSS
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-blue-50">
      {/* Navbar at the top */}
      <Navbar usuario={usuario} onMenu={() => setSidebarOpen(true)} />
      <div className="flex flex-1">
        {/* Sidebar for navigation (fijo en PC, drawer en móvil/tablet) */}
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} onLogout={onLogout} usuario={usuario} />
  <main className="flex-1 px-2 sm:px-4 md:px-8">
          {children}
        </main>
      </div>
      {/* Footer at the bottom */}
      <Footer />
    </div>
  );
}

export default DashboardLayout;
