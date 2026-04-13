import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getServicios, getOfertas, getBanners } from '../api/publicApi'
import ServiceIcon from '../components/ServiceIcon'
import { resolvePublicLogoSize } from '../utils/logoSizing'
import { sanitizeFontSize, sanitizeHexColor } from '../utils/branding'
import { resolvePublicAssetUrl } from '../utils/publicAssetUrl'

/* ── Hero Section ── */
function HeroSection({ clinicName, publicLogoSrc, banners = [], sistemaUrl, slogan, sloganColor, nombreColor, nombreFontSize, logoSize }) {
  const [activeIdx, setActiveIdx] = useState(0)
  const [loadedByIdx, setLoadedByIdx] = useState({})
  const count = banners.length
  const safeNombreColor = sanitizeHexColor(nombreColor, 'var(--color-primary, #E85D8E)')
  const safeNombreFontSize = sanitizeFontSize(nombreFontSize, undefined)
  const safeSloganColor = sanitizeHexColor(sloganColor, 'var(--color-secondary, #3A4FA3)')

  useEffect(() => {
    setActiveIdx(0)
    setLoadedByIdx({})
  }, [count])

  useEffect(() => {
    if (count <= 1) return
    const id = setInterval(() => setActiveIdx((i) => (i + 1) % count), 5000)
    return () => clearInterval(id)
  }, [count])

  return (
    <section
      className="relative min-h-[80vh] flex items-center overflow-hidden"
      style={{ background: 'linear-gradient(135deg, var(--color-primary-light, #f8cdda), #c2e9fb, var(--color-accent, #e0c3fc)40)' }}
    >
      {/* Decorative particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-10 left-10 w-4 h-4 rounded-full bg-white/40 animate-pulse" />
        <div className="absolute top-1/3 right-1/4 w-6 h-6 rounded-full bg-white/30 animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute bottom-1/4 left-1/3 w-3 h-3 rounded-full bg-white/50 animate-pulse" style={{ animationDelay: '2s' }} />
        <div className="absolute top-1/2 left-1/6 w-5 h-5 rounded-full bg-white/20 animate-pulse" style={{ animationDelay: '0.5s' }} />
        {/* Wavy lines */}
        <svg className="absolute bottom-0 left-0 w-full opacity-20" viewBox="0 0 1440 100" fill="none">
          <path d="M0,50 C360,100 720,0 1080,50 C1260,75 1350,25 1440,50 L1440,100 L0,100Z" fill="var(--color-primary, #E85D8E)" />
        </svg>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 py-16 grid md:grid-cols-[0.9fr_1.1fr] lg:grid-cols-[0.85fr_1.15fr] gap-8 items-center w-full">
        {/* Left: text */}
        <div className="text-center md:text-left">
          <div className="flex items-center gap-3 justify-center md:justify-start mb-4">
            <img src={publicLogoSrc} alt="Logo" className="object-contain" style={{ height: logoSize.hero, width: 'auto', maxWidth: logoSize.hero * 5.2 }} />
          </div>
          <h1 className="font-bold" style={{ color: safeNombreColor, fontSize: safeNombreFontSize }}>
            {clinicName || 'Portal de Salud'}
          </h1>
          {slogan && (
            <p className="mt-2 text-xl font-medium" style={{ color: safeSloganColor }}>
              {slogan}
            </p>
          )}
          <div className="mt-6 flex gap-3 justify-center md:justify-start">
            <Link
              to="/conocenos"
              className="px-6 py-3 rounded-full text-white font-semibold shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300"
              style={{ backgroundColor: 'var(--color-secondary, #3A4FA3)' }}
            >
              Conócenos
            </Link>
            <a
              href={sistemaUrl}
              className="px-6 py-3 rounded-full font-semibold shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300 border-2"
              style={{ borderColor: 'var(--color-primary, #E85D8E)', color: 'var(--color-primary, #E85D8E)' }}
              rel="noopener noreferrer"
            >
              Ingresar al Sistema
            </a>
          </div>
        </div>
        {/* Right: banner images with crossfade */}
        <div className="flex justify-center md:justify-end md:pl-4 lg:pl-8">
          {count > 0 ? (
            <div
              className="relative rounded-3xl shadow-2xl w-full md:max-w-[820px] overflow-hidden h-[320px] sm:h-[360px] md:h-[480px] lg:h-[540px] xl:h-[580px]"
              style={{ background: 'linear-gradient(135deg, var(--color-primary-light, #fce7f3), #ffffff, var(--color-accent, #e0c3fc))' }}
            >
              <div
                className="absolute inset-0 transition-opacity duration-500"
                style={{
                  opacity: loadedByIdx[activeIdx] ? 0 : 1,
                  background: 'linear-gradient(135deg, var(--color-primary-light, #fce7f3), #ffffff, var(--color-accent, #e0c3fc))',
                }}
              >
                <div className="absolute inset-0 animate-pulse bg-white/25" />
              </div>
              {banners.map((b, i) => {
                const srcPath = b?.imagen_url || b?.imagen_fija_url || ''
                const src = srcPath ? resolvePublicAssetUrl(srcPath) : null
                if (!src) return null
                return (
                  <React.Fragment key={b.id || i}>
                    <div
                      className="absolute inset-0 hidden md:block transition-opacity duration-1000 ease-in-out"
                      style={{ opacity: i === activeIdx ? 1 : 0 }}
                      aria-hidden
                    >
                      <img
                        src={src}
                        alt=""
                        className="absolute inset-0 w-full h-full object-cover scale-105 blur-md opacity-35"
                      />
                      <div className="absolute inset-0 bg-white/35" />
                    </div>
                    <img
                      src={src}
                      alt={b?.titulo || clinicName}
                      className="absolute inset-0 w-full h-full object-contain object-center transition-opacity duration-1000 ease-in-out"
                      style={{ opacity: i === activeIdx ? 1 : 0 }}
                      onLoad={() => setLoadedByIdx((prev) => ({ ...prev, [i]: true }))}
                      onError={() => setLoadedByIdx((prev) => ({ ...prev, [i]: true }))}
                    />
                  </React.Fragment>
                )
              })}
              {/* Banner indicators */}
              {count > 1 && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-10">
                  {banners.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setActiveIdx(i)}
                      aria-label={`Banner ${i + 1}`}
                      className="w-2.5 h-2.5 rounded-full transition-all duration-300"
                      style={{
                        backgroundColor: i === activeIdx ? 'var(--color-primary, #E85D8E)' : 'rgba(255,255,255,0.6)',
                        transform: i === activeIdx ? 'scale(1.3)' : 'scale(1)',
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-3xl shadow-2xl w-full md:max-w-[820px] h-[320px] sm:h-[360px] md:h-[480px] lg:h-[540px] xl:h-[580px] flex items-center justify-center" style={{ background: 'linear-gradient(135deg, var(--color-primary-light), var(--color-accent, #A084DC)30)' }}>
              <img src={publicLogoSrc} alt="Logo" className="object-contain opacity-50" style={{ height: logoSize.decorative, width: 'auto', maxWidth: logoSize.decorative * 5.2 }} />
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

/* ── Services Section ── */
function ServicesSection({ servicios, loading }) {
  const display = servicios.slice(0, 3)
  return (
    <section className="py-16 px-4">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-3xl font-bold text-gray-900 italic mb-8">Nuestros Servicios</h2>
        {loading ? (
          <div className="text-center text-gray-500 py-8">Cargando servicios...</div>
        ) : display.length === 0 ? (
          <div className="text-center text-gray-500 py-8">Aún no hay servicios publicados.</div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {display.map((s) => (
              <div
                key={s.id}
                className="bg-white rounded-[20px] p-6 shadow-[0_10px_30px_rgba(0,0,0,0.08)] hover:shadow-[0_15px_40px_rgba(0,0,0,0.12)] hover:-translate-y-1 transition-all duration-300 text-center"
              >
                <div className="mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: 'var(--color-primary-light, #fce7f3)' }}>
                  <ServiceIcon name={s.icono} className="text-2xl" style={{ color: 'var(--color-primary, #E85D8E)' }} />
                </div>
                <h3 className="text-lg font-bold text-gray-900">{s.titulo}</h3>
                {s.descripcion && (
                  <p className="mt-2 text-sm text-gray-600 line-clamp-3">{s.descripcion}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

/* ── About Section ── */
function AboutSection({ clinicName, banner }) {
  const imageCandidates = [
    banner?.imagen_conocenos_url || '',
    banner?.imagen_fija_url || '',
    banner?.imagen_url || '',
  ].map((x) => String(x || '').trim()).filter(Boolean)

  const uniqueCandidates = Array.from(new Set(imageCandidates))
  const [aboutImgIndex, setAboutImgIndex] = useState(0)

  useEffect(() => {
    setAboutImgIndex(0)
  }, [banner?.id, uniqueCandidates.length])

  const aboutImg = uniqueCandidates[aboutImgIndex] ? resolvePublicAssetUrl(uniqueCandidates[aboutImgIndex]) : null
  return (
    <section className="py-16 px-4 bg-gray-50/50">
      <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-10 items-center">
        <div>
          <h2 className="text-3xl font-bold text-gray-900 italic mb-4">Sobre Nosotros</h2>
          <p className="text-gray-600 leading-relaxed mb-3">
            En {clinicName || 'nuestra clínica'} nos especializamos en brindar atención integral y personalizada.
            Nuestro equipo de especialistas está comprometido con la salud y el bienestar de cada uno de nuestros pacientes,
            ofreciendo servicios de alta calidad en un entorno seguro y acogedor.
          </p>
          <p className="text-gray-600 leading-relaxed mb-6">
            Nuestra misión es acompañar a nuestros pacientes en todas las etapas de su vida,
            atendiendo sus necesidades de salud con profesionalismo y calidez.
          </p>
          <Link
            to="/conocenos"
            className="inline-block px-6 py-3 rounded-full text-white font-semibold shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300"
            style={{ backgroundColor: 'var(--color-secondary, #3A4FA3)' }}
          >
            Conócenos
          </Link>
        </div>
        <div className="flex justify-center">
          {aboutImg ? (
            <img
              src={aboutImg}
              alt="Nosotros"
              className="rounded-3xl shadow-xl max-h-[400px] object-cover w-full"
              onError={() => {
                setAboutImgIndex((prev) => {
                  if (prev + 1 < uniqueCandidates.length) return prev + 1
                  return prev
                })
              }}
            />
          ) : (
            <div className="rounded-3xl shadow-xl w-full h-72 flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200">
              <span className="text-gray-400 text-lg">Imagen no disponible</span>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

/* ── Testimonials Section ── */
function TestimonialsSection() {
  const testimonials = [
    { name: 'Ana Rodriguez', role: 'Excelente atención', stars: 5, text: 'El equipo ha sido increíble. Me hicieron sentir cómoda y segura en todo momento, siempre explicando cada paso y resolviendo mis dudas. Gracias por su atención y calidez.' },
    { name: 'Laura Martínez', role: 'Altamente recomendable', stars: 5, text: 'Desde el momento en que entré, supe que estaba en buenas manos. El trato es profesional y cálido. Resolvieron mis preocupaciones y me brindaron un excelente cuidado personal.' },
  ]

  return (
    <section className="py-12 px-4">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-3xl font-bold text-gray-900 italic mb-6">Testimonios</h2>
        <div className="space-y-4">
          {testimonials.map((t, i) => (
            <div key={i} className="bg-white rounded-[20px] p-5 shadow-[0_10px_30px_rgba(0,0,0,0.08)] flex gap-4 items-start">
              <div className="shrink-0 w-14 h-14 rounded-full flex items-center justify-center text-white text-xl font-bold" style={{ backgroundColor: 'var(--color-primary, #E85D8E)' }}>
                {t.name.charAt(0)}
              </div>
              <div className="min-w-0">
                <div className="font-bold text-gray-900">{t.name}</div>
                <div className="text-xs text-gray-500">{t.role}</div>
                <div className="flex gap-0.5 mt-1">
                  {Array.from({ length: t.stars }).map((_, j) => (
                    <svg key={j} className="w-4 h-4" fill="#facc15" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
                <p className="mt-2 text-sm text-gray-600">{t.text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ── FAQ Section ── */
function FAQSection() {
  const faqs = [
    { q: '¿Qué servicios ofrecemos?', a: 'Ofrecemos una amplia gama de servicios médicos especializados. Consulta nuestra sección de servicios para más detalles.' },
    { q: '¿Cómo puedo agendar una cita?', a: 'Puedes agendar tu cita a través de nuestro sistema en línea o llamando a nuestro número de contacto.' },
    { q: '¿Cuáles son los horarios de atención?', a: 'Atendemos de lunes a sábado. Consulta nuestra sección de contacto para horarios específicos.' },
    { q: '¿Aceptan seguros médicos?', a: 'Sí, trabajamos con varias aseguradoras. Contáctanos para verificar la cobertura de tu seguro.' },
  ]
  const [openIdx, setOpenIdx] = useState(null)

  return (
    <section className="py-12 px-4">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-3xl font-bold text-gray-900 mb-6">Preguntas Frecuentes</h2>
        <div className="space-y-3">
          {faqs.map((f, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
              <button
                type="button"
                onClick={() => setOpenIdx(openIdx === i ? null : i)}
                className="w-full p-4 text-left flex items-center justify-between gap-3 hover:bg-gray-50 transition-colors"
              >
                <span className="font-semibold text-gray-800">{f.q}</span>
                <svg
                  className={`w-5 h-5 shrink-0 text-gray-400 transition-transform duration-200 ${openIdx === i ? 'rotate-180' : ''}`}
                  fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {openIdx === i && (
                <div className="px-4 pb-4 text-sm text-gray-600 border-t border-gray-100 pt-3">
                  {f.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ── Contact / Map Section ── */
function ContactMapSection({ configuracion }) {
  const cfg = configuracion || {}
  const mapsEmbedSrc = ((
    cfg.google_maps_embed ||
    import.meta.env.VITE_PUBLIC_MAP_EMBED_SRC ||
    'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3947.1003684427533!2d-74.54990752410586!3d-8.391788584656554!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x91a3bd84abc5f5db%3A0x72cd3f56488f2aed!2sPolicl%C3%ADnico%20Dos%20de%20Mayo!5e0!3m2!1ses-419!2spe!4v1767937155771!5m2!1ses-419!2spe'
  ) + '').trim()

  const direccion = (cfg.direccion || '').trim()
  const telefono = (cfg.telefono || '').trim()
  const email = (cfg.email || '').trim()

  return (
    <section className="py-16 px-4 bg-gray-50/50">
      <div className="max-w-6xl mx-auto">
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {/* Contacto */}
          <div>
            <h3 className="text-lg font-bold mb-3" style={{ color: 'var(--color-secondary, #3A4FA3)' }}>Contacto</h3>
            <div className="space-y-2 text-sm text-gray-600">
              {direccion && (
                <div className="flex items-start gap-2">
                  <svg className="w-4 h-4 mt-0.5 shrink-0" style={{ color: 'var(--color-primary, #E85D8E)' }} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span>{direccion}</span>
                </div>
              )}
              {telefono && (
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 shrink-0" style={{ color: 'var(--color-primary, #E85D8E)' }} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  <a href={`tel:${telefono.replace(/\s/g, '')}`} className="hover:underline">{telefono}</a>
                </div>
              )}
              {email && (
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 shrink-0" style={{ color: 'var(--color-primary, #E85D8E)' }} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <a href={`mailto:${email}`} className="hover:underline">{email}</a>
                </div>
              )}
            </div>
          </div>

          {/* Enlaces */}
          <div>
            <h3 className="text-lg font-bold mb-3" style={{ color: 'var(--color-secondary, #3A4FA3)' }}>Enlaces</h3>
            <div className="space-y-2 text-sm">
              <Link to="/" className="flex items-center gap-1 text-gray-600 hover:text-gray-900">› Inicio</Link>
              <Link to="/servicios" className="flex items-center gap-1 text-gray-600 hover:text-gray-900">› Servicios</Link>
              <Link to="/conocenos" className="flex items-center gap-1 text-gray-600 hover:text-gray-900">› Nosotros</Link>
              <Link to="/ofertas" className="flex items-center gap-1 text-gray-600 hover:text-gray-900">› Ofertas</Link>
            </div>
          </div>

          {/* Servicios list */}
          <div>
            <h3 className="text-lg font-bold mb-3" style={{ color: 'var(--color-secondary, #3A4FA3)' }}>Servicios</h3>
            <div className="space-y-2 text-sm text-gray-600">
              <div>› Consultas Médicas</div>
              <div>› Laboratorio</div>
              <div>› Ecografía</div>
            </div>
          </div>

          {/* Map */}
          <div>
            <h3 className="text-lg font-bold mb-3" style={{ color: 'var(--color-secondary, #3A4FA3)' }}>Ubicación</h3>
            <div className="rounded-xl overflow-hidden border border-gray-200 h-48">
              <iframe
                src={mapsEmbedSrc}
                width="100%"
                height="100%"
                style={{ border: 0 }}
                allowFullScreen=""
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ── Main Landing HomePage ── */
export default function HomePageLanding({
  sistemaUrl,
  publicLogoSrc = `${import.meta.env.BASE_URL}2demayo.svg`,
  clinicName = 'Portal de Salud',
  configuracion,
  logoSize,
}) {
  const resolvedLogoSize = logoSize || resolvePublicLogoSize(configuracion?.logo_size_publico)
  const [loading, setLoading] = useState(true)
  const [servicios, setServicios] = useState([])
  const [banners, setBanners] = useState([])

  useEffect(() => {
    let cancelled = false
    async function run() {
      setLoading(true)
      try {
        const [s, , b] = await Promise.all([getServicios(), getOfertas(), getBanners()])
        if (cancelled) return
        setServicios(Array.isArray(s) ? s : [])
        setBanners(Array.isArray(b) ? b : [])
      } catch {
        // silent
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [])

  const aboutBanner = banners.find((b) => (b?.imagen_conocenos_url || '').trim() !== '') || banners[1] || banners[0] || null

  return (
    <div className="-mt-28">
      <HeroSection
        clinicName={clinicName}
        publicLogoSrc={publicLogoSrc}
        banners={banners}
        sistemaUrl={sistemaUrl}
        slogan={configuracion?.slogan}
        sloganColor={configuracion?.slogan_color}
        nombreColor={configuracion?.nombre_color}
        nombreFontSize={configuracion?.nombre_font_size}
        logoSize={resolvedLogoSize}
      />
      <ServicesSection servicios={servicios} loading={loading} />
      <AboutSection clinicName={clinicName} banner={aboutBanner} />
      <div className="max-w-6xl mx-auto px-4 grid md:grid-cols-2 gap-6">
        <TestimonialsSection />
        <FAQSection />
      </div>
      <ContactMapSection configuracion={configuracion} />
    </div>
  )
}
