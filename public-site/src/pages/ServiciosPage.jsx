import React, { useEffect, useState } from 'react'
import { getServicios } from '../api/publicApi'
import ServiceIcon from '../components/ServiceIcon'

export default function ServiciosPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [servicios, setServicios] = useState([])

  const variants = [
    {
      wrap: 'bg-white/80 backdrop-blur border-white/40 ring-1 ring-blue-200/60 hover:bg-white/90 hover:ring-blue-300/60',
      iconWrap: 'bg-blue-50 border-blue-200',
      icon: 'text-blue-700',
    },
    {
      wrap: 'bg-white/80 backdrop-blur border-white/40 ring-1 ring-purple-200/60 hover:bg-white/90 hover:ring-purple-300/60',
      iconWrap: 'bg-purple-50 border-purple-200',
      icon: 'text-purple-700',
    },
    {
      wrap: 'bg-white/80 backdrop-blur border-white/40 ring-1 ring-emerald-200/60 hover:bg-white/90 hover:ring-emerald-300/60',
      iconWrap: 'bg-emerald-50 border-emerald-200',
      icon: 'text-emerald-700',
    },
    {
      wrap: 'bg-white/80 backdrop-blur border-white/40 ring-1 ring-amber-200/60 hover:bg-white/90 hover:ring-amber-300/60',
      iconWrap: 'bg-amber-50 border-amber-200',
      icon: 'text-amber-700',
    },
    {
      wrap: 'bg-white/80 backdrop-blur border-white/40 ring-1 ring-rose-200/60 hover:bg-white/90 hover:ring-rose-300/60',
      iconWrap: 'bg-rose-50 border-rose-200',
      icon: 'text-rose-700',
    },
    {
      wrap: 'bg-white/80 backdrop-blur border-white/40 ring-1 ring-indigo-200/60 hover:bg-white/90 hover:ring-indigo-300/60',
      iconWrap: 'bg-indigo-50 border-indigo-200',
      icon: 'text-indigo-700',
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
                className={`rounded-2xl border p-5 transition hover:shadow-sm ${v.wrap}`}
              >
                <div className="flex items-start gap-3">
                  <div className={`shrink-0 h-12 w-12 rounded-2xl border flex items-center justify-center ${v.iconWrap}`}>
                    <ServiceIcon name={s.icono} className={`${v.icon} text-xl`} />
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
                  />
                ) : null}

                {s.precio ? <p className="mt-4 text-sm font-semibold">S/ {s.precio}</p> : null}
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
