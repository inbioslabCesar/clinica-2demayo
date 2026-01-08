import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getServicios, getOfertas } from '../api/publicApi'

export default function HomePage({ sistemaUrl }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [servicios, setServicios] = useState([])
  const [ofertas, setOfertas] = useState([])

  useEffect(() => {
    let cancelled = false
    async function run() {
      setLoading(true)
      setError('')
      try {
        const [s, o] = await Promise.all([getServicios(), getOfertas()])
        if (cancelled) return
        setServicios(s.slice(0, 6))
        setOfertas(o.slice(0, 6))
      } catch (e) {
        if (cancelled) return
        setError(e?.message || 'No se pudo cargar la información')
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
    <div className="space-y-8">
      <section className="rounded-2xl border bg-white p-6">
        <h1 className="text-2xl font-bold">Bienvenido</h1>
        <p className="mt-2 text-slate-700">
          Conoce nuestros servicios y ofertas. Para acceder al sistema interno, usa el botón “Ingresar al sistema”.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold" to="/servicios">
            Ver servicios
          </Link>
          <Link className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold" to="/ofertas">
            Ver ofertas
          </Link>
          <a className="px-4 py-2 rounded-lg border text-sm font-semibold" href={sistemaUrl} rel="noopener noreferrer">
            Ingresar al sistema
          </a>
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      <section className="grid md:grid-cols-2 gap-6">
        <div className="rounded-2xl border bg-white p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Servicios</h2>
            <Link to="/servicios" className="text-sm font-semibold text-blue-700 hover:underline">Ver todos</Link>
          </div>
          {loading ? (
            <div className="mt-4 text-sm text-slate-600">Cargando…</div>
          ) : servicios.length === 0 ? (
            <div className="mt-4 text-sm text-slate-600">Aún no hay servicios publicados.</div>
          ) : (
            <ul className="mt-4 space-y-3">
              {servicios.map((s) => (
                <li key={s.id} className="rounded-xl border p-4">
                  <div className="font-semibold">{s.titulo}</div>
                  {s.descripcion ? <div className="text-sm text-slate-700 mt-1">{s.descripcion}</div> : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border bg-white p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Ofertas</h2>
            <Link to="/ofertas" className="text-sm font-semibold text-blue-700 hover:underline">Ver todas</Link>
          </div>
          {loading ? (
            <div className="mt-4 text-sm text-slate-600">Cargando…</div>
          ) : ofertas.length === 0 ? (
            <div className="mt-4 text-sm text-slate-600">Aún no hay ofertas publicadas.</div>
          ) : (
            <ul className="mt-4 space-y-3">
              {ofertas.map((o) => (
                <li key={o.id} className="rounded-xl border p-4">
                  <div className="font-semibold">{o.titulo}</div>
                  {o.descripcion ? <div className="text-sm text-slate-700 mt-1">{o.descripcion}</div> : null}
                  {o.precio_oferta ? (
                    <div className="mt-2 text-sm">
                      <span className="font-semibold">S/ {o.precio_oferta}</span>
                      {o.precio_antes ? <span className="ml-2 text-slate-500 line-through">S/ {o.precio_antes}</span> : null}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}
