import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getBanners } from '../api/publicApi'
import { resolvePublicLogoSize } from '../utils/logoSizing'
import { resolvePublicAssetUrl } from '../utils/publicAssetUrl'

export default function ConocenosPage({
  clinicName = 'Portal de Salud',
  publicLogoSrc = `${import.meta.env.BASE_URL}2demayo.svg`,
  logoSize,
}) {
  const resolvedLogoSize = logoSize || resolvePublicLogoSize()
  const [banners, setBanners] = useState([])

  useEffect(() => {
    let cancelled = false
    async function run() {
      try {
        const b = await getBanners()
        if (!cancelled) setBanners(Array.isArray(b) ? b : [])
      } catch {
        if (!cancelled) setBanners([])
      }
    }
    run()
    return () => { cancelled = true }
  }, [])

  const conocenosBanner = useMemo(() => {
    if (!Array.isArray(banners) || banners.length === 0) return null
    return banners.find((b) => (b?.imagen_conocenos_url || '').trim() !== '') || banners[0]
  }, [banners])

  const imageCandidates = useMemo(() => {
    const list = [
      conocenosBanner?.imagen_conocenos_url || '',
      conocenosBanner?.imagen_fija_url || '',
      conocenosBanner?.imagen_url || '',
    ].map((x) => resolvePublicAssetUrl(x)).filter(Boolean)
    return Array.from(new Set(list))
  }, [conocenosBanner])

  const [imageIndex, setImageIndex] = useState(0)
  useEffect(() => {
    setImageIndex(0)
  }, [conocenosBanner?.id, imageCandidates.length])

  const conocenosImage = imageCandidates[imageIndex] || ''
  const cards = [
    {
      title: 'Nuestra Misión',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5a17.92 17.92 0 01-8.716-2.247m0 0A8.966 8.966 0 013 12c0-1.264.26-2.467.732-3.558" />
        </svg>
      ),
      desc: 'Brindar atención médica integral, accesible y de calidad, centrada en el bienestar y la satisfacción de nuestros pacientes. Trabajamos con compromiso, ética y profesionalismo.',
    },
    {
      title: 'Nuestro Equipo',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
        </svg>
      ),
      desc: 'Contamos con un equipo multidisciplinario de profesionales de la salud altamente calificados y comprometidos con la excelencia en cada especialidad que ofrecemos.',
    },
    {
      title: 'Nuestras Instalaciones',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 0h.008v.008h-.008V7.5z" />
        </svg>
      ),
      desc: 'Nuestras instalaciones están equipadas con tecnología moderna y espacios diseñados para brindar comodidad, seguridad e higiene durante cada visita.',
    },
  ]

  return (
    <div className="-mt-28 pt-28 bg-white">
      {/* Breadcrumb */}
      <div className="max-w-6xl mx-auto px-4 py-4">
        <nav className="text-sm" style={{ color: 'var(--color-primary, #E85D8E)' }}>
          <Link to="/" className="hover:underline" style={{ color: 'var(--color-primary, #E85D8E)' }}>Inicio</Link>
          <span className="mx-2">/</span>
          <span className="font-semibold" style={{ color: 'var(--color-primary, #E85D8E)' }}>Conócenos</span>
        </nav>
      </div>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 pb-12">
        <div className="grid md:grid-cols-2 gap-10 items-center">
          <div>
            <h1 className="text-4xl md:text-5xl font-bold mb-4" style={{ color: 'var(--color-primary, #E85D8E)' }}>
              Conócenos
            </h1>
            <p className="leading-relaxed text-lg font-medium" style={{ color: 'var(--color-secondary, #3A4FA3)' }}>
              En <strong style={{ color: 'var(--color-primary, #E85D8E)' }}>{clinicName}</strong> somos un equipo de profesionales
              dedicados a brindar atención médica de calidad. Acompañamos a nuestros pacientes
              en su cuidado integral, con tecnología moderna y un trato humano y personalizado.
            </p>
          </div>
          <div className="flex justify-center">
            <div
              className="rounded-3xl shadow-xl w-full h-72 flex items-center justify-center overflow-hidden"
              style={{ background: 'linear-gradient(135deg, var(--color-primary-light, #fce7f3), var(--color-accent, #e0c3fc)30)' }}
            >
              {conocenosImage ? (
                <img
                  src={conocenosImage}
                  alt="Equipo de la clinica"
                  className="h-full w-full object-cover"
                  onError={() => {
                    setImageIndex((prev) => {
                      if (prev + 1 < imageCandidates.length) return prev + 1
                      return prev
                    })
                  }}
                />
              ) : (
                <img src={publicLogoSrc} alt="Logo" className="object-contain opacity-60" style={{ width: resolvedLogoSize.decorative, height: resolvedLogoSize.decorative }} />
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Cards */}
      <section className="py-12 px-4 bg-white">
        <div className="max-w-6xl mx-auto grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {cards.map((c, i) => (
            <div
              key={i}
              className="rounded-[20px] p-6 shadow-[0_10px_30px_rgba(0,0,0,0.08)] hover:shadow-[0_15px_40px_rgba(0,0,0,0.12)] hover:-translate-y-1 transition-all duration-300"
              style={{ backgroundColor: 'var(--color-primary-light, #fce7f3)', border: '2px solid var(--color-primary, #E85D8E)' }}
            >
              <div className="w-14 h-14 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: 'white', color: 'var(--color-primary, #E85D8E)' }}>
                {c.icon}
              </div>
              <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--color-primary, #E85D8E)' }}>{c.title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--color-secondary, #3A4FA3)' }}>{c.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
