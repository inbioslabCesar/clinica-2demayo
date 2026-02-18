import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

function clampIndex(value, length) {
  if (length <= 0) return 0
  return ((value % length) + length) % length
}

export default function HeroCarousel({
  slides: slidesProp,
  autoPlay = true,
  intervalMs = 6000,
  className = '',
  heightClassName = '',
}) {
  const slides = useMemo(() => {
    if (Array.isArray(slidesProp) && slidesProp.length > 0) return slidesProp

    // Defaults without external images (ready to replace by adding imageSrc).
    return [
      {
        id: 's1',
        title: 'Tu salud en manos expertas',
        subtitle: 'Conoce nuestros servicios y ofertas',
        gradientClass: 'from-blue-700 to-purple-700',
      },
      {
        id: 's2',
        title: 'Atención rápida y confiable',
        subtitle: 'Equipo médico y atención personalizada',
        gradientClass: 'from-slate-900 to-blue-700',
      },
      {
        id: 's3',
        title: 'Clínica 2 de Mayo',
        subtitle: 'Cuidamos de ti y de tu familia',
        gradientClass: 'from-purple-700 to-slate-900',
      },
    ]
  }, [slidesProp])

  const [failedByIndex, setFailedByIndex] = useState({})
  const shouldLoop = slides.length > 1

  const extendedSlides = useMemo(() => {
    if (!shouldLoop) return slides
    return [slides[slides.length - 1], ...slides, slides[0]]
  }, [slides, shouldLoop])

  const [pos, setPos] = useState(shouldLoop ? 1 : 0)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const posRef = useRef(pos)
  posRef.current = pos
  const isTransitioningRef = useRef(isTransitioning)
  isTransitioningRef.current = isTransitioning

  const trackRef = useRef(null)

  useEffect(() => {
    setIsTransitioning(false)
    setPos(shouldLoop ? 1 : 0)
  }, [shouldLoop, slides.length])

  const activeIndex = shouldLoop ? clampIndex(pos - 1, slides.length) : clampIndex(pos, slides.length)

  const goToPos = useCallback(
    (nextPos) => {
      if (slides.length <= 1) return
      if (isTransitioningRef.current) return

      let targetPos = nextPos
      if (shouldLoop) {
        const minPos = 0
        const maxPos = slides.length + 1
        if (targetPos < minPos) targetPos = minPos
        if (targetPos > maxPos) targetPos = maxPos
      }

      if (targetPos === posRef.current) return
      setIsTransitioning(true)
      setPos(targetPos)
    },
    [shouldLoop, slides.length]
  )

  const goPrev = () => goToPos(posRef.current - 1)
  const goNext = () => goToPos(posRef.current + 1)
  const goTo = (i) => goToPos(i + 1)

  useEffect(() => {
    if (!autoPlay) return
    if (slides.length <= 1) return
    const ms = Number(intervalMs)
    if (!Number.isFinite(ms) || ms <= 0) return

    const id = setInterval(() => {
      goToPos(posRef.current + 1)
    }, ms)

    return () => clearInterval(id)
  }, [autoPlay, intervalMs, slides.length, goToPos])

  useEffect(() => {
    if (!shouldLoop) return
    const el = trackRef.current
    if (!el) return

    const onEnd = (e) => {
      if (e && e.target !== el) return
      const currentPos = posRef.current
      if (currentPos === 0) {
        setIsTransitioning(false)
        setPos(slides.length)
        return
      }
      if (currentPos === slides.length + 1) {
        setIsTransitioning(false)
        setPos(1)
        return
      }
      setIsTransitioning(false)
    }

    el.addEventListener('transitionend', onEnd)
    return () => el.removeEventListener('transitionend', onEnd)
  }, [shouldLoop, slides.length])

  const heightClass =
    (heightClassName && (heightClassName + '').trim()) ||
    'h-[86vh] min-h-[520px] sm:min-h-[620px] lg:min-h-[720px] max-h-[820px]'

  const stepPct = extendedSlides.length > 0 ? 100 / extendedSlides.length : 100

  function getTitleClass(size) {
    const v = (size || '').toLowerCase()
    if (v === 'sm') return 'text-3xl sm:text-4xl lg:text-5xl'
    if (v === 'md') return 'text-4xl sm:text-5xl lg:text-6xl'
    return 'text-5xl sm:text-6xl lg:text-7xl'
  }

  function getSubtitleClass(size) {
    const v = (size || '').toLowerCase()
    if (v === 'sm') return 'text-base sm:text-lg lg:text-xl'
    if (v === 'lg') return 'text-xl sm:text-2xl lg:text-3xl'
    return 'text-lg sm:text-xl lg:text-2xl'
  }

  return (
    <section
      className={`rounded-3xl overflow-hidden border border-white/30 bg-white/10 backdrop-blur ${className}`}
    >
      <div className={`relative ${heightClass}`}>
        <div
          ref={trackRef}
          className={`absolute inset-y-0 left-0 flex h-full will-change-transform ${
            isTransitioning ? 'transition-transform duration-1000 ease-in-out' : 'transition-none'
          }`}
          style={{ width: `${extendedSlides.length * 100}%`, transform: `translateX(-${pos * stepPct}%)` }}
        >
          {extendedSlides.map((s, i) => {
            const realIndex = shouldLoop ? clampIndex(i - 1, slides.length) : i
            const imageFailed = !!failedByIndex[realIndex]
            const isInitiallyVisible = shouldLoop ? i === 1 : i === 0
            const isCurrentVisible = realIndex === activeIndex
            const shouldPrioritizeImage = isInitiallyVisible || isCurrentVisible
            const textSide = (s.textSide || 'left') === 'right' ? 'right' : 'left'
            const titleStyle = s.titleColor ? { color: s.titleColor } : undefined
            const subtitleStyle = s.subtitleColor ? { color: s.subtitleColor } : undefined

            return (
              <div
                key={`${s.id ?? 'slide'}-${i}`}
                className="relative h-full shrink-0"
                style={{ width: `${stepPct}%` }}
              >
                {s.imageSrc && !imageFailed ? (
                  <img
                    src={s.imageSrc}
                    alt={s.imageAlt || s.title || 'Banner'}
                    className="absolute inset-0 h-full w-full object-cover"
                    loading={shouldPrioritizeImage ? 'eager' : 'lazy'}
                    fetchPriority={shouldPrioritizeImage ? 'high' : 'auto'}
                    decoding="async"
                    onError={() => setFailedByIndex((m) => ({ ...m, [realIndex]: true }))}
                  />
                ) : (
                  <div
                    className={`absolute inset-0 bg-gradient-to-r ${s.gradientClass || 'from-blue-700 to-purple-700'}`}
                  />
                )}

                {s.showWhiteOverlay === false ? null : textSide === 'right' ? (
                  <div className="absolute inset-y-0 right-0 w-[58%] bg-gradient-to-l from-white via-white/85 to-transparent" />
                ) : (
                  <div className="absolute inset-y-0 left-0 w-[58%] bg-gradient-to-r from-white via-white/85 to-transparent" />
                )}

                <div className={`relative z-10 h-full flex items-center ${textSide === 'right' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`px-6 sm:px-10 max-w-2xl ${textSide === 'right' ? 'text-right' : 'text-left'}`}>
                    {s.title ? (
                      <div
                        className={`${getTitleClass(s.titleSize)} font-bold tracking-tight text-slate-900 leading-[1.05]`}
                        style={titleStyle}
                      >
                        {s.title}
                      </div>
                    ) : null}
                    {s.subtitle ? (
                      <div
                        className={`mt-4 ${getSubtitleClass(s.subtitleSize)} font-normal text-slate-700`}
                        style={subtitleStyle}
                      >
                        {s.subtitle}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {slides.length > 1 ? (
          <>
            <button
              type="button"
              onClick={goPrev}
              aria-label="Anterior"
              className="absolute z-20 left-3 top-1/2 -translate-y-1/2 rounded-full border border-white/50 bg-white/90 px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-white"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={goNext}
              aria-label="Siguiente"
              className="absolute z-20 right-3 top-1/2 -translate-y-1/2 rounded-full border border-white/50 bg-white/90 px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-white"
            >
              ›
            </button>

            <div className="absolute z-20 bottom-3 left-0 right-0 flex items-center justify-center gap-2">
              {slides.map((s, i) => (
                <button
                  key={`${s.id ?? 'dot'}-${i}`}
                  type="button"
                  onClick={() => goTo(i)}
                  aria-label={`Ir al slide ${i + 1}`}
                  className={`h-2.5 w-2.5 rounded-full border transition-colors ${
                    i === activeIndex ? 'bg-blue-700 border-blue-700' : 'bg-white/80 border-white/80 hover:bg-white'
                  }`}
                />
              ))}
            </div>
          </>
        ) : null}
      </div>
    </section>
  )
}
