import { Icon } from '@fluentui/react';
import Footer from "./Footer";
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { initializeIcons } from '@fluentui/font-icons-mdl2';
initializeIcons();
import SidebarMedico from "./sidebar/SidebarMedico";
import SidebarEnfermero from "./sidebar/SidebarEnfermero";
import SidebarLaboratorista from "./sidebar/SidebarLaboratorista";
import SidebarQuimico from "./sidebar/SidebarQuimico";
import SidebarRecepcionista from "./sidebar/SidebarRecepcionista";
import SidebarAdmin from "./sidebar/SidebarAdmin";
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
          <div className="flex flex-col items-center py-6 bg-gradient-to-br from-purple-600 via-purple-700 to-indigo-800 text-white rounded-b-2xl mx-2 mb-4 shadow-lg">
            <div className="relative">
              <div className="absolute inset-0 bg-white/20 rounded-full blur-md"></div>
              <img 
                src="/2demayo.svg" 
                alt="Logo" 
                className="relative h-16 w-16 object-contain bg-white rounded-full p-2 shadow-lg ring-4 ring-white/30" 
                onError={e => { e.target.onerror = null; e.target.src = '/logo.svg'; }} 
              />
            </div>
            <h5 className="text-lg font-bold text-white mt-3 text-center drop-shadow-lg">Clínica 2 de Mayo</h5>
            <div className="w-12 h-0.5 bg-white/30 rounded-full mt-2"></div>
          </div>
          <nav className="flex flex-col gap-3 px-4 flex-1 overflow-y-auto">
            {usuario?.rol === 'medico' && <SidebarMedico onClose={onClose} />}
            {usuario?.rol === 'enfermero' && <SidebarEnfermero onClose={onClose} />}
            {usuario?.rol === 'laboratorista' && <SidebarLaboratorista onClose={onClose} />}
            {(usuario?.rol === 'químico' || usuario?.rol === 'quimico') && <SidebarQuimico onClose={onClose} />}
            {usuario?.rol === 'recepcionista' && <SidebarRecepcionista onClose={onClose} />}
            {usuario?.rol === 'administrador' && <SidebarAdmin onClose={onClose} />}
            {/* Si el rol no coincide, mostrar Dashboard y Pacientes por defecto */}
            {!['medico','enfermero','laboratorista','químico','quimico','recepcionista','administrador'].includes(usuario?.rol) && (
              <>
                <Link to="/" className="group relative py-3 px-4 rounded-xl bg-gradient-to-r from-purple-600 via-purple-700 to-indigo-800 text-white font-semibold shadow-lg hover:shadow-xl transform hover:scale-[1.02] transition-all duration-300 flex items-center gap-3 overflow-hidden" onClick={onClose}>
                  <Icon iconName="ViewDashboard" className="text-xl text-white" />
                  <span className="relative z-10 text-lg">Dashboard</span>
                </Link>
                <Link to="/pacientes" className="py-3 px-4 rounded-lg text-cyan-700 hover:bg-gradient-to-r hover:from-cyan-50 hover:to-blue-100 font-medium flex items-center gap-3 transition-all duration-300 hover:shadow-md hover:scale-[1.01]" onClick={onClose}>
                  <Icon iconName="People" className="text-xl text-cyan-600" />
                  <span>Pacientes</span>
                </Link>
              </>
            )}
          </nav>

          <div className="mt-auto p-4">
            <button 
              onClick={onLogout} 
              className="group w-full bg-gradient-to-r from-red-600 via-red-700 to-rose-800 text-white font-bold rounded-xl py-3 px-4 shadow-lg hover:shadow-xl transform hover:scale-[1.02] transition-all duration-300 flex items-center justify-center gap-3 relative overflow-hidden"
            >
              {/* Fondo animado */}
              <div className="absolute inset-0 bg-gradient-to-r from-red-700 via-rose-600 to-pink-700 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              
              {/* Icono */}
              <div className="relative z-10 flex items-center justify-center w-6 h-6 bg-white/20 rounded-lg backdrop-blur-sm">
                <Icon iconName="SignOut" className="text-lg text-white" />
              </div>
              
              {/* Texto */}
              <span className="relative z-10">Cerrar sesión</span>
              
              {/* Efecto de brillo */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
            </button>
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
        <span className="font-semibold text-white/90">{usuario?.nombre} {usuario?.apellido || ""}</span>
        {/* Botón hamburguesa solo visible en móvil/tablet */}
        <button className="md:hidden ml-2" onClick={onMenu} aria-label="Abrir menú">
          <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
      </div>
    </header>
  );
}


// useEffect is already imported above via react import where needed

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
    <div className="min-h-screen flex flex-col bg-blue-50 overflow-x-hidden">
      {/* Navbar at the top */}
      <Navbar usuario={usuario} onMenu={() => setSidebarOpen(true)} />
      <div className="flex flex-1 max-w-full">
        {/* Sidebar for navigation (fijo en PC, drawer en móvil/tablet) */}
        <Sidebar 
          open={sidebarOpen} 
          onClose={() => setSidebarOpen(false)} 
          onLogout={onLogout} 
          usuario={usuario}
        />
        <main className="flex-1 px-2 sm:px-4 md:px-8 min-w-0 max-w-full overflow-x-auto">
          {children}
        </main>
      </div>
      {/* Footer at the bottom */}
      <Footer />
    </div>
  );
}

export default DashboardLayout;
