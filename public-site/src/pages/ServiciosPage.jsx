import React, { useEffect, useState } from 'react'
import { getServicios } from '../api/publicApi'
import ServiceIcon from '../components/ServiceIcon'
import ConsultButton from '../components/ShoppingCart/ConsultButton'

export default function ServiciosPage({ configuracion = {} }) {
  // Normalizar número de WhatsApp para wa.me
  function normalizePhone(raw) {
    let digits = String(raw || '').replace(/\D/g, '')
    if (!digits) return ''
    if (digits.startsWith('0')) digits = digits.slice(1)
    if (digits.length === 9 && digits.startsWith('9')) digits = '51' + digits
    return digits
  }
  const whatsappNumero = normalizePhone(configuracion?.celular)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [servicios, setServicios] = useState([])

  const variants = [
    {
      wrapStyle: {
        background: 'rgba(255,255,255,0.82)',
        borderColor: 'color-mix(in srgb, var(--color-primary, #2563eb) 20%, white)',
        boxShadow: '0 0 0 1px color-mix(in srgb, var(--color-primary-light, #dbeafe) 65%, white)',
      },
      iconWrapStyle: {
        backgroundColor: 'color-mix(in srgb, var(--color-primary-light, #dbeafe) 72%, white)',
        borderColor: 'color-mix(in srgb, var(--color-primary, #2563eb) 24%, white)',
      },
      iconStyle: { color: 'var(--color-primary-dark, #1d4ed8)' },
    },
    {
      wrapStyle: {
        background: 'rgba(255,255,255,0.82)',
        borderColor: 'color-mix(in srgb, var(--color-secondary, #4f46e5) 18%, white)',
        boxShadow: '0 0 0 1px color-mix(in srgb, var(--color-accent, #c4b5fd) 45%, white)',
      },
      iconWrapStyle: {
        backgroundColor: 'color-mix(in srgb, var(--color-accent, #ddd6fe) 26%, white)',
        borderColor: 'color-mix(in srgb, var(--color-secondary, #4f46e5) 20%, white)',
      },
      iconStyle: { color: 'var(--color-secondary, #4f46e5)' },
    },
    {
      wrapStyle: {
        background: 'rgba(255,255,255,0.82)',
        borderColor: 'color-mix(in srgb, var(--color-primary, #2563eb) 14%, white)',
        boxShadow: '0 0 0 1px color-mix(in srgb, #86efac 55%, white)',
      },
      iconWrapStyle: {
        backgroundColor: 'color-mix(in srgb, #dcfce7 78%, white)',
        borderColor: 'color-mix(in srgb, #22c55e 22%, white)',
      },
      iconStyle: { color: '#15803d' },
    },
    {
      wrapStyle: {
        background: 'rgba(255,255,255,0.82)',
        borderColor: 'color-mix(in srgb, #f59e0b 18%, white)',
        boxShadow: '0 0 0 1px color-mix(in srgb, #fde68a 62%, white)',
      },
      iconWrapStyle: {
        backgroundColor: 'color-mix(in srgb, #fef3c7 80%, white)',
        borderColor: 'color-mix(in srgb, #f59e0b 22%, white)',
      },
      iconStyle: { color: '#b45309' },
    },
    {
      wrapStyle: {
        background: 'rgba(255,255,255,0.82)',
        borderColor: 'color-mix(in srgb, #fb7185 18%, white)',
        boxShadow: '0 0 0 1px color-mix(in srgb, #fecdd3 56%, white)',
      },
      iconWrapStyle: {
        backgroundColor: 'color-mix(in srgb, #ffe4e6 82%, white)',
        borderColor: 'color-mix(in srgb, #fb7185 20%, white)',
      },
      iconStyle: { color: '#be123c' },
    },
    {
      wrapStyle: {
        background: 'rgba(255,255,255,0.82)',
        borderColor: 'color-mix(in srgb, var(--color-secondary, #4f46e5) 18%, white)',
        boxShadow: '0 0 0 1px color-mix(in srgb, var(--color-primary-light, #dbeafe) 48%, white)',
      },
      iconWrapStyle: {
        backgroundColor: 'color-mix(in srgb, var(--color-primary-light, #eef2ff) 74%, white)',
        borderColor: 'color-mix(in srgb, var(--color-secondary, #4f46e5) 20%, white)',
      },
      iconStyle: { color: 'var(--color-secondary, #4f46e5)' },
    },
  ]
  useEffect(() => {
    let cancelled = false
    async function run() {
      setLoading(true)
      setError('')
      try {
        const data = await getServicios()
        if (cancelled) return
        setServicios(data)
      } catch (e) {
        if (cancelled) return
        setError(e?.message || 'No se pudo cargar los servicios')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Servicios</h1>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="text-sm text-slate-600">Cargando…</div>
      ) : servicios.length === 0 ? (
        <div className="text-sm text-slate-600">Aún no hay servicios publicados.</div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {servicios.map((s, idx) => {
            const v = variants[idx % variants.length]
            return (
              <article
                key={s.id}
                className="rounded-2xl border p-5 transition hover:shadow-sm"
                style={v.wrapStyle}
              >
                <div className="flex items-start gap-3">
                  <div className="shrink-0 h-12 w-12 rounded-2xl border flex items-center justify-center" style={v.iconWrapStyle}>
                    <ServiceIcon name={s.icono} className="text-xl" style={v.iconStyle} />
                  </div>
                  <div className="min-w-0">
                    <h2 className="font-semibold">{s.titulo}</h2>
                    {s.descripcion ? <p className="mt-1 text-sm text-slate-700">{s.descripcion}</p> : null}
                  </div>
                </div>

                {s.imagen_url ? (
                  <img
                    src={s.imagen_url}
                    alt={s.titulo}
                    className="w-full h-44 object-cover rounded-xl mt-4"
                    loading="lazy"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none'
                    }}
                  />
                ) : null}

                {s.precio ? <p className="mt-4 text-sm font-semibold">S/ {s.precio}</p> : null}

                <ConsultButton nombreServicio={s.titulo} whatsappNumero={whatsappNumero} />
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
