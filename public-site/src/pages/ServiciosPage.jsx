import React, { useEffect, useState } from 'react'
import { getServicios } from '../api/publicApi'

export default function ServiciosPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [servicios, setServicios] = useState([])

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
          {servicios.map((s) => (
            <article key={s.id} className="rounded-2xl border bg-white p-5">
              {s.imagen_url ? (
                <img
                  src={s.imagen_url}
                  alt={s.titulo}
                  className="w-full h-40 object-cover rounded-xl mb-3"
                  loading="lazy"
                />
              ) : null}
              <h2 className="font-semibold">{s.titulo}</h2>
              {s.descripcion ? <p className="mt-2 text-sm text-slate-700">{s.descripcion}</p> : null}
              {s.precio ? <p className="mt-3 text-sm font-semibold">S/ {s.precio}</p> : null}
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
