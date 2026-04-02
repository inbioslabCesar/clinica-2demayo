import React, { useEffect, useState } from 'react'
import { getOfertas } from '../api/publicApi'

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

export default function OfertasPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [ofertas, setOfertas] = useState([])

  const variants = [
    { wrap: 'bg-white/80 backdrop-blur border-white/40 ring-1 ring-blue-200/60 hover:bg-white/90 hover:ring-blue-300/60', price: 'text-blue-800' },
    { wrap: 'bg-white/80 backdrop-blur border-white/40 ring-1 ring-purple-200/60 hover:bg-white/90 hover:ring-purple-300/60', price: 'text-purple-800' },
    { wrap: 'bg-white/80 backdrop-blur border-white/40 ring-1 ring-emerald-200/60 hover:bg-white/90 hover:ring-emerald-300/60', price: 'text-emerald-800' },
    { wrap: 'bg-white/80 backdrop-blur border-white/40 ring-1 ring-amber-200/60 hover:bg-white/90 hover:ring-amber-300/60', price: 'text-amber-800' },
    { wrap: 'bg-white/80 backdrop-blur border-white/40 ring-1 ring-rose-200/60 hover:bg-white/90 hover:ring-rose-300/60', price: 'text-rose-800' },
    { wrap: 'bg-white/80 backdrop-blur border-white/40 ring-1 ring-indigo-200/60 hover:bg-white/90 hover:ring-indigo-300/60', price: 'text-indigo-800' },
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
            <article key={o.id} className={`rounded-2xl border p-5 transition hover:shadow-sm ${v.wrap}`}>
              <h2 className="font-semibold">{o.titulo}</h2>
              {o.descripcion ? <p className="mt-2 text-sm text-slate-700">{o.descripcion}</p> : null}
              {o.precio_oferta ? (
                <p className="mt-3 text-sm">
                  <span className={`font-semibold ${v.price}`}>S/ {o.precio_oferta}</span>
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
            </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
