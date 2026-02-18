import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { getServicios, getOfertas, getBanners } from '../api/publicApi'
import HeroCarousel from '../components/HeroCarousel'
import ServiceIcon from '../components/ServiceIcon'
import CountUpNumber from '../components/CountUpNumber'
import VerticalOffersSlider from '../components/VerticalOffersSlider'

function clampIndex(value, length) {
  if (length <= 0) return 0
  return ((value % length) + length) % length
}

export default function HomePage({ sistemaUrl }) {
  const publicLogoSrc = `${import.meta.env.BASE_URL}2demayo.svg`

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [servicios, setServicios] = useState([])
  const [ofertas, setOfertas] = useState([])
  const [banners, setBanners] = useState([])
  const [serviciosTotal, setServiciosTotal] = useState(0)
  const [ofertasTotal, setOfertasTotal] = useState(0)

  const [ubicacionQuery, setUbicacionQuery] = useState('')
  const [ubicacionError, setUbicacionError] = useState('')

  const pacientesElegidosBase = Number(import.meta.env.VITE_PUBLIC_PACIENTES_ELEGIDOS || 25000)

  const mapQuery = ((import.meta.env.VITE_PUBLIC_MAP_QUERY || 'Clínica Dos de Mayo') + '').trim()
  const mapDestination = ((import.meta.env.VITE_PUBLIC_MAP_DESTINATION || mapQuery) + '').trim()
  const mapsEmbedSrc = ((
    import.meta.env.VITE_PUBLIC_MAP_EMBED_SRC ||
    'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3947.1003684427533!2d-74.54990752410586!3d-8.391788584656554!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x91a3bd84abc5f5db%3A0x72cd3f56488f2aed!2sPolicl%C3%ADnico%20Dos%20de%20Mayo!5e0!3m2!1ses-419!2spe!4v1767937155771!5m2!1ses-419!2spe'
  ) + '').trim()
  const mapsSearchUrl = (q) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
  const mapsDirectionsUrl = (origin, dest) => {
    const base = 'https://www.google.com/maps/dir/?api=1'
    const destParam = `destination=${encodeURIComponent(dest)}`
    const originParam = origin ? `&origin=${encodeURIComponent(origin)}` : ''
    return `${base}&${destParam}${originParam}&travelmode=driving`
  }
  const pacientesFormatter = useMemo(() => {
    try {
      return new Intl.NumberFormat('es-PE')
    } catch {
      return null
    }
  }, [])

  const [pacientesElegidosLive, setPacientesElegidosLive] = useState(() => {
    const base = Number.isFinite(pacientesElegidosBase) && pacientesElegidosBase > 0 ? Math.floor(pacientesElegidosBase) : 0
    try {
      const storedBase = Number(sessionStorage.getItem('public_pacientes_base'))
      const storedTs = Number(sessionStorage.getItem('public_pacientes_start_ts'))
      if (Number.isFinite(storedBase) && storedBase > 0 && Number.isFinite(storedTs) && storedTs > 0) {
        return Math.max(0, Math.floor(storedBase + (Date.now() - storedTs) / 1000))
      }
      sessionStorage.setItem('public_pacientes_base', String(base))
      sessionStorage.setItem('public_pacientes_start_ts', String(Date.now()))
    } catch {
      // ignore
    }
    return base
  })

  useEffect(() => {
    const base = Number.isFinite(pacientesElegidosBase) && pacientesElegidosBase > 0 ? Math.floor(pacientesElegidosBase) : 0
    let id = 0

    const tick = () => {
      setPacientesElegidosLive(() => {
        try {
          const storedBase = Number(sessionStorage.getItem('public_pacientes_base'))
          const storedTs = Number(sessionStorage.getItem('public_pacientes_start_ts'))
          const useBase = Number.isFinite(storedBase) && storedBase > 0 ? Math.floor(storedBase) : base
          const useTs = Number.isFinite(storedTs) && storedTs > 0 ? storedTs : Date.now()
          return Math.max(0, Math.floor(useBase + (Date.now() - useTs) / 1000))
        } catch {
          return Math.max(0, base + 1)
        }
      })
    }

    id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [pacientesElegidosBase])

  const handleBuscarUbicacion = (e) => {
    e.preventDefault()
    const q = (ubicacionQuery || '').trim()
    if (!q) return
    window.open(mapsSearchUrl(q), '_blank', 'noopener,noreferrer')
  }

  const handleUsarMiUbicacion = () => {
    setUbicacionError('')
    if (!('geolocation' in navigator)) {
      setUbicacionError('Tu navegador no permite usar ubicación.')
      return
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const origin = `${pos.coords.latitude},${pos.coords.longitude}`
        window.open(mapsDirectionsUrl(origin, mapDestination), '_blank', 'noopener,noreferrer')
      },
      () => {
        setUbicacionError('No se pudo obtener tu ubicación.')
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 }
    )
  }

  const featureCards = useMemo(
    () => [
      {
        titleA: 'No importa',
        titleB: 'donde estés.',
        desc: 'Accede fácilmente a información y novedades desde nuestra web.',
      },
      {
        titleA: 'Agenda tus citas',
        titleB: 'al instante',
        desc: 'Organiza tus atenciones en pocos pasos, sin complicaciones.',
      },
      {
        titleA: 'Resultados en',
        titleB: 'tus manos',
        desc: 'Revisa tus resultados y novedades cuando lo necesites.',
      },
    ],
    []
  )

  const featureShouldLoop = featureCards.length > 1
  const featureExtended = useMemo(() => {
    if (!featureShouldLoop) return featureCards
    return [featureCards[featureCards.length - 1], ...featureCards, featureCards[0]]
  }, [featureCards, featureShouldLoop])

  const [featurePos, setFeaturePos] = useState(featureShouldLoop ? 1 : 0)
  const [featureIsTransitioning, setFeatureIsTransitioning] = useState(false)
  const featurePosRef = useRef(featurePos)
  featurePosRef.current = featurePos
  const featureIsTransitioningRef = useRef(featureIsTransitioning)
  featureIsTransitioningRef.current = featureIsTransitioning
  const featureTrackRef = useRef(null)

  useEffect(() => {
    setFeatureIsTransitioning(false)
    setFeaturePos(featureShouldLoop ? 1 : 0)
  }, [featureShouldLoop, featureCards.length])

  const featureActiveIndex = featureShouldLoop
    ? clampIndex(featurePos - 1, featureCards.length)
    : clampIndex(featurePos, featureCards.length)

  const featureStepPct = featureExtended.length > 0 ? 100 / featureExtended.length : 100

  const goFeatureToPos = useMemo(() => {
    return (nextPos) => {
      if (featureCards.length <= 1) return
      if (featureIsTransitioningRef.current) return

      let targetPos = nextPos
      if (featureShouldLoop) {
        const minPos = 0
        const maxPos = featureCards.length + 1
        if (targetPos < minPos) targetPos = minPos
        if (targetPos > maxPos) targetPos = maxPos
      } else {
        const minPos = 0
        const maxPos = featureCards.length - 1
        if (targetPos < minPos) targetPos = minPos
        if (targetPos > maxPos) targetPos = maxPos
      }

      if (targetPos === featurePosRef.current) return
      setFeatureIsTransitioning(true)
      setFeaturePos(targetPos)
    }
  }, [featureCards.length, featureShouldLoop])

  const goFeaturePrev = () => goFeatureToPos(featurePosRef.current - 1)
  const goFeatureNext = () => goFeatureToPos(featurePosRef.current + 1)
  const goFeatureTo = (i) => goFeatureToPos(i + 1)

  useEffect(() => {
    if (!featureShouldLoop) return
    if (featureCards.length <= 1) return

    const id = window.setInterval(() => {
      goFeatureToPos(featurePosRef.current + 1)
    }, 5500)

    return () => window.clearInterval(id)
  }, [featureShouldLoop, featureCards.length, goFeatureToPos])

  useEffect(() => {
    if (!featureShouldLoop) {
      setFeatureIsTransitioning(false)
      return
    }

    const el = featureTrackRef.current
    if (!el) return

    const onEnd = (e) => {
      if (e && e.target !== el) return
      const currentPos = featurePosRef.current
      if (currentPos === 0) {
        setFeatureIsTransitioning(false)
        setFeaturePos(featureCards.length)
        return
      }
      if (currentPos === featureCards.length + 1) {
        setFeatureIsTransitioning(false)
        setFeaturePos(1)
        return
      }
      setFeatureIsTransitioning(false)
    }

    el.addEventListener('transitionend', onEnd)
    return () => el.removeEventListener('transitionend', onEnd)
  }, [featureShouldLoop, featureCards.length])

  const serviceVariants = [
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

  const offerVariants = [
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
        const [s, o, b] = await Promise.all([getServicios(), getOfertas(), getBanners()])
        if (cancelled) return
        setServiciosTotal(Array.isArray(s) ? s.length : 0)
        setOfertasTotal(Array.isArray(o) ? o.length : 0)
        setServicios(s.slice(0, 6))
        setOfertas(o.slice(0, 6))
        setBanners(Array.isArray(b) ? b : [])
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
      <div className="relative left-1/2 right-1/2 -mx-[50vw] w-screen mt-4 sm:mt-1">
        <div className="max-w-[1900px] mx-auto px-1 sm:px-1">
          <HeroCarousel
            className="rounded-3x1 border-0 bg-transparent backdrop-blur-0"
            heightClassName="h-[92vh] min-h-[460px] sm:min-h-[580px] lg:min-h-[480px] max-h-[780px]"
            slides={
              banners.length
                ? banners.map((x) => ({
                    id: x.id,
                    title: x.titulo || '',
                    subtitle: x.subtitulo || '',
                    imageSrc: x.imagen_url,
                    showWhiteOverlay: x.overlay_blanco === 0 ? false : true,
                    textSide: x.texto_lado === 'right' ? 'right' : 'left',
                    titleColor: x.titulo_color || null,
                    subtitleColor: x.subtitulo_color || null,
                    titleSize: x.titulo_tamano || 'lg',
                    subtitleSize: x.subtitulo_tamano || 'md',
                    imageAlt: x.titulo || 'Banner',
                  }))
                : undefined
            }
          />
        </div>
      </div>

      <section className="rounded-2xl border bg-white p-6">
        <h1 className="text-3xl font-bold">Bienvenido</h1>
        <p className="mt-2 text-slate-700">
          Conoce nuestros servicios y ofertas. Para acceder al sistema interno, usa el botón “Iniciar sesión”.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-purple-700 to-blue-600 text-white text-base font-semibold hover:from-purple-800 hover:to-blue-700 transition-colors"
            to="/servicios"
          >
            Ver servicios
          </Link>
          <Link
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-purple-700 to-blue-600 text-white text-base font-semibold hover:from-purple-800 hover:to-blue-700 transition-colors"
            to="/ofertas"
          >
            Ver ofertas
          </Link>
          <a
            className="px-4 py-2 rounded-lg border text-base font-semibold text-slate-900 hover:bg-slate-50 transition-colors"
            href={sistemaUrl}
            rel="noopener noreferrer"
          >
            Iniciar sesión
          </a>
        </div>
      </section>

      <section className="rounded-2xl border bg-white/90 backdrop-blur p-4 sm:p-6">
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">Servicios que ofrecemos</h2>
            <div className="mt-1 text-slate-700">Conoce nuestros servicios y ofertas vigentes.</div>
          </div>
        </div>

        <div className="mt-6 grid md:grid-cols-2 gap-6">
          <div className="rounded-2xl border bg-white p-6">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xl font-semibold">Servicios</h3>
              <Link to="/servicios" className="text-base font-semibold text-blue-700 hover:underline">
                Ver todos
              </Link>
            </div>
            {loading ? (
              <div className="mt-4 text-base text-slate-600">Cargando…</div>
            ) : servicios.length === 0 ? (
              <div className="mt-4 text-base text-slate-600">Aún no hay servicios publicados.</div>
            ) : (
              <div className="mt-4 grid sm:grid-cols-2 gap-3">
                {servicios.map((s, idx) => {
                  const v = serviceVariants[idx % serviceVariants.length]
                  return (
                    <article key={s.id} className={`rounded-xl border p-4 hover:shadow-sm transition ${v.wrap}`}>
                      <div className="flex items-start gap-3">
                        <div
                          className={`shrink-0 h-10 w-10 rounded-full border flex items-center justify-center ${v.iconWrap}`}
                        >
                          <ServiceIcon name={s.icono} className={v.icon} />
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold leading-snug">{s.titulo}</div>
                          {s.descripcion ? (
                            <div className="text-base text-slate-700 mt-1 line-clamp-2">{s.descripcion}</div>
                          ) : null}
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </div>

          <div className="rounded-2xl border bg-white p-6">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xl font-semibold">Ofertas</h3>
              <Link to="/ofertas" className="text-base font-semibold text-blue-700 hover:underline">
                Ver todas
              </Link>
            </div>
            {loading ? (
              <div className="mt-4 text-base text-slate-600">Cargando…</div>
            ) : ofertas.length === 0 ? (
              <div className="mt-4 text-base text-slate-600">Aún no hay ofertas publicadas.</div>
            ) : (
              <div className="mt-4">
                <VerticalOffersSlider offers={ofertas} variants={offerVariants} intervalMs={4800} />
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border bg-white/90 backdrop-blur p-4 sm:p-6">
        <div className="grid md:grid-cols-2 gap-6 items-stretch">
          <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-slate-900 to-blue-700 min-h-[320px]">
            {banners?.[0]?.imagen_url || banners?.[0]?.imagen_fija_url ? (
              <img
                src={banners[0].imagen_fija_url || banners[0].imagen_url}
                alt={banners[0].titulo || 'Clínica 2 de Mayo'}
                className="absolute inset-0 h-full w-full object-cover"
                loading="eager"
                fetchPriority="high"
                decoding="async"
              />
            ) : null}
            <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-black/40 via-black/10 to-transparent" />
            <div className="relative z-10 p-6 h-full flex items-end">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-xl bg-white/90 flex items-center justify-center">
                  <img src={publicLogoSrc} alt="" className="h-10 w-10" />
                </div>
                <div className="text-white">
                  <div className="font-semibold leading-tight">Clínica 2 de Mayo</div>
                  <div className="text-sm text-white/80">Atención con calidez y confianza</div>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border bg-white p-6 flex flex-col justify-center">
            <div className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">
              Cuidado <span className="text-blue-700">que inspira confianza</span>
            </div>
            <div className="mt-3 text-slate-700">
              Tu bienestar es lo primero. Te acompañamos con atención personalizada y un equipo comprometido.
            </div>

            <div className="mt-6 grid sm:grid-cols-3 gap-3">
              <div className="rounded-2xl border bg-slate-50 px-4 py-3">
                <div className="text-xs font-semibold text-slate-600">Pacientes que nos eligieron</div>
                <div className="mt-1 text-3xl font-extrabold text-blue-700">
                  <span className="tabular-nums">
                    {pacientesFormatter ? pacientesFormatter.format(pacientesElegidosLive) : String(pacientesElegidosLive)}+
                  </span>
                </div>
              </div>
              <div className="rounded-2xl border bg-slate-50 px-4 py-3">
                <div className="text-xs font-semibold text-slate-600">Servicios publicados</div>
                <div className="mt-1 text-3xl font-extrabold text-slate-900">
                  <CountUpNumber value={serviciosTotal} durationMs={900} />
                </div>
              </div>
              <div className="rounded-2xl border bg-slate-50 px-4 py-3">
                <div className="text-xs font-semibold text-slate-600">Ofertas vigentes</div>
                <div className="mt-1 text-3xl font-extrabold text-slate-900">
                  <CountUpNumber value={ofertasTotal} durationMs={900} />
                </div>
              </div>
            </div>
            <div className="mt-2 text-sm font-semibold text-blue-800 tracking-wide">CALIDAD Y CONFIANZA EN SALUD</div>

            <div className="mt-6 grid sm:grid-cols-2 gap-4">
              <div className="flex items-start gap-3">
                <div className="shrink-0 h-10 w-10 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center">
                  <svg viewBox="0 0 24 24" className="h-6 w-6 text-blue-700" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </div>
                <div>
                  <div className="text-lg font-bold text-slate-900">Atención humanizada</div>
                  <div className="text-sm text-slate-700">Te atendemos con respeto y empatía.</div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="shrink-0 h-10 w-10 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center">
                  <svg viewBox="0 0 24 24" className="h-6 w-6 text-blue-700" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2l3 7h7l-5.5 4.5L18 21l-6-4-6 4 1.5-7.5L2 9h7z" />
                  </svg>
                </div>
                <div>
                  <div className="text-lg font-bold text-slate-900">Profesionales comprometidos</div>
                  <div className="text-sm text-slate-700">Enfoque en calidad y seguimiento.</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border bg-white/90 backdrop-blur p-4 sm:p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">Estamos cerca de ti.</div>
            <div className="mt-2 text-slate-700">
              Encuentra cómo llegar y revisa la ubicación en Google Maps.
            </div>
          </div>
          <a
            href={mapsDirectionsUrl('', mapDestination)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-700 font-semibold hover:underline"
          >
            Ver ubicación en Google Maps ↗
          </a>
        </div>

        <div className="mt-6 grid lg:grid-cols-2 gap-6 items-stretch">
          <div className="space-y-4">
            <form onSubmit={handleBuscarUbicacion} className="space-y-3">
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.3-4.3" />
                  </svg>
                </div>
                <input
                  value={ubicacionQuery}
                  onChange={(e) => setUbicacionQuery(e.target.value)}
                  placeholder="Buscar por distrito o dirección…"
                  className="w-full rounded-2xl border bg-white px-12 py-3 text-base outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>
              <button
                type="button"
                onClick={handleUsarMiUbicacion}
                className="w-full rounded-2xl border bg-white px-4 py-3 text-base font-semibold text-slate-900 hover:bg-slate-50 transition"
              >
                Usar mi ubicación
              </button>
              {ubicacionError ? <div className="text-sm text-rose-700">{ubicacionError}</div> : null}
            </form>

            <div className="rounded-2xl border bg-white p-4">
              <div className="font-semibold text-slate-900">Clínica 2 de Mayo</div>
              <div className="text-slate-700">{mapDestination}</div>
              <div className="mt-3 flex flex-wrap gap-3">
                <a
                  href={mapsDirectionsUrl('', mapDestination)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-700 to-blue-600 text-white text-base font-semibold hover:from-purple-800 hover:to-blue-700 transition-colors"
                >
                  Cómo llegar
                </a>
                <a
                  href={mapsSearchUrl(mapDestination)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 rounded-xl border text-base font-semibold text-slate-900 hover:bg-slate-50 transition"
                >
                  Abrir en Maps
                </a>
              </div>
            </div>
          </div>

          <div className="rounded-2xl overflow-hidden border bg-white min-h-[360px]">
            <iframe
              title="Mapa"
              src={mapsEmbedSrc}
              className="h-full w-full"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        </div>
      </section>

      <section className="rounded-3xl border bg-white/90 backdrop-blur p-4 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">Tu espacio de salud</div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={goFeaturePrev}
              aria-label="Anterior"
              className="h-10 w-10 rounded-full border bg-white text-slate-900 hover:bg-slate-50 transition"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={goFeatureNext}
              aria-label="Siguiente"
              className="h-10 w-10 rounded-full border bg-white text-slate-900 hover:bg-slate-50 transition"
            >
              ›
            </button>
          </div>
        </div>

        <div className="mt-2 text-slate-700">
          Accede a información y gestiona tu atención de forma sencilla.
        </div>

        <div className="mt-6 relative overflow-hidden rounded-3xl">
          <div
            ref={featureTrackRef}
            className={`flex will-change-transform ${
              featureIsTransitioning ? 'transition-transform duration-700 ease-in-out' : 'transition-none'
            }`}
            style={{ width: `${featureExtended.length * 100}%`, transform: `translateX(-${featurePos * featureStepPct}%)` }}
          >
            {featureExtended.map((card, idx) => (
              <div
                key={`${card.titleA}-${card.titleB}-${idx}`}
                className="shrink-0"
                style={{ width: `${featureStepPct}%` }}
              >
                <div className="px-2 sm:px-6">
                  <div className="rounded-3xl border bg-white p-6 flex flex-col justify-between min-h-[380px] max-w-[720px] mx-auto">
                    <div>
                      <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 leading-tight">
                        <div>{card.titleA}</div>
                        <div className="text-blue-700">{card.titleB}</div>
                      </div>
                      <div className="mt-3 text-slate-700">{card.desc}</div>
                    </div>

                    <div className="mt-6 flex items-end justify-center">
                      <div className="relative w-[220px] sm:w-[240px]">
                        <div className="absolute -inset-2 rounded-[2.5rem] bg-gradient-to-b from-slate-200 to-slate-50" />
                        <div className="relative rounded-[2.4rem] border bg-white shadow-sm overflow-hidden">
                          <div className="h-10 flex items-center justify-center">
                            <div className="h-5 w-24 rounded-full bg-slate-100" />
                          </div>
                          <div className="px-4 pb-5">
                            <div className="h-3 w-28 rounded bg-slate-100" />
                            <div className="mt-3 grid grid-cols-2 gap-3">
                              <div className="h-10 rounded-xl bg-slate-100" />
                              <div className="h-10 rounded-xl bg-slate-100" />
                              <div className="h-10 rounded-xl bg-slate-100" />
                              <div className="h-10 rounded-xl bg-slate-100" />
                            </div>
                            <div className="mt-4 h-24 rounded-2xl bg-gradient-to-r from-indigo-100 via-purple-100 to-emerald-100" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-center gap-2">
          {featureCards.map((c, i) => (
            <button
              key={`${c.titleA}-${c.titleB}-${i}`}
              type="button"
              onClick={() => goFeatureTo(i)}
              aria-label={`Ir al slide ${i + 1}`}
              className={`h-2.5 w-2.5 rounded-full border transition-colors ${
                i === featureActiveIndex
                  ? 'bg-blue-700 border-blue-700'
                  : 'bg-white/80 border-white/80 hover:bg-white'
              }`}
            />
          ))}
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}
    </div>
  )
}
