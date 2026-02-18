import React, { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PUBLIC_API_BASE } from '../api/publicApi'

function resolvePublicUrl(maybePath) {
  const s = (maybePath || '').trim()
  if (!s) return ''
  if (/^https?:\/\//i.test(s)) return s
  return (PUBLIC_API_BASE + s.replace(/^\/+/, '')).replace(/\s+/g, '')
}

function IconMail(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 4h16v16H4z" />
      <path d="m22 6-10 7L2 6" />
    </svg>
  )
}

function IconPhone(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.86 19.86 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.86 19.86 0 0 1 2.08 4.18 2 2 0 0 1 4.06 2h3a2 2 0 0 1 2 1.72c.12.86.3 1.7.54 2.5a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.58-1.06a2 2 0 0 1 2.11-.45c.8.24 1.64.42 2.5.54A2 2 0 0 1 22 16.92z" />
    </svg>
  )
}

function IconMapPin(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  )
}

function IconClock(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  )
}

function normalizeLines(text) {
  const s = (text || '').trim()
  if (!s) return []
  return s
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean)
}

export default function PublicFooter({ configuracion, sistemaUrl }) {
  const cfg = configuracion || {}
  const fallbackLogoSrc = `${import.meta.env.BASE_URL}2demayo.svg`
  const configuredLogoSrc = resolvePublicUrl(cfg.logo_url)
  const [logoFailed, setLogoFailed] = useState(false)
  const logoSrc = !logoFailed && configuredLogoSrc ? configuredLogoSrc : fallbackLogoSrc
  const nombre = (cfg.nombre_clinica || 'Clínica 2 de Mayo').trim()
  const direccion = (cfg.direccion || '').trim()
  const telefono = (cfg.telefono || '').trim()
  const email = (cfg.email || '').trim()
  const emergencias = (cfg.contacto_emergencias || '').trim()
  const website = (cfg.website || '').trim()

  const horarioLines = useMemo(() => normalizeLines(cfg.horario_atencion), [cfg.horario_atencion])

  return (
    <footer className="border-t border-white/15 bg-gradient-to-r from-slate-950 via-slate-900 to-blue-950 text-white">
      <div className="max-w-6xl mx-auto px-4 py-10">
        <div className="grid lg:grid-cols-4 gap-8">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-14 w-14 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center overflow-hidden">
                <img
                  src={logoSrc}
                  alt={nombre}
                  className="h-12 w-12 object-contain"
                  onError={() => setLogoFailed(true)}
                />
              </div>
              <div>
                <div className="text-lg font-semibold leading-tight">{nombre}</div>
                <div className="text-sm text-white/70">Servicios y ofertas</div>
              </div>
            </div>
            <div className="text-sm text-white/70">
              © {new Date().getFullYear()} {nombre}
            </div>
          </div>

          <div>
            <div className="text-base font-semibold">Enlaces rápidos</div>
            <div className="mt-3 space-y-2 text-sm">
              <Link to="/" className="block text-white/70 hover:text-white">Inicio</Link>
              <Link to="/servicios" className="block text-white/70 hover:text-white">Servicios</Link>
              <Link to="/ofertas" className="block text-white/70 hover:text-white">Ofertas</Link>
              <a href={sistemaUrl} className="block text-white/70 hover:text-white" rel="noopener noreferrer">
                Iniciar sesión
              </a>
            </div>
          </div>

          <div>
            <div className="text-base font-semibold">Contacto</div>
            <div className="mt-3 space-y-3 text-sm">
              {email ? (
                <a
                  href={`mailto:${email}`}
                  className="flex items-center gap-2 text-white/70 hover:text-white"
                >
                  <span className="h-8 w-8 rounded-full bg-white/10 border border-white/15 flex items-center justify-center">
                    <IconMail className="h-4 w-4" />
                  </span>
                  <span>{email}</span>
                </a>
              ) : null}

              {telefono ? (
                <a
                  href={`tel:${telefono.replace(/\s+/g, '')}`}
                  className="flex items-center gap-2 text-white/70 hover:text-white"
                >
                  <span className="h-8 w-8 rounded-full bg-white/10 border border-white/15 flex items-center justify-center">
                    <IconPhone className="h-4 w-4" />
                  </span>
                  <span>{telefono}</span>
                </a>
              ) : null}

              {emergencias ? (
                <div className="flex items-center gap-2 text-white/70">
                  <span className="h-8 w-8 rounded-full bg-white/10 border border-white/15 flex items-center justify-center">
                    <IconPhone className="h-4 w-4" />
                  </span>
                  <span>{emergencias}</span>
                </div>
              ) : null}

              {direccion ? (
                <div className="flex items-start gap-2 text-white/70">
                  <span className="mt-0.5 h-8 w-8 rounded-full bg-white/10 border border-white/15 flex items-center justify-center">
                    <IconMapPin className="h-4 w-4" />
                  </span>
                  <span className="leading-snug">{direccion}</span>
                </div>
              ) : null}
            </div>
          </div>

          <div>
            <div className="text-base font-semibold">Información</div>
            <div className="mt-3 space-y-3 text-sm text-white/70">
              {horarioLines.length ? (
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 h-8 w-8 rounded-full bg-white/10 border border-white/15 flex items-center justify-center">
                    <IconClock className="h-4 w-4" />
                  </span>
                  <div className="leading-snug">
                    {horarioLines.map((line) => (
                      <div key={line}>{line}</div>
                    ))}
                  </div>
                </div>
              ) : null}

              {website ? (
                <a
                  href={/^https?:\/\//i.test(website) ? website : `https://${website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-white/70 hover:text-white"
                >
                  <span className="h-8 w-8 rounded-full bg-white/10 border border-white/15 flex items-center justify-center">
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M2 12h20" />
                      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                    </svg>
                  </span>
                  <span>Sitio web</span>
                </a>
              ) : null}

              {cfg.ruc ? <div>RUC: {cfg.ruc}</div> : null}
            </div>
          </div>
        </div>

        <div className="mt-10 border-t border-white/15 pt-6 text-xs text-white/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div>Todos los derechos reservados.</div>
          <div>Hecho para {nombre}</div>
        </div>
      </div>
    </footer>
  )
}
