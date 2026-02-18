import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

function chunkIntoPages(items, pageSize) {
  const out = []
  for (let i = 0; i < items.length; i += pageSize) out.push(items.slice(i, i + pageSize))
  return out
}

export default function VerticalOffersSlider({
  offers,
  variants,
  intervalMs = 4500,
  className = '',
  cardHeightClassName = 'h-[132px]',
}) {
  const pages = useMemo(() => {
    if (!Array.isArray(offers) || offers.length === 0) return []
    const pageSize = 3
    const total = Math.ceil(offers.length / pageSize) * pageSize
    const normalized = Array.from({ length: total }, (_, i) => offers[i % offers.length])
    return chunkIntoPages(normalized, pageSize)
  }, [offers])

  const shouldLoop = pages.length > 1
  const extendedPages = useMemo(() => {
    if (!shouldLoop) return pages
    return [pages[pages.length - 1], ...pages, pages[0]]
  }, [pages, shouldLoop])

  const [pos, setPos] = useState(shouldLoop ? 1 : 0)
  const [isTransitioning, setIsTransitioning] = useState(false)

  const posRef = useRef(pos)
  posRef.current = pos
  const transitioningRef = useRef(isTransitioning)
  transitioningRef.current = isTransitioning

  const trackRef = useRef(null)

  useEffect(() => {
    setIsTransitioning(false)
    setPos(shouldLoop ? 1 : 0)
  }, [shouldLoop, pages.length])

  const stepPct = extendedPages.length > 0 ? 100 / extendedPages.length : 100

  const goToPos = useCallback(
    (nextPos) => {
      if (pages.length <= 1) return
      if (transitioningRef.current) return

      let targetPos = nextPos
      if (shouldLoop) {
        const minPos = 0
        const maxPos = pages.length + 1
        if (targetPos < minPos) targetPos = minPos
        if (targetPos > maxPos) targetPos = maxPos
      } else {
        const minPos = 0
        const maxPos = pages.length - 1
        if (targetPos < minPos) targetPos = minPos
        if (targetPos > maxPos) targetPos = maxPos
      }

      if (targetPos === posRef.current) return
      setIsTransitioning(true)
      setPos(targetPos)
    },
    [pages.length, shouldLoop]
  )

  useEffect(() => {
    if (!shouldLoop) return
    if (pages.length <= 1) return

    const ms = Number(intervalMs)
    if (!Number.isFinite(ms) || ms <= 0) return

    const id = window.setInterval(() => {
      goToPos(posRef.current + 1)
    }, ms)

    return () => window.clearInterval(id)
  }, [goToPos, intervalMs, pages.length, shouldLoop])

  useEffect(() => {
    if (!shouldLoop) {
      setIsTransitioning(false)
      return
    }

    const el = trackRef.current
    if (!el) return

    const onEnd = (e) => {
      if (e && e.target !== el) return
      const currentPos = posRef.current
      if (currentPos === 0) {
        setIsTransitioning(false)
        setPos(pages.length)
        return
      }
      if (currentPos === pages.length + 1) {
        setIsTransitioning(false)
        setPos(1)
        return
      }
      setIsTransitioning(false)
    }

    el.addEventListener('transitionend', onEnd)
    return () => el.removeEventListener('transitionend', onEnd)
  }, [pages.length, shouldLoop])

  if (!pages.length) return null

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <div className="h-[420px] sm:h-[450px]">
        <div
          ref={trackRef}
          className={`absolute inset-x-0 top-0 flex w-full flex-col will-change-transform ${
            isTransitioning ? 'transition-transform duration-700 ease-in-out' : 'transition-none'
          }`}
          style={{ height: `${extendedPages.length * 100}%`, transform: `translateY(-${pos * stepPct}%)` }}
        >
          {extendedPages.map((page, pageIdx) => (
            <div key={`page-${pageIdx}`} className="w-full shrink-0" style={{ height: `${stepPct}%` }}>
              <div className="h-full grid gap-3">
                {page.map((o, idx) => {
                  const v = Array.isArray(variants) && variants.length ? variants[(pageIdx * 3 + idx) % variants.length] : null
                  return (
                    <div
                      key={`${o?.id ?? 'offer'}-${pageIdx}-${idx}`}
                      className={`rounded-xl border p-4 transition hover:shadow-sm ${v?.wrap || 'bg-white'} ${cardHeightClassName} flex flex-col justify-between`}
                    >
                      <div className="min-w-0">
                        <div className="font-semibold leading-snug line-clamp-1">{o?.titulo || ''}</div>
                        {o?.descripcion ? (
                          <div className="text-sm text-slate-700 mt-1 line-clamp-2">{o.descripcion}</div>
                        ) : null}
                      </div>

                      {o?.precio_oferta ? (
                        <div className="mt-2 text-sm">
                          <span className={`font-semibold ${v?.price || 'text-slate-900'}`}>S/ {o.precio_oferta}</span>
                          {o?.precio_antes ? (
                            <span className="ml-2 text-slate-500 line-through">S/ {o.precio_antes}</span>
                          ) : null}
                        </div>
                      ) : (
                        <div />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
