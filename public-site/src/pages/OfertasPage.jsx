import React, { useEffect, useState } from 'react'
import { getOfertas } from '../api/publicApi'

export default function OfertasPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [ofertas, setOfertas] = useState([])

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
          {ofertas.map((o) => (
            <article key={o.id} className="rounded-2xl border bg-white p-5">
              <h2 className="font-semibold">{o.titulo}</h2>
              {o.descripcion ? <p className="mt-2 text-sm text-slate-700">{o.descripcion}</p> : null}
              {o.precio_oferta ? (
                <p className="mt-3 text-sm">
                  <span className="font-semibold">S/ {o.precio_oferta}</span>
                  {o.precio_antes ? <span className="ml-2 text-slate-500 line-through">S/ {o.precio_antes}</span> : null}
                </p>
              ) : null}
              {o.vigencia ? <p className="mt-2 text-xs text-slate-600">Vigencia: {o.vigencia}</p> : null}
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
