import { useEffect, useRef, useState } from 'react'
import { accesosDisponibles, hayAccesosExternos } from '../utils/accesos.js'

function IconPaciente(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
    </svg>
  )
}

function IconPersonal(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M6 3v6a4 4 0 0 0 8 0V3" />
      <path d="M10 13v2a5 5 0 0 0 10 0v-1" />
      <circle cx="20" cy="12" r="2" />
    </svg>
  )
}

function IconEmpresa(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <rect x="5" y="3" width="14" height="18" rx="1" />
      <path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2" />
    </svg>
  )
}

function IconChevron(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

const ICONOS = { paciente: IconPaciente, personal: IconPersonal, empresa: IconEmpresa }

/**
 * Botón "Iniciar sesión". Sin servicios externos activos es el enlace de siempre al sistema;
 * con alguno activo abre el menú "Iniciar sesión como:".
 */
export default function AccesoMenu({ sistemaUrl, portales, label = 'Iniciar sesión', className = '', style, align = 'right' }) {
  const [abierto, setAbierto] = useState(false)
  const contenedor = useRef(null)

  useEffect(() => {
    if (!abierto) return undefined
    const alClickFuera = (e) => {
      if (contenedor.current && !contenedor.current.contains(e.target)) setAbierto(false)
    }
    const alTeclear = (e) => {
      if (e.key === 'Escape') setAbierto(false)
    }
    document.addEventListener('mousedown', alClickFuera)
    document.addEventListener('keydown', alTeclear)
    return () => {
      document.removeEventListener('mousedown', alClickFuera)
      document.removeEventListener('keydown', alTeclear)
    }
  }, [abierto])

  if (!hayAccesosExternos(portales)) {
    return (
      <a href={sistemaUrl} className={className} style={style} rel="noopener noreferrer">
        {label}
      </a>
    )
  }

  const accesos = accesosDisponibles(sistemaUrl, portales)

  return (
    <div ref={contenedor} className="relative inline-block">
      <button
        type="button"
        className={`${className} inline-flex items-center justify-center gap-1.5 whitespace-nowrap`}
        style={style}
        aria-haspopup="menu"
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
      >
        {label}
        <IconChevron className={`w-4 h-4 transition-transform ${abierto ? 'rotate-180' : ''}`} />
      </button>

      {abierto && (
        <div
          role="menu"
          className={`absolute z-[70] mt-2 w-72 max-w-[85vw] rounded-2xl border border-slate-200 bg-white text-slate-800 shadow-xl overflow-hidden ${align === 'left' ? 'left-0' : 'right-0'}`}
        >
          <div className="px-4 pt-3 pb-2 text-sm font-semibold text-slate-900">Iniciar sesión como:</div>
          {accesos.map(({ clave, titulo, detalle, href }) => {
            const Icono = ICONOS[clave]
            return (
              <a
                key={clave}
                href={href}
                role="menuitem"
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-4 py-3 border-t border-slate-100 hover:bg-slate-50 transition-colors"
                onClick={() => setAbierto(false)}
              >
                <Icono className="w-5 h-5 shrink-0" style={{ color: 'var(--color-primary, #E85D8E)' }} />
                <span className="leading-tight">
                  <span className="block text-base font-medium">{titulo}</span>
                  <span className="block text-xs text-slate-500">{detalle}</span>
                </span>
              </a>
            )
          })}
        </div>
      )}
    </div>
  )
}
