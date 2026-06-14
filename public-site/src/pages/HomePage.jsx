import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { getServicios, getOfertas, getBanners } from '../api/publicApi'
import HeroCarousel from '../components/HeroCarousel'
import ServiceIcon from '../components/ServiceIcon'
import CountUpNumber from '../components/CountUpNumber'
import VerticalOffersSlider from '../components/VerticalOffersSlider'
import { resolvePublicLogoSize } from '../utils/logoSizing'
import { sanitizeFontSize, sanitizeHexColor } from '../utils/branding'
import { resolvePublicAssetUrl } from '../utils/publicAssetUrl'
import { buildScopedStorageKey } from '../utils/storageScope.js'

function clampIndex(value, length) {
  if (length <= 0) return 0
  return ((value % length) + length) % length
}

const PACIENTES_BASE_KEY = buildScopedStorageKey('public_pacientes_base')
const PACIENTES_START_TS_KEY = buildScopedStorageKey('public_pacientes_start_ts')

export default function HomePage({ sistemaUrl, publicLogoSrc = `${import.meta.env.BASE_URL}2demayo.svg`, clinicName = 'Portal de Salud', configuracion, logoSize }) {

  const resolvedLogoSize = logoSize || resolvePublicLogoSize(configuracion?.logo_size_publico)
  const brandNameColor = sanitizeHexColor(configuracion?.nombre_color, 'var(--color-primary, #E85D8E)')
  const brandNameFontSize = sanitizeFontSize(configuracion?.nombre_font_size, undefined)
  const sloganColor = sanitizeHexColor(configuracion?.slogan_color, 'var(--color-secondary, #3A4FA3)')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [servicios, setServicios] = useState([])
  const [ofertas, setOfertas] = useState([])
  const [banners, setBanners] = useState([])
  const [serviciosTotal, setServiciosTotal] = useState(0)
  const [ofertasTotal, setOfertasTotal] = useState(0)

  const heroSlides = useMemo(() => {
    if (loading) return []
    if (!banners.length) return undefined

    const heroBanners = banners.filter((x) => String(x?.imagen_url || '').trim() !== '')
    if (!heroBanners.length) return undefined

    return heroBanners.map((x) => ({
      id: x.id,
      title: x.titulo || '',
      subtitle: x.subtitulo || '',
      imageSrc: resolvePublicAssetUrl(x.imagen_url || ''),
      showWhiteOverlay: x.overlay_blanco === 0 ? false : true,
      textSide: x.texto_lado === 'right' ? 'right' : 'left',
      titleColor: x.titulo_color || null,
      subtitleColor: x.subtitulo_color || null,
      titleSize: x.titulo_tamano || 'lg',
      subtitleSize: x.subtitulo_tamano || 'md',
      imageAlt: x.titulo || 'Banner',
    }))
  }, [loading, banners])

  const homeFijaImages = useMemo(() => {
    if (!Array.isArray(banners) || banners.length === 0) return []
    return banners
      .map((b) => (b?.imagen_fija_url || '').trim())
      .filter(Boolean)
      .map((url) => resolvePublicAssetUrl(url))
  }, [banners])

  const homeFijaCount = homeFijaImages.length
  const [homeFijaImageIndex, setHomeFijaImageIndex] = useState(0)

  useEffect(() => { setHomeFijaImageIndex(0) }, [homeFijaCount])

  useEffect(() => {
    if (homeFijaCount <= 1) return
    const id = setInterval(() => setHomeFijaImageIndex((i) => (i + 1) % homeFijaCount), 4000)
    return () => clearInterval(id)
  }, [homeFijaCount])

  const homeFijaImageSrc = homeFijaImages[homeFijaImageIndex] || ''

  const [ubicacionQuery, setUbicacionQuery] = useState('')
  const [ubicacionError, setUbicacionError] = useState('')

  const pacientesElegidosBase = Number(import.meta.env.VITE_PUBLIC_PACIENTES_ELEGIDOS || 25000)

  const mapDestination = ((import.meta.env.VITE_PUBLIC_MAP_DESTINATION || configuracion?.direccion || '') + '').trim()
  const mapEmbedFromDestination = mapDestination
    ? `https://www.google.com/maps?q=${encodeURIComponent(mapDestination)}&output=embed`
    : ''
  const mapsEmbedSrc = ((
    configuracion?.google_maps_embed ||
    import.meta.env.VITE_PUBLIC_MAP_EMBED_SRC ||
    mapEmbedFromDestination
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
      const storedBase = Number(sessionStorage.getItem(PACIENTES_BASE_KEY))
      const storedTs = Number(sessionStorage.getItem(PACIENTES_START_TS_KEY))
      if (Number.isFinite(storedBase) && storedBase > 0 && Number.isFinite(storedTs) && storedTs > 0) {
        return Math.max(0, Math.floor(storedBase + (Date.now() - storedTs) / 1000))
      }
      sessionStorage.setItem(PACIENTES_BASE_KEY, String(base))
      sessionStorage.setItem(PACIENTES_START_TS_KEY, String(Date.now()))
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
          const storedBase = Number(sessionStorage.getItem(PACIENTES_BASE_KEY))
          const storedTs = Number(sessionStorage.getItem(PACIENTES_START_TS_KEY))
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
      wrapStyle: { background: 'rgba(255,255,255,0.82)', borderColor: 'color-mix(in srgb, var(--color-primary, #2563eb) 20%, white)', boxShadow: '0 0 0 1px color-mix(in srgb, var(--color-primary-light, #dbeafe) 65%, white)' },
      iconWrapStyle: { backgroundColor: 'color-mix(in srgb, var(--color-primary-light, #dbeafe) 72%, white)', borderColor: 'color-mix(in srgb, var(--color-primary, #2563eb) 24%, white)' },
      iconStyle: { color: 'var(--color-primary-dark, #1d4ed8)' },
    },
    {
      wrapStyle: { background: 'rgba(255,255,255,0.82)', borderColor: 'color-mix(in srgb, var(--color-secondary, #4f46e5) 18%, white)', boxShadow: '0 0 0 1px color-mix(in srgb, var(--color-accent, #c4b5fd) 45%, white)' },
      iconWrapStyle: { backgroundColor: 'color-mix(in srgb, var(--color-accent, #ddd6fe) 26%, white)', borderColor: 'color-mix(in srgb, var(--color-secondary, #4f46e5) 20%, white)' },
      iconStyle: { color: 'var(--color-secondary, #4f46e5)' },
    },
    {
      wrapStyle: { background: 'rgba(255,255,255,0.82)', borderColor: 'color-mix(in srgb, #22c55e 18%, white)', boxShadow: '0 0 0 1px color-mix(in srgb, #bbf7d0 56%, white)' },
      iconWrapStyle: { backgroundColor: 'color-mix(in srgb, #dcfce7 78%, white)', borderColor: 'color-mix(in srgb, #22c55e 22%, white)' },
      iconStyle: { color: '#15803d' },
    },
    {
      wrapStyle: { background: 'rgba(255,255,255,0.82)', borderColor: 'color-mix(in srgb, #f59e0b 18%, white)', boxShadow: '0 0 0 1px color-mix(in srgb, #fde68a 60%, white)' },
      iconWrapStyle: { backgroundColor: 'color-mix(in srgb, #fef3c7 80%, white)', borderColor: 'color-mix(in srgb, #f59e0b 22%, white)' },
      iconStyle: { color: '#b45309' },
    },
    {
      wrapStyle: { background: 'rgba(255,255,255,0.82)', borderColor: 'color-mix(in srgb, #fb7185 18%, white)', boxShadow: '0 0 0 1px color-mix(in srgb, #fecdd3 58%, white)' },
      iconWrapStyle: { backgroundColor: 'color-mix(in srgb, #ffe4e6 82%, white)', borderColor: 'color-mix(in srgb, #fb7185 20%, white)' },
      iconStyle: { color: '#be123c' },
    },
    {
      wrapStyle: { background: 'rgba(255,255,255,0.82)', borderColor: 'color-mix(in srgb, var(--color-secondary, #4f46e5) 18%, white)', boxShadow: '0 0 0 1px color-mix(in srgb, var(--color-primary-light, #dbeafe) 48%, white)' },
      iconWrapStyle: { backgroundColor: 'color-mix(in srgb, var(--color-primary-light, #eef2ff) 74%, white)', borderColor: 'color-mix(in srgb, var(--color-secondary, #4f46e5) 20%, white)' },
      iconStyle: { color: 'var(--color-secondary, #4f46e5)' },
    },
  ]

  const offerVariants = [
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
            heightClassName="h-[32vh] min-h-[190px] sm:h-[38vh] sm:min-h-[280px] lg:h-[44vh] lg:min-h-[420px] xl:h-[52vh] xl:min-h-[520px] max-h-[640px]"
            slides={heroSlides}
          />
        </div>
      </div>

      <section className="rounded-2xl border bg-white p-6">
        <h1 className="text-3xl font-bold" style={{ color: brandNameColor, fontSize: brandNameFontSize }}>
          {clinicName || 'Bienvenido'}
        </h1>
        {configuracion?.slogan && (
          <p className="mt-1 text-lg font-medium" style={{ color: sloganColor }}>
            {configuracion.slogan}
          </p>
        )}
        <p className="mt-2 text-slate-700">
          Conoce nuestros servicios y ofertas. Para acceder al sistema interno, usa el botón “Iniciar sesión”.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            className="px-4 py-2 rounded-lg text-white text-base font-semibold hover:opacity-90 transition-colors"
            to="/servicios"
            style={{ background: 'linear-gradient(to right, var(--color-primary-dark, #7e22ce), var(--color-secondary, #2563eb))' }}
          >
            Ver servicios
          </Link>
          <Link
            className="px-4 py-2 rounded-lg text-white text-base font-semibold hover:opacity-90 transition-colors"
            to="/ofertas"
            style={{ background: 'linear-gradient(to right, var(--color-primary-dark, #7e22ce), var(--color-secondary, #2563eb))' }}
          >
            Ver ofertas
          </Link>
          <a
            className="px-4 py-2 rounded-lg border text-base font-semibold hover:bg-slate-50 transition-colors"
            href={sistemaUrl}
            rel="noopener noreferrer"
            style={{ color: 'var(--color-primary, #E85D8E)', borderColor: 'var(--color-primary, #E85D8E)' }}
          >
            Iniciar sesión
          </a>
        </div>
      </section>

      <section className="rounded-2xl border bg-white/90 backdrop-blur p-4 sm:p-6">
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight" style={{ color: 'var(--color-primary, #1e293b)' }}>Servicios que ofrecemos</h2>
            <div className="mt-1 text-slate-700">Conoce nuestros servicios y ofertas vigentes.</div>
          </div>
        </div>

        <div className="mt-6 grid md:grid-cols-2 gap-6">
          <div className="rounded-2xl border bg-white p-6">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xl font-semibold">Servicios</h3>
              <Link to="/servicios" className="text-base font-semibold hover:underline" style={{ color: 'var(--color-secondary, #2563eb)' }}>
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
                    <article key={s.id} className="rounded-xl border p-4 hover:shadow-sm transition" style={v.wrapStyle}>
                      <div className="flex items-start gap-3">
                        <div
                          className="shrink-0 h-10 w-10 rounded-full border flex items-center justify-center"
                          style={v.iconWrapStyle}
                        >
                          <ServiceIcon name={s.icono} style={v.iconStyle} />
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
              <Link to="/ofertas" className="text-base font-semibold hover:underline" style={{ color: 'var(--color-secondary, #2563eb)' }}>
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
          <div className="relative overflow-hidden rounded-2xl border min-h-[320px]" style={{ background: 'linear-gradient(to bottom right, var(--color-login-from, #0f172a), var(--color-secondary, #2563eb))' }}>
            {homeFijaImages.map((src, i) => (
              <img
                key={i}
                src={src}
                alt={clinicName}
                className="absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ease-in-out"
                style={{ opacity: i === homeFijaImageIndex ? 1 : 0 }}
                loading={i === 0 ? 'eager' : 'lazy'}
                decoding="async"
              />
            ))}
            {homeFijaCount > 1 && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2 z-20">
                {homeFijaImages.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setHomeFijaImageIndex(i)}
                    className="w-2.5 h-2.5 rounded-full transition-all duration-300"
                    style={{
                      backgroundColor: i === homeFijaImageIndex ? 'var(--color-primary, #E85D8E)' : 'rgba(255,255,255,0.7)',
                      transform: i === homeFijaImageIndex ? 'scale(1.3)' : 'scale(1)',
                    }}
                  />
                ))}
              </div>
            )}
            <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-black/40 via-black/10 to-transparent" />
            <div className="relative z-10 p-6 h-full flex items-end">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-xl bg-white/90 flex items-center justify-center">
                  <img src={publicLogoSrc} alt="" className="object-contain" style={{ width: resolvedLogoSize.feature, height: resolvedLogoSize.feature }} />
                </div>
                <div className="text-white">
                  <div className="font-semibold leading-tight">{clinicName}</div>
                  <div className="text-sm text-white/80">{configuracion?.slogan || 'Atención con calidez y confianza'}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border bg-white p-6 flex flex-col justify-center">
            <div className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">
              Cuidado <span style={{ color: 'var(--color-secondary, #2563eb)' }}>que inspira confianza</span>
            </div>
            <div className="mt-3 text-slate-700">
              Tu bienestar es lo primero. Te acompañamos con atención personalizada y un equipo comprometido.
            </div>

            <div className="mt-6 grid sm:grid-cols-3 gap-3">
              <div className="rounded-2xl border bg-slate-50 px-4 py-3">
                <div className="text-xs font-semibold text-slate-600">Pacientes que nos eligieron</div>
                <div className="mt-1 text-3xl font-extrabold" style={{ color: 'var(--color-secondary, #2563eb)' }}>
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
            <div className="mt-2 text-sm font-semibold tracking-wide" style={{ color: 'var(--color-primary-dark, #1e40af)' }}>CALIDAD Y CONFIANZA EN SALUD</div>

            <div className="mt-6 grid sm:grid-cols-2 gap-4">
              <div className="flex items-start gap-3">
                <div className="shrink-0 h-10 w-10 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--color-primary-light, #eff6ff)', border: '1px solid var(--color-primary, #E85D8E)30' }}>
                  <svg viewBox="0 0 24 24" className="h-6 w-6" style={{ color: 'var(--color-primary, #E85D8E)' }} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                <div className="shrink-0 h-10 w-10 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--color-primary-light, #eff6ff)', border: '1px solid var(--color-primary, #E85D8E)30' }}>
                  <svg viewBox="0 0 24 24" className="h-6 w-6" style={{ color: 'var(--color-primary, #E85D8E)' }} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
          {mapDestination ? (
            <a
              href={mapsDirectionsUrl('', mapDestination)}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold hover:underline"
              style={{ color: 'var(--color-secondary, #2563eb)' }}
            >
              Ver ubicación en Google Maps ↗
            </a>
          ) : (
            <span className="text-sm text-slate-500">Ubicación no disponible temporalmente.</span>
          )}
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
                  className="w-full rounded-2xl border bg-white px-12 py-3 text-base outline-none focus:ring-2 focus:ring-[var(--color-primary-light)]"
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
              <div className="font-semibold" style={{ color: 'var(--color-primary, #1e293b)' }}>{clinicName}</div>
              <div className="text-slate-700">{mapDestination || 'Ubicación no disponible temporalmente.'}</div>
              {mapDestination ? (
                <div className="mt-3 flex flex-wrap gap-3">
                  <a
                    href={mapsDirectionsUrl('', mapDestination)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 rounded-xl text-white text-base font-semibold hover:opacity-90 transition-colors"
                    style={{ background: 'linear-gradient(to right, var(--color-primary-dark, #7e22ce), var(--color-secondary, #2563eb))' }}
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
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl overflow-hidden border bg-white min-h-[360px]">
            {mapsEmbedSrc ? (
              <iframe
                title="Mapa"
                src={mapsEmbedSrc}
                className="h-full w-full"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-center p-6 text-slate-500">
                No se pudo cargar la ubicación en este momento.
              </div>
            )}
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
                        <div style={{ color: 'var(--color-secondary, #2563eb)' }}>{card.titleB}</div>
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
                  ? ''
                  : 'bg-white/80 border-white/80 hover:bg-white'
              }`}
              style={i === featureActiveIndex ? { backgroundColor: 'var(--color-primary, #2563eb)', borderColor: 'var(--color-primary, #2563eb)' } : undefined}
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
