import React, { useEffect, useMemo, useRef, useState } from 'react'

function formatNumber(value) {
  try {
    return new Intl.NumberFormat('es-PE').format(value)
  } catch {
    return String(value)
  }
}

export default function CountUpNumber({
  value,
  durationMs = 1200,
  start = 0,
  className = '',
  format = true,
}) {
  const target = useMemo(() => {
    const n = Number(value)
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0
  }, [value])

  const [display, setDisplay] = useState(() => {
    const n = Number(start)
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0
  })

  const rafRef = useRef(0)
  const startedRef = useRef(false)
  const elRef = useRef(null)

  useEffect(() => {
    const n = Number(start)
    const initial = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0
    startedRef.current = false
    setDisplay(initial)
  }, [start, target])

  useEffect(() => {
    const startAnimation = () => {
      if (startedRef.current) return
      startedRef.current = true

      const n = Number(start)
      const from = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0
      const to = target
      if (to <= from) {
        setDisplay(to)
        return
      }

      const ms = Number(durationMs)
      const dur = Number.isFinite(ms) && ms > 0 ? ms : 1200
      const t0 = performance.now()

      const tick = (t) => {
        const p = Math.min(1, (t - t0) / dur)
        const eased = 1 - Math.pow(1 - p, 3)
        const next = Math.floor(from + (to - from) * eased)
        setDisplay(next)
        if (p < 1) rafRef.current = requestAnimationFrame(tick)
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    if (!('IntersectionObserver' in window)) {
      startAnimation()
      return () => cancelAnimationFrame(rafRef.current)
    }

    const observeEl = elRef.current
    if (!observeEl) return

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((x) => x.isIntersecting)) {
          startAnimation()
          io.disconnect()
        }
      },
      { threshold: 0.25 }
    )

    io.observe(observeEl)
    return () => {
      io.disconnect()
      cancelAnimationFrame(rafRef.current)
    }
  }, [target, durationMs, start])

  return (
    <span ref={elRef} className={className}>
      {format ? formatNumber(display) : display}
    </span>
  )
}
