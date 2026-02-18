import React, { useEffect, useState } from 'react'
import { getOfertas } from '../api/publicApi'

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
              {o.vigencia ? <p className="mt-2 text-xs text-slate-600">Vigencia: {o.vigencia}</p> : null}
            </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
