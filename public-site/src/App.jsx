import React from 'react'
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import HomePage from './pages/HomePage.jsx'
import ServiciosPage from './pages/ServiciosPage.jsx'
import OfertasPage from './pages/OfertasPage.jsx'

const SISTEMA_URL = 'https://sistema.clinica2demayo.com/'

function NavItem({ to, children }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `px-3 py-2 rounded-lg text-sm font-medium ${isActive ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'}`
      }
      end
    >
      {children}
    </NavLink>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-50 text-slate-900">
        <header className="border-b bg-white">
          <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
            <a href="/" className="flex items-center gap-3">
              <img src="/2demayo.svg" alt="Clínica 2 de Mayo" className="w-10 h-10" />
              <div className="leading-tight">
                <div className="font-semibold">Clínica 2 de Mayo</div>
                <div className="text-xs text-slate-600">Servicios y ofertas</div>
              </div>
            </a>
            <nav className="flex items-center gap-2">
              <NavItem to="/">Inicio</NavItem>
              <NavItem to="/servicios">Servicios</NavItem>
              <NavItem to="/ofertas">Ofertas</NavItem>
            </nav>
            <a
              href={SISTEMA_URL}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
              rel="noopener noreferrer"
            >
              Ingresar al sistema
            </a>
          </div>
        </header>

        <main className="max-w-6xl mx-auto px-4 py-8">
          <Routes>
            <Route path="/" element={<HomePage sistemaUrl={SISTEMA_URL} />} />
            <Route path="/servicios" element={<ServiciosPage />} />
            <Route path="/ofertas" element={<OfertasPage />} />
          </Routes>
        </main>

        <footer className="border-t bg-white">
          <div className="max-w-6xl mx-auto px-4 py-6 text-sm text-slate-600">
            © {new Date().getFullYear()} Clínica 2 de Mayo
          </div>
        </footer>
      </div>
    </BrowserRouter>
  )
}
