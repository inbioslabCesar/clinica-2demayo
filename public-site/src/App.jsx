import React, { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, NavLink, Link, useLocation } from 'react-router-dom'
import HomePage from './pages/HomePage.jsx'
import HomePageLanding from './pages/HomePageLanding.jsx'
import ConocenosPage from './pages/ConocenosPage.jsx'
import ServiciosPage from './pages/ServiciosPage.jsx'
import OfertasPage from './pages/OfertasPage.jsx'
import PublicFooter from './components/PublicFooter.jsx'
import { getConfiguracion, PUBLIC_API_BASE } from './api/publicApi.js'
import { resolvePublicLogoSize } from './utils/logoSizing.js'
import { sanitizeFontSize, sanitizeHexColor } from './utils/branding.js'

const PUBLIC_BRAND_CACHE_KEY = 'public_brand_cache'
const PUBLIC_THEME_CACHE_KEY = 'public_theme_cache'
const PUBLIC_CONFIG_CACHE_KEY = 'public_config_cache'
const FALLBACK_PUBLIC_LOGO = `${import.meta.env.BASE_URL}2demayo.svg`

function readStorageValue(key) {
  try {
    const fromLocal = localStorage.getItem(key)
    if (fromLocal) return fromLocal
  } catch {}

  try {
    const fromSession = sessionStorage.getItem(key)
    if (fromSession) return fromSession
  } catch {}

  return null
}

function writeStorageValue(key, value) {
  try { localStorage.setItem(key, value) } catch {}
  try { sessionStorage.setItem(key, value) } catch {}
}

function applyPublicThemeToDom(tema) {
  const root = document.documentElement
  root.style.setProperty('--color-primary', tema.tema_primary || '#7c3aed')
  root.style.setProperty('--color-primary-dark', tema.tema_primary_dark || '#5b21b6')
  root.style.setProperty('--color-primary-light', tema.tema_primary_light || '#ede9fe')
  root.style.setProperty('--color-secondary', tema.tema_secondary || '#4338ca')
  root.style.setProperty('--color-accent', tema.tema_accent || '#6366f1')
  root.style.setProperty('--color-navbar-bg', tema.tema_navbar_bg || '#6b21a8')
  root.style.setProperty('--color-sidebar-from', tema.tema_sidebar_from || '#9333ea')
  root.style.setProperty('--color-sidebar-via', tema.tema_sidebar_via || '#7e22ce')
  root.style.setProperty('--color-sidebar-to', tema.tema_sidebar_to || '#3730a3')
  root.style.setProperty('--color-login-from', tema.tema_login_from || '#1e3a8a')
  root.style.setProperty('--color-login-via', tema.tema_login_via || '#6b21a8')
  root.style.setProperty('--color-login-to', tema.tema_login_to || '#312e81')
}

function readPublicThemeCache() {
  try {
    const raw = readStorageValue(PUBLIC_THEME_CACHE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function writePublicThemeCache(tema) {
  try { writeStorageValue(PUBLIC_THEME_CACHE_KEY, JSON.stringify(tema)) } catch {}
}

function readConfigCache() {
  try {
    const raw = readStorageValue(PUBLIC_CONFIG_CACHE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function writeConfigCache(cfg) {
  try { writeStorageValue(PUBLIC_CONFIG_CACHE_KEY, JSON.stringify(cfg)) } catch {}
}

function readPublicBrandCache() {
  try {
    const raw = readStorageValue(PUBLIC_BRAND_CACHE_KEY)
    if (!raw) return { nombre: '', logo_url: '', updated_at: '', resolved_logo_src: '' }
    const parsed = JSON.parse(raw)
    return {
      nombre: String(parsed?.nombre || '').trim(),
      logo_url: String(parsed?.logo_url || '').trim(),
      updated_at: String(parsed?.updated_at || '').trim(),
      resolved_logo_src: String(parsed?.resolved_logo_src || '').trim(),
    }
  } catch {
    return { nombre: '', logo_url: '', updated_at: '', resolved_logo_src: '' }
  }
}

function writePublicBrandCache(partial) {
  const prev = readPublicBrandCache()
  const next = {
    nombre: typeof partial?.nombre === 'string' ? partial.nombre : prev.nombre,
    logo_url: typeof partial?.logo_url === 'string' ? partial.logo_url : prev.logo_url,
    updated_at: typeof partial?.updated_at === 'string' ? partial.updated_at : prev.updated_at,
    resolved_logo_src: typeof partial?.resolved_logo_src === 'string' ? partial.resolved_logo_src : prev.resolved_logo_src,
  }
  writeStorageValue(PUBLIC_BRAND_CACHE_KEY, JSON.stringify(next))
}

function preloadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(src)
    img.onerror = reject
    img.src = src
  })
}

// Apply cached theme as early as possible to avoid first-paint color flash.
const BOOTSTRAP_PUBLIC_THEME = readPublicThemeCache()
if (BOOTSTRAP_PUBLIC_THEME) {
  applyPublicThemeToDom(BOOTSTRAP_PUBLIC_THEME)
}

function applyFavicon(iconHref) {
  const fallback = FALLBACK_PUBLIC_LOGO
  const href = (iconHref || '').trim() || fallback
  let link = document.querySelector("link[rel='icon']")
  if (!link) {
    link = document.createElement('link')
    link.rel = 'icon'
    document.head.appendChild(link)
  }
  link.href = href
}

function resolvePublicLogoUrl(logoPath, versionToken) {
  const fallback = FALLBACK_PUBLIC_LOGO
  const raw = (logoPath || '').trim()
  if (!raw) return fallback
  let url = raw
  if (!/^(https?:\/\/|data:|blob:)/i.test(raw)) {
    url = (PUBLIC_API_BASE + raw.replace(/^\/+/, '')).replace(/\s+/g, '')
  }
  const v = encodeURIComponent(String(versionToken || ''))
  if (!v) return url
  return `${url}${url.includes('?') ? '&' : '?'}v=${v}`
}

function normalizeThemePayload(rawTheme) {
  if (!rawTheme || typeof rawTheme !== 'object') return null
  return rawTheme
}

function getDefaultSistemaUrl() {
  const hostname = window.location.hostname
  if (hostname === 'localhost' || hostname === '127.0.0.1') return 'http://localhost:5173/'

  const normalizedHost = hostname.replace(/^www\./i, '')
  if (/^sistema\./i.test(normalizedHost)) {
    return `${window.location.protocol}//${normalizedHost}/`
  }

  return `https://sistema.${normalizedHost}/`
}

const SISTEMA_URL = ((import.meta.env.VITE_SISTEMA_URL || getDefaultSistemaUrl()) + '').replace(/\/+$/, '') + '/'

function NavItem({ to, children }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `px-3 py-1.5 rounded-lg text-base font-semibold transition-colors ${
          isActive ? '' : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
        }`
      }
      style={({ isActive }) => isActive ? { backgroundColor: 'var(--color-primary-light, #eff6ff)', color: 'var(--color-primary, #E85D8E)' } : {}}
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
        `block w-full px-4 py-2.5 rounded-xl text-base font-semibold transition-colors ${
          isActive ? '' : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
        }`
      }
      style={({ isActive }) => isActive ? { backgroundColor: 'var(--color-primary-light, #eff6ff)', color: 'var(--color-primary, #E85D8E)' } : {}}
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

function AppShell({ clinicName, publicLogoSrc, configuracion, logoSize }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()
  const safeClinicName = String(clinicName || '').trim()
  const brandNameColor = sanitizeHexColor(configuracion?.nombre_color, 'var(--color-primary, #E85D8E)')
  const brandNameFontSize = sanitizeFontSize(configuracion?.nombre_font_size, 'clamp(1.05rem,1.6vw,1.5rem)')
  const sloganColor = sanitizeHexColor(configuracion?.slogan_color, 'var(--color-secondary, #3A4FA3)')

  useEffect(() => {
    const routeLabel = location.pathname === '/servicios'
      ? 'Servicios'
      : location.pathname === '/ofertas'
        ? 'Ofertas'
        : 'Inicio'
    document.title = safeClinicName ? `${safeClinicName} - ${routeLabel}` : routeLabel
  }, [safeClinicName, location.pathname])

  useEffect(() => {
    applyFavicon(publicLogoSrc)
  }, [publicLogoSrc])

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
      <div aria-hidden className="absolute inset-0" style={{ background: 'linear-gradient(to right, var(--color-sidebar-from, #4f46e5), var(--color-sidebar-via, #7e22ce), var(--color-accent, #34d399))' }} />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-white/10" />

      <div className="relative">
        <header className="sticky top-0 inset-x-0 z-50 border-b border-white/30 bg-white/80 backdrop-blur">
          <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
            <Link to="/" className="flex items-center gap-3">
              <img
                src={publicLogoSrc}
                alt={safeClinicName || 'Portal de Salud'}
                className="object-contain shrink-0"
                style={{ height: logoSize.header, width: 'auto', maxWidth: logoSize.header * 5 }}
              />
              <div className="leading-tight">
                <div className="font-semibold" style={{ color: brandNameColor, fontSize: brandNameFontSize || 'clamp(1.05rem,1.6vw,1.5rem)' }}>{safeClinicName || 'Portal de Salud'}</div>
                <div className="text-xs sm:text-sm" style={{ color: sloganColor }}>{configuracion?.slogan || 'Servicios y ofertas'}</div>
              </div>
            </Link>

            <div className="flex items-center gap-2">
              <nav className="hidden md:flex items-center gap-1">
                <NavItem to="/">Inicio</NavItem>
                <NavItem to="/conocenos">Conócenos</NavItem>
                <NavItem to="/servicios">Servicios</NavItem>
                <NavItem to="/ofertas">Ofertas</NavItem>
              </nav>

              <a
                href={SISTEMA_URL}
                className="px-3.5 py-2 rounded-lg text-white text-sm sm:text-base font-semibold hover:opacity-90 transition-colors"
                style={{ background: 'linear-gradient(to right, var(--color-primary-dark, #7e22ce), var(--color-secondary, #2563eb))' }}
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
              <MobileNavItem to="/conocenos" onClick={() => setMobileOpen(false)}>
                Conócenos
              </MobileNavItem>

              <div className="my-3 border-t border-slate-200/70" />

              <a
                href={SISTEMA_URL}
                className="block w-full text-center px-4 py-2.5 rounded-xl text-white text-base font-semibold hover:opacity-90 transition-colors"
                style={{ background: 'linear-gradient(to right, var(--color-primary-dark, #7e22ce), var(--color-secondary, #2563eb))' }}
                rel="noopener noreferrer"
                onClick={() => setMobileOpen(false)}
              >
                Iniciar sesión
              </a>
            </div>
          </aside>
        </div>

        <main className="max-w-6xl mx-auto px-4 pt-6 pb-8">
          <Routes>
            <Route path="/" element={<HomePage sistemaUrl={SISTEMA_URL} publicLogoSrc={publicLogoSrc} clinicName={safeClinicName} configuracion={configuracion} logoSize={logoSize} />} />
            <Route path="/conocenos" element={<ConocenosPage clinicName={safeClinicName} publicLogoSrc={publicLogoSrc} logoSize={logoSize} />} />
            <Route path="/servicios" element={<ServiciosPage />} />
            <Route path="/ofertas" element={<OfertasPage />} />
          </Routes>
        </main>

        <PublicFooter configuracion={configuracion} sistemaUrl={SISTEMA_URL} logoSize={logoSize} />
      </div>
    </div>
  )
}

/* ── Landing layout shell (Design 2) ── */
function AppShellLanding({ clinicName, publicLogoSrc, configuracion, logoSize }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()
  const safeClinicName = String(clinicName || '').trim()
  const brandNameColor = sanitizeHexColor(configuracion?.nombre_color, 'var(--color-primary, #E85D8E)')
  const brandNameFontSize = sanitizeFontSize(configuracion?.nombre_font_size, '1.25rem')
  const sloganColor = sanitizeHexColor(configuracion?.slogan_color, 'var(--color-secondary, #3A4FA3)')

  useEffect(() => {
    const labels = { '/': 'Inicio', '/servicios': 'Servicios', '/ofertas': 'Ofertas', '/conocenos': 'Conócenos' }
    const label = labels[location.pathname] || 'Inicio'
    document.title = safeClinicName ? `${safeClinicName} - ${label}` : label
  }, [safeClinicName, location.pathname])

  useEffect(() => { applyFavicon(publicLogoSrc) }, [publicLogoSrc])
  useEffect(() => { setMobileOpen(false) }, [location.pathname])
  useEffect(() => {
    if (!mobileOpen) return
    const h = (e) => { if (e.key === 'Escape') setMobileOpen(false) }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [mobileOpen])

  return (
    <div className="min-h-screen bg-white text-slate-900 overflow-x-hidden">
      {/* Sticky header */}
      <header className="fixed top-0 inset-x-0 z-50 bg-white/90 backdrop-blur shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-3">
            <img
              src={publicLogoSrc}
              alt={safeClinicName}
              className="object-contain shrink-0"
              style={{ height: logoSize.landingHeader, width: 'auto', maxWidth: logoSize.landingHeader * 5 }}
            />
            <div className="hidden sm:block leading-tight">
              <span className="font-bold" style={{ color: brandNameColor, fontSize: brandNameFontSize }}>{safeClinicName || 'Portal de Salud'}</span>
              {configuracion?.slogan && (
                <div className="text-xs font-medium" style={{ color: sloganColor }}>{configuracion.slogan}</div>
              )}
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-sm font-semibold">
            <NavLink to="/" end className={({ isActive }) => isActive ? 'border-b-2 pb-0.5' : 'text-gray-600 hover:text-gray-900'} style={({ isActive }) => isActive ? { borderColor: 'var(--color-primary)', color: 'var(--color-primary)' } : {}}>Inicio</NavLink>
            <NavLink to="/servicios" className={({ isActive }) => isActive ? 'border-b-2 pb-0.5' : 'text-gray-600 hover:text-gray-900'} style={({ isActive }) => isActive ? { borderColor: 'var(--color-primary)', color: 'var(--color-primary)' } : {}}>Servicios</NavLink>
            <NavLink to="/ofertas" className={({ isActive }) => isActive ? 'border-b-2 pb-0.5' : 'text-gray-600 hover:text-gray-900'} style={({ isActive }) => isActive ? { borderColor: 'var(--color-primary)', color: 'var(--color-primary)' } : {}}>Ofertas</NavLink>
            <NavLink to="/conocenos" className={({ isActive }) => isActive ? 'border-b-2 pb-0.5' : 'text-gray-600 hover:text-gray-900'} style={({ isActive }) => isActive ? { borderColor: 'var(--color-primary)', color: 'var(--color-primary)' } : {}}>Conócenos</NavLink>
          </nav>

          <div className="flex items-center gap-2">
            <a
              href={SISTEMA_URL}
              className="px-5 py-2 rounded-full text-white text-sm font-semibold hover:opacity-90 transition shadow-md"
              style={{ backgroundColor: 'var(--color-primary, #E85D8E)' }}
              rel="noopener noreferrer"
            >
              Iniciar sesión
            </a>
            <button
              type="button"
              className="md:hidden p-2 rounded-lg hover:bg-slate-100 text-slate-800"
              aria-label={mobileOpen ? 'Cerrar menú' : 'Abrir menú'}
              onClick={() => setMobileOpen(v => !v)}
            >
              {mobileOpen ? <IconClose className="w-6 h-6" /> : <IconMenu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile nav */}
      <div className={`md:hidden fixed inset-0 z-50 ${mobileOpen ? '' : 'pointer-events-none'}`}>
        <button type="button" aria-label="Cerrar menú" className={`absolute inset-0 bg-black/40 transition-opacity ${mobileOpen ? 'opacity-100' : 'opacity-0'}`} onClick={() => setMobileOpen(false)} />
        <aside className={`absolute right-0 top-0 h-full w-80 max-w-[85vw] bg-white/95 backdrop-blur border-l border-gray-200 transition-transform ${mobileOpen ? 'translate-x-0' : 'translate-x-full'}`} role="dialog" aria-modal="true">
          <div className="h-16 px-4 flex items-center justify-between border-b border-gray-200">
            <span className="font-semibold text-lg">Menú</span>
            <button type="button" className="p-2 rounded-lg hover:bg-slate-100" onClick={() => setMobileOpen(false)}><IconClose className="w-5 h-5" /></button>
          </div>
          <div className="p-3 space-y-1">
            <MobileNavItem to="/" onClick={() => setMobileOpen(false)}>Inicio</MobileNavItem>
            <MobileNavItem to="/servicios" onClick={() => setMobileOpen(false)}>Servicios</MobileNavItem>
            <MobileNavItem to="/ofertas" onClick={() => setMobileOpen(false)}>Ofertas</MobileNavItem>
            <MobileNavItem to="/conocenos" onClick={() => setMobileOpen(false)}>Conócenos</MobileNavItem>
            <div className="my-2 border-t border-gray-200" />
            <a href={SISTEMA_URL} className="block text-center px-4 py-3 rounded-xl text-white font-semibold" style={{ backgroundColor: 'var(--color-primary, #E85D8E)' }} rel="noopener noreferrer" onClick={() => setMobileOpen(false)}>Iniciar sesión</a>
          </div>
        </aside>
      </div>

      {/* Content */}
      <main className="pt-28">
        <Routes>
          <Route path="/" element={<HomePageLanding sistemaUrl={SISTEMA_URL} publicLogoSrc={publicLogoSrc} clinicName={safeClinicName} configuracion={configuracion} logoSize={logoSize} />} />
          <Route path="/servicios" element={<ServiciosPage />} />
          <Route path="/ofertas" element={<OfertasPage />} />
          <Route path="/conocenos" element={<ConocenosPage clinicName={safeClinicName} publicLogoSrc={publicLogoSrc} logoSize={logoSize} />} />
        </Routes>
      </main>

      {/* 2-level footer */}
      <PublicFooter configuracion={configuracion} sistemaUrl={SISTEMA_URL} logoSize={logoSize} />
    </div>
  )
}

/* ── Floating WhatsApp button ── */
function WhatsAppButton({ phone }) {
  const href = `https://wa.me/${phone}`
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Contáctanos por WhatsApp"
      className="fixed bottom-6 right-6 z-[9999] w-14 h-14 rounded-full bg-[#25D366] text-white shadow-lg hover:shadow-xl hover:scale-110 transition-all duration-300 flex items-center justify-center"
    >
      <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
      </svg>
    </a>
  )
}

export default function App() {
  const cachedBrand = readPublicBrandCache()
  const cachedTheme = BOOTSTRAP_PUBLIC_THEME || readPublicThemeCache()
  const cachedConfig = readConfigCache()
  const [configuracion, setConfiguracion] = useState(cachedConfig)
  const [clinicName, setClinicName] = useState(cachedBrand.nombre || cachedConfig?.nombre_clinica || '')
  const [publicLayout, setPublicLayout] = useState(cachedTheme?.tema_public_layout || 'classic')
  const [publicLogoSrc, setPublicLogoSrc] = useState(() => {
    if (cachedBrand.resolved_logo_src) return cachedBrand.resolved_logo_src
    return resolvePublicLogoUrl(cachedBrand.logo_url, cachedBrand.updated_at)
  })
  const publicLogoSize = resolvePublicLogoSize(configuracion?.logo_size_publico)

  useEffect(() => {
    let cancelled = false

    const loadTheme = async () => {
      try {
        const separator = 'api_tema.php'.includes('?') ? '&' : '?'
        const response = await fetch(`${PUBLIC_API_BASE}api_tema.php${separator}_t=${Date.now()}`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          cache: 'no-store',
        })
        const data = await response.json().catch(() => null)
        if (cancelled || !response.ok || !data?.success || !data?.tema) return
        const theme = normalizeThemePayload(data.tema)
        if (!theme) return
        applyPublicThemeToDom(theme)
        writePublicThemeCache(theme)
        setPublicLayout(theme.tema_public_layout || 'classic')
      } catch {
        // Keep current theme if refresh fails.
      }
    }

    const loadConfig = async () => {
      try {
        const cfg = await getConfiguracion()
        if (cancelled) return

        setConfiguracion(cfg)
        writeConfigCache(cfg)

        const nombre = String(cfg?.nombre_clinica || '').trim()
        if (nombre) setClinicName(nombre)

        const logoRaw = String(cfg?.logo_url || '').trim()
        const logoVersion = String(cfg?.updated_at || cfg?.config_updated_at || '').trim()
        let resolvedLogo = resolvePublicLogoUrl(logoRaw, logoVersion)

        if (logoRaw) {
          try {
            await preloadImage(resolvedLogo)
          } catch {
            resolvedLogo = FALLBACK_PUBLIC_LOGO
          }
        }

        if (!cancelled) {
          setPublicLogoSrc((prev) => (prev === resolvedLogo ? prev : resolvedLogo))
          writePublicBrandCache({
            nombre,
            logo_url: logoRaw,
            updated_at: logoVersion,
            resolved_logo_src: resolvedLogo,
          })
        }
      } catch {
        if (!cancelled && !cachedConfig) setConfiguracion(null)
      }
    }

    const refreshPublicBranding = () => {
      loadConfig()
      loadTheme()
    }

    refreshPublicBranding()

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshPublicBranding()
      }
    }

    const handleWindowFocus = () => {
      refreshPublicBranding()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleWindowFocus)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleWindowFocus)
    }
  }, [])

  const Shell = publicLayout === 'landing' ? AppShellLanding : AppShell

  // Normalizar número a E.164 para wa.me (sin +, solo dígitos con código de país)
  function normalizePhone(raw) {
    let digits = String(raw || '').replace(/\D/g, '')
    if (!digits) return ''
    // Quitar cero inicial de marcado local (ej. 0980... → 980...)
    if (digits.startsWith('0')) digits = digits.slice(1)
    // Si tiene 9 dígitos y empieza con 9 → número peruano sin código de país → agregar 51
    if (digits.length === 9 && digits.startsWith('9')) digits = '51' + digits
    return digits
  }

  const celular = normalizePhone(configuracion?.celular)

  return (
    <BrowserRouter>
      <Shell configuracion={configuracion} clinicName={clinicName} publicLogoSrc={publicLogoSrc} logoSize={publicLogoSize} />
      {celular.length >= 10 && <WhatsAppButton phone={celular} />}
    </BrowserRouter>
  )
}
