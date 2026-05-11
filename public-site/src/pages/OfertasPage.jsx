import React, { useEffect, useState } from 'react'
import { getOfertas } from '../api/publicApi'
import { resolvePublicAssetUrl } from '../utils/publicAssetUrl'
import AddToCartButton from '../components/ShoppingCart/AddToCartButton'

function formatDateLabel(value) {
  if (!value) return ''
  const parsed = new Date(`${value}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString('es-PE')
}

function getVigenciaLabel(oferta) {
  if (oferta?.vigencia) return oferta.vigencia
  if (oferta?.fecha_inicio && oferta?.fecha_fin) {
    return `${formatDateLabel(oferta.fecha_inicio)} al ${formatDateLabel(oferta.fecha_fin)}`
  }
  if (oferta?.fecha_inicio) return `Desde ${formatDateLabel(oferta.fecha_inicio)}`
  if (oferta?.fecha_fin) return `Hasta ${formatDateLabel(oferta.fecha_fin)}`
  return 'Vigencia permanente'
}

function getVigenciaTone(oferta) {
  if (oferta?.fecha_inicio && oferta?.fecha_fin) {
    return {
      background: 'linear-gradient(135deg, var(--color-primary-light, #fde7ef), #ffffff)',
      borderColor: 'var(--color-primary, #E85D8E)',
      color: 'var(--color-primary-dark, #9c174d)',
      badgeBg: 'var(--color-primary, #E85D8E)',
    }
  }
  return {
    background: 'linear-gradient(135deg, rgba(58, 79, 163, 0.12), #ffffff)',
    borderColor: 'var(--color-secondary, #3A4FA3)',
    color: 'var(--color-secondary, #3A4FA3)',
    badgeBg: 'var(--color-secondary, #3A4FA3)',
  }
}

export default function OfertasPage({ configuracion = {} }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [ofertas, setOfertas] = useState([])

  const variants = [
    { wrapStyle: { background: 'rgba(255,255,255,0.82)', borderColor: 'color-mix(in srgb, var(--color-primary, #2563eb) 20%, white)', boxShadow: '0 0 0 1px color-mix(in srgb, var(--color-primary-light, #dbeafe) 65%, white)' }, priceStyle: { color: 'var(--color-primary-dark, #1d4ed8)' } },
    { wrapStyle: { background: 'rgba(255,255,255,0.82)', borderColor: 'color-mix(in srgb, var(--color-secondary, #4f46e5) 18%, white)', boxShadow: '0 0 0 1px color-mix(in srgb, var(--color-accent, #c4b5fd) 45%, white)' }, priceStyle: { color: 'var(--color-secondary, #4f46e5)' } },
    { wrapStyle: { background: 'rgba(255,255,255,0.82)', borderColor: 'color-mix(in srgb, #22c55e 18%, white)', boxShadow: '0 0 0 1px color-mix(in srgb, #bbf7d0 56%, white)' }, priceStyle: { color: '#15803d' } },
    { wrapStyle: { background: 'rgba(255,255,255,0.82)', borderColor: 'color-mix(in srgb, #f59e0b 18%, white)', boxShadow: '0 0 0 1px color-mix(in srgb, #fde68a 60%, white)' }, priceStyle: { color: '#b45309' } },
    { wrapStyle: { background: 'rgba(255,255,255,0.82)', borderColor: 'color-mix(in srgb, #fb7185 18%, white)', boxShadow: '0 0 0 1px color-mix(in srgb, #fecdd3 58%, white)' }, priceStyle: { color: '#be123c' } },
    { wrapStyle: { background: 'rgba(255,255,255,0.82)', borderColor: 'color-mix(in srgb, var(--color-secondary, #4f46e5) 18%, white)', boxShadow: '0 0 0 1px color-mix(in srgb, var(--color-primary-light, #dbeafe) 48%, white)' }, priceStyle: { color: 'var(--color-secondary, #4f46e5)' } },
  ]

  useEffect(() => {
    let cancelled = false
    async function run() {
      setLoading(true)
      setError('')
      try {
        const data = await getOfertas()
        if (cancelled) return
        setOfertas(data)
      } catch (e) {
        if (cancelled) return
        setError(e?.message || 'No se pudo cargar las ofertas')
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
      <h1 className="text-2xl font-bold">Ofertas</h1>

      {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        )}

      {loading ? (
          <div className="text-sm text-slate-600">Cargando…</div>
        ) : ofertas.length === 0 ? (
          <div className="text-sm text-slate-600">Aún no hay ofertas publicadas.</div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {ofertas.map((o, idx) => {
              const v = variants[idx % variants.length]
              const vigenciaTone = getVigenciaTone(o)
              return (
              <article key={o.id} className="rounded-2xl border p-5 transition hover:shadow-sm" style={v.wrapStyle}>
                <h2 className="font-semibold">{o.titulo}</h2>
                {o.descripcion ? <p className="mt-2 text-sm text-slate-700">{o.descripcion}</p> : null}
                {o.imagen_url ? (
                  <img
                    src={resolvePublicAssetUrl(o.imagen_url)}
                    alt={o.titulo}
                    className="w-full h-44 object-cover rounded-xl mt-4"
                    loading="lazy"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none'
                    }}
                  />
                ) : null}
                {o.precio_oferta ? (
                  <p className="mt-3 text-sm">
                    <span className="font-semibold" style={v.priceStyle}>S/ {o.precio_oferta}</span>
                    {o.precio_antes ? <span className="ml-2 text-slate-500 line-through">S/ {o.precio_antes}</span> : null}
                  </p>
                ) : null}
                <div
                  className="mt-3 rounded-xl border px-3 py-2 text-xs"
                  style={{
                    background: vigenciaTone.background,
                    borderColor: vigenciaTone.borderColor,
                    color: vigenciaTone.color,
                  }}
                >
                  <span
                    className="mr-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
                    style={{ backgroundColor: vigenciaTone.badgeBg }}
                  >
                    Vigencia
                  </span>
                  <span className="font-semibold">{getVigenciaLabel(o)}</span>
                </div>

                <AddToCartButton oferta={o} />
              </article>
              )
            })}
          </div>
        )}
    </div>
  )
}
