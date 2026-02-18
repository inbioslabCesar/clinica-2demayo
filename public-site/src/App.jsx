import React, { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, NavLink, Link, useLocation } from 'react-router-dom'
import HomePage from './pages/HomePage.jsx'
import ServiciosPage from './pages/ServiciosPage.jsx'
import OfertasPage from './pages/OfertasPage.jsx'
import PublicFooter from './components/PublicFooter.jsx'
import { getConfiguracion } from './api/publicApi.js'

function getDefaultSistemaUrl() {
  const hostname = window.location.hostname
  if (hostname === 'localhost' || hostname === '127.0.0.1') return 'http://localhost:5173/'
  return 'https://sistema.clinica2demayo.com/'
}

const SISTEMA_URL = ((import.meta.env.VITE_SISTEMA_URL || getDefaultSistemaUrl()) + '').replace(/\/+$/, '') + '/'

function NavItem({ to, children }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `px-3 py-2 rounded-lg text-xl font-semibold transition-colors ${
          isActive ? 'bg-blue-50 text-blue-800' : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
        }`
      }
      end
    >
      {children}
    </NavLink>
  )
}

function MobileNavItem({ to, children, onClick }) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) =>
        `block w-full px-4 py-3 rounded-xl text-lg font-semibold transition-colors ${
          isActive ? 'bg-blue-50 text-blue-800' : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
        }`
      }
      end
    >
      {children}
    </NavLink>
  )
}

function IconMenu(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 6h16" />
      <path d="M4 12h16" />
      <path d="M4 18h16" />
    </svg>
  )
}

function IconClose(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M18 6 6 18" />
      <path d="M6 6l12 12" />
    </svg>
  )
}

function AppShell({ configuracion, publicLogoSrc }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!mobileOpen) return
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setMobileOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [mobileOpen])

  return (
    <div className="min-h-screen relative text-slate-900 overflow-x-hidden">
      <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-indigo-600 via-purple-700 to-emerald-400" />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-white/10" />

      <div className="relative">
        <header className="fixed top-0 inset-x-0 z-50 border-b border-white/30 bg-white/80 backdrop-blur">
          <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
            <Link to="/" className="flex items-center gap-3">
              <img src={publicLogoSrc} alt="Clínica 2 de Mayo" className="w-16 h-16" />
              <div className="leading-tight">
                <div className="text-lg font-semibold">Clínica 2 de Mayo</div>
                <div className="text-lg text-slate-600">Servicios y ofertas</div>
              </div>
            </Link>

            <div className="flex items-center gap-2">
              <nav className="hidden md:flex items-center gap-2">
                <NavItem to="/">Inicio</NavItem>
                <NavItem to="/servicios">Servicios</NavItem>
                <NavItem to="/ofertas">Ofertas</NavItem>
              </nav>

              <a
                href={SISTEMA_URL}
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-purple-700 to-blue-600 text-white text-xl font-semibold hover:from-purple-800 hover:to-blue-700 transition-colors"
                rel="noopener noreferrer"
              >
                Iniciar sesión
              </a>

              <button
                type="button"
                className="md:hidden p-2 rounded-lg hover:bg-slate-100 text-slate-800"
                aria-label={mobileOpen ? 'Cerrar menú' : 'Abrir menú'}
                aria-expanded={mobileOpen}
                onClick={() => setMobileOpen((v) => !v)}
              >
                {mobileOpen ? <IconClose className="w-7 h-7" /> : <IconMenu className="w-7 h-7" />}
              </button>
            </div>
          </div>
        </header>

        <div className={`md:hidden fixed inset-0 z-50 ${mobileOpen ? '' : 'pointer-events-none'}`}>
          <button
            type="button"
            aria-label="Cerrar menú"
            className={`absolute inset-0 bg-black/40 transition-opacity ${mobileOpen ? 'opacity-100' : 'opacity-0'}`}
            onClick={() => setMobileOpen(false)}
          />

          <aside
            className={`absolute right-0 top-0 h-full w-80 max-w-[85vw] border-l border-white/30 bg-white/95 backdrop-blur transition-transform ${
              mobileOpen ? 'translate-x-0' : 'translate-x-full'
            }`}
            role="dialog"
            aria-modal="true"
            aria-label="Menú"
          >
            <div className="h-24 px-4 flex items-center justify-between border-b border-slate-200/70">
              <div className="font-semibold text-xl">Menú</div>
              <button
                type="button"
                className="p-2 rounded-lg hover:bg-slate-100 text-slate-800"
                aria-label="Cerrar menú"
                onClick={() => setMobileOpen(false)}
              >
                <IconClose className="w-6 h-6" />
              </button>
            </div>

            <div className="p-3">
              <MobileNavItem to="/" onClick={() => setMobileOpen(false)}>
                Inicio
              </MobileNavItem>
              <MobileNavItem to="/servicios" onClick={() => setMobileOpen(false)}>
                Servicios
              </MobileNavItem>
              <MobileNavItem to="/ofertas" onClick={() => setMobileOpen(false)}>
                Ofertas
              </MobileNavItem>

              <div className="my-3 border-t border-slate-200/70" />

              <a
                href={SISTEMA_URL}
                className="block w-full text-center px-4 py-3 rounded-xl bg-gradient-to-r from-purple-700 to-blue-600 text-white text-lg font-semibold hover:from-purple-800 hover:to-blue-700 transition-colors"
                rel="noopener noreferrer"
                onClick={() => setMobileOpen(false)}
              >
                Iniciar sesión
              </a>
            </div>
          </aside>
        </div>

        <main className="max-w-6xl mx-auto px-4 pt-28 pb-8">
          <Routes>
            <Route path="/" element={<HomePage sistemaUrl={SISTEMA_URL} />} />
            <Route path="/servicios" element={<ServiciosPage />} />
            <Route path="/ofertas" element={<OfertasPage />} />
          </Routes>
        </main>

        <PublicFooter configuracion={configuracion} sistemaUrl={SISTEMA_URL} />
      </div>
    </div>
  )
}

export default function App() {
  const [configuracion, setConfiguracion] = useState(null)
  const publicLogoSrc = `${import.meta.env.BASE_URL}2demayo.svg`

  useEffect(() => {
    let cancelled = false
    getConfiguracion()
      .then((cfg) => {
        if (!cancelled) setConfiguracion(cfg)
      })
      .catch(() => {
        if (!cancelled) setConfiguracion(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <BrowserRouter>
      <AppShell configuracion={configuracion} publicLogoSrc={publicLogoSrc} />
    </BrowserRouter>
  )
}
