import { Icon } from '@fluentui/react';
import Footer from "../comunes/Footer";
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { BASE_URL } from "../../config/config";
import SidebarMedico from "../sidebar/SidebarMedico";
import SidebarEnfermero from "../sidebar/SidebarEnfermero";
import SidebarLaboratorista from "../sidebar/SidebarLaboratorista";
import SidebarQuimico from "../sidebar/SidebarQuimico";
import SidebarRecepcionista from "../sidebar/SidebarRecepcionista";
import SidebarAdmin from "../sidebar/SidebarAdmin";
import QuoteCartPanel from "../cotizacion/QuoteCartPanel";

const BRAND_STORAGE_KEY = "clinica_brand_cache";

function resolveSystemLogoSize(sizeOption) {
  const key = String(sizeOption || "").trim().toLowerCase();
  const sizes = {
    sm: { sidebarFrame: 56, sidebarImage: 40, navbarImage: 36 },
    md: { sidebarFrame: 64, sidebarImage: 48, navbarImage: 40 },
    lg: { sidebarFrame: 80, sidebarImage: 60, navbarImage: 52 },
    xl: { sidebarFrame: 96, sidebarImage: 72, navbarImage: 64 },
    xxl: { sidebarFrame: 112, sidebarImage: 84, navbarImage: 74 },
  };
  return sizes[key] || sizes.md;
}

function readBrandCache() {
  try {
    const raw = sessionStorage.getItem(BRAND_STORAGE_KEY);
    if (!raw) return { nombre: "", logo_url: "", logo_size_sistema: "", logo_shape_sistema: "auto", updated_at: 0 };
    const parsed = JSON.parse(raw);
    return {
      nombre: String(parsed?.nombre || "").trim(),
      logo_url: String(parsed?.logo_url || "").trim(),
      logo_size_sistema: String(parsed?.logo_size_sistema || "").trim(),
      logo_shape_sistema: String(parsed?.logo_shape_sistema || "auto").trim(),
      updated_at: Number(parsed?.updated_at || 0),
    };
  } catch {
    return { nombre: "", logo_url: "", logo_size_sistema: "", logo_shape_sistema: "auto", updated_at: 0 };
  }
}

function writeBrandCache(partial) {
  const prev = readBrandCache();
  const next = {
    nombre: typeof partial?.nombre === "string" ? partial.nombre : prev.nombre,
    logo_url: typeof partial?.logo_url === "string" ? partial.logo_url : prev.logo_url,
    logo_size_sistema: typeof partial?.logo_size_sistema === "string" ? partial.logo_size_sistema : prev.logo_size_sistema,
    logo_shape_sistema: typeof partial?.logo_shape_sistema === "string" ? partial.logo_shape_sistema : prev.logo_shape_sistema,
    updated_at: Number(partial?.updated_at || Date.now()),
  };
  sessionStorage.setItem(BRAND_STORAGE_KEY, JSON.stringify(next));
}

function applyFavicon(iconHref) {
  const href = String(iconHref || '').trim() || '/2demayo.svg';
  let link = document.querySelector("link[rel='icon']");
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = href;
}

function resolveLogoUrl(logoPath, versionToken) {
  const fallback = "/2demayo.svg";
  const raw = String(logoPath || "").trim();
  if (!raw) return fallback;
  let url = raw;
  if (!/^(https?:\/\/|data:|blob:)/i.test(raw)) {
    const base = String(BASE_URL || "").replace(/\/+$/, "");
    url = `${base}/${raw.replace(/^\/+/, "")}`;
  }
  const v = encodeURIComponent(String(versionToken || ""));
  if (!v) return url;
  return `${url}${url.includes("?") ? "&" : "?"}v=${v}`;
}

async function detectLogoIsWide(imageSrc) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const naturalW = Number(img.naturalWidth || 0);
        const naturalH = Number(img.naturalHeight || 0);
        if (naturalW <= 0 || naturalH <= 0) {
          resolve(true);
          return;
        }

        const canvas = document.createElement('canvas');
        canvas.width = naturalW;
        canvas.height = naturalH;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        if (!ctx) {
          resolve((naturalW / naturalH) > 1.25);
          return;
        }

        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, naturalW, naturalH).data;

        let minX = naturalW;
        let minY = naturalH;
        let maxX = -1;
        let maxY = -1;

        for (let y = 0; y < naturalH; y++) {
          for (let x = 0; x < naturalW; x++) {
            const alpha = data[(y * naturalW + x) * 4 + 3];
            if (alpha > 12) {
              if (x < minX) minX = x;
              if (y < minY) minY = y;
              if (x > maxX) maxX = x;
              if (y > maxY) maxY = y;
            }
          }
        }

        if (maxX < minX || maxY < minY) {
          resolve((naturalW / naturalH) > 1.25);
          return;
        }

        const visibleW = maxX - minX + 1;
        const visibleH = maxY - minY + 1;
        resolve((visibleW / visibleH) > 1.18);
      } catch {
        const w = Number(img.naturalWidth || 1);
        const h = Number(img.naturalHeight || 1);
        resolve((w / h) > 1.25);
      }
    };

    img.onerror = () => resolve(true);
    img.src = imageSrc || '/2demayo.svg';
  });
}

function Sidebar({ open, onClose, onLogout, usuario, logoSrc, clinicName, logoSize, logoIsWide }) {
  // Sidebar fijo en PC (md+), drawer en móvil/tablet
  return (
    <>
      {/* Overlay para móvil/tablet */}
      <div
        className={`fixed inset-0 z-40 bg-black bg-opacity-40 transition-opacity duration-200 md:hidden ${open ? 'block' : 'hidden'}`}
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Sidebar */}
      <aside
        className={`fixed z-50 top-0 left-0 h-full w-64 bg-white border-r shadow-lg transform transition-transform duration-200 ease-in-out
        ${open ? 'translate-x-0' : '-translate-x-full'}
        md:translate-x-0 md:static md:flex md:flex-col md:z-10 md:h-auto md:shadow-none md:bg-white md:w-64`}
        style={{ borderColor: 'var(--color-accent)' }}
      >
        <div className="flex flex-col h-full min-h-0">
          <div className="flex flex-col items-center py-6 text-white rounded-b-2xl mx-2 mb-4 shadow-lg" style={{ background: 'linear-gradient(to bottom right, var(--color-sidebar-from), var(--color-sidebar-via), var(--color-sidebar-to))' }}>
            <div className="relative">
              <div className={`absolute inset-0 bg-white/20 blur-md ${logoIsWide ? 'rounded-2xl' : 'rounded-full'}`}></div>
              <div
                className={`relative bg-white shadow-lg ring-4 ring-white/30 flex items-center justify-center ${logoIsWide ? 'rounded-2xl px-3' : 'rounded-full'}`}
                style={{
                  height: logoSize.sidebarFrame,
                  width: logoIsWide ? Math.min(Math.round(logoSize.sidebarFrame * 1.55), 180) : logoSize.sidebarFrame,
                  maxWidth: logoIsWide ? 180 : logoSize.sidebarFrame,
                }}
              >
                <img 
                  src={logoSrc || "/2demayo.svg"}
                  alt="Logo" 
                  className="relative object-contain"
                  style={logoIsWide
                    ? {
                        height: Math.round(logoSize.sidebarFrame * 0.62),
                        width: 'auto',
                        maxWidth: Math.round(logoSize.sidebarFrame * 1.35),
                        transform: 'scale(1.65)',
                        transformOrigin: 'center',
                      }
                    : {
                        width: logoSize.sidebarImage,
                        height: logoSize.sidebarImage,
                        transform: 'scale(1.9)',
                        transformOrigin: 'center',
                      }}
                  onError={e => { e.target.onerror = null; e.target.src = '/2demayo.svg'; }} 
                />
              </div>
            </div>
            <h5 className="text-lg font-bold text-white mt-3 text-center drop-shadow-lg">{clinicName || "Sistema Clínico"}</h5>
            <div className="w-12 h-0.5 bg-white/30 rounded-full mt-2"></div>
          </div>
          <nav className="flex flex-col gap-3 px-4 flex-1 overflow-y-auto">
            {usuario?.rol === 'medico' && <SidebarMedico onClose={onClose} />}
            {usuario?.rol === 'enfermero' && <SidebarEnfermero onClose={onClose} />}
            {usuario?.rol === 'laboratorista' && <SidebarLaboratorista onClose={onClose} />}
            {(usuario?.rol === 'químico' || usuario?.rol === 'quimico') && <SidebarQuimico onClose={onClose} />}
            {usuario?.rol === 'recepcionista' && <SidebarRecepcionista onClose={onClose} usuario={usuario} />}
            {usuario?.rol === 'administrador' && <SidebarAdmin onClose={onClose} />}
            {/* Si el rol no coincide, mostrar Dashboard y Pacientes por defecto */}
            {!['medico','enfermero','laboratorista','químico','quimico','recepcionista','administrador'].includes(usuario?.rol) && (
              <>
                <Link to="/" className="group relative py-3 px-4 rounded-xl text-white font-semibold shadow-lg hover:shadow-xl transform hover:scale-[1.02] transition-all duration-300 flex items-center gap-3 overflow-hidden" style={{ background: 'linear-gradient(to right, var(--color-sidebar-from), var(--color-sidebar-via), var(--color-sidebar-to))' }} onClick={onClose}>
                  <Icon iconName="ViewDashboard" className="text-xl text-white" />
                  <span className="relative z-10 text-lg">Dashboard</span>
                </Link>
                <Link to="/pacientes" className="py-3 px-4 rounded-lg text-cyan-700 hover:bg-gradient-to-r hover:from-cyan-50 hover:to-blue-100 font-medium flex items-center gap-3 transition-all duration-300 hover:shadow-md hover:scale-[1.01]" onClick={onClose}>
                  <Icon iconName="People" className="text-xl text-cyan-600" />
                  <span>Pacientes</span>
                </Link>
              </>
            )}
          </nav>

          <div className="mt-auto p-4">
            <button 
              onClick={onLogout} 
              className="group w-full bg-gradient-to-r from-red-600 via-red-700 to-rose-800 text-white font-bold rounded-xl py-3 px-4 shadow-lg hover:shadow-xl transform hover:scale-[1.02] transition-all duration-300 flex items-center justify-center gap-3 relative overflow-hidden"
            >
              {/* Fondo animado */}
              <div className="absolute inset-0 bg-gradient-to-r from-red-700 via-rose-600 to-pink-700 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              
              {/* Icono */}
              <div className="relative z-10 flex items-center justify-center w-6 h-6 bg-white/20 rounded-lg backdrop-blur-sm">
                <Icon iconName="SignOut" className="text-lg text-white" />
              </div>
              
              {/* Texto */}
              <span className="relative z-10">Cerrar sesión</span>
              
              {/* Efecto de brillo */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

function Navbar({ usuario, onMenu, logoSrc, clinicName, logoSize, logoIsWide }) {
  // Botón hamburguesa a la derecha en móvil/tablet
  return (
    <header className="flex items-center justify-between px-6 py-3 shadow text-white" style={{ backgroundColor: 'var(--color-navbar-bg)' }}>
      <div className="flex items-center gap-3">
        <div
          className={`bg-white shadow flex items-center justify-center ${logoIsWide ? 'rounded-xl px-2 py-1' : 'rounded-full p-1'}`}
          style={{
            height: logoSize.navbarImage + 10,
            width: logoIsWide ? Math.min(logoSize.navbarImage + 44, 132) : logoSize.navbarImage + 10,
            maxWidth: logoIsWide ? 132 : logoSize.navbarImage + 10,
          }}
        >
          <img
            src={logoSrc || "/2demayo.svg"}
            alt="Logo"
            className="object-contain"
            style={logoIsWide
              ? {
                  height: Math.round(logoSize.navbarImage * 0.9),
                  width: 'auto',
                  maxWidth: Math.round(logoSize.navbarImage * 1.4),
                  transform: 'scale(1.55)',
                  transformOrigin: 'center',
                }
              : {
                  width: logoSize.navbarImage,
                  height: logoSize.navbarImage,
                  transform: 'scale(1.7)',
                  transformOrigin: 'center',
                }}
          />
        </div>
        <span className="text-xl font-bold drop-shadow">{clinicName || "Sistema Clínico"}</span>
      </div>
      <div className="flex items-center gap-4">
        <span className="font-semibold text-white/90">{usuario?.nombre} {usuario?.apellido || ""}</span>
        {/* Botón hamburguesa solo visible en móvil/tablet */}
        <button className="md:hidden ml-2" onClick={onMenu} aria-label="Abrir menú">
          <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
      </div>
    </header>
  );
}


// useEffect is already imported above via react import where needed

function DashboardLayout({ usuario, onLogout, children }) {
  const cachedBrand = readBrandCache();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [logoSrc, setLogoSrc] = useState(
    resolveLogoUrl(cachedBrand.logo_url || "", cachedBrand.updated_at || Date.now())
  );
  const [clinicName, setClinicName] = useState(cachedBrand.nombre || "");
  const [logoSizeSistema, setLogoSizeSistema] = useState(cachedBrand.logo_size_sistema || "");
  const [logoShapeSistema, setLogoShapeSistema] = useState(cachedBrand.logo_shape_sistema || "auto");
  const [logoIsWide, setLogoIsWide] = useState(true);
  const systemLogoSize = resolveSystemLogoSize(logoSizeSistema);
  const effectiveLogoIsWide = logoShapeSistema === 'wide' ? true : logoShapeSistema === 'round' ? false : logoIsWide;

  useEffect(() => {
    let mounted = true;
    detectLogoIsWide(logoSrc)
      .then((isWide) => {
        if (!mounted) return;
        setLogoIsWide(Boolean(isWide));
      })
      .catch(() => {
        if (!mounted) return;
        setLogoIsWide(true);
      });
    return () => {
      mounted = false;
    };
  }, [logoSrc]);

  useEffect(() => {
    let mounted = true;

    const applyLogo = (logoPath, versionToken) => {
      if (!mounted) return;
      setLogoSrc(resolveLogoUrl(logoPath, versionToken));
      writeBrandCache({ logo_url: String(logoPath || ""), updated_at: versionToken || Date.now() });
    };

    const applyLogoSize = (sizeOption) => {
      if (!mounted) return;
      const normalized = String(sizeOption || "").trim().toLowerCase();
      setLogoSizeSistema(normalized);
      writeBrandCache({ logo_size_sistema: normalized });
    };

    const applyLogoShape = (shapeOption) => {
      if (!mounted) return;
      const normalized = String(shapeOption || 'auto').trim().toLowerCase();
      const safeShape = ['auto', 'round', 'wide'].includes(normalized) ? normalized : 'auto';
      setLogoShapeSistema(safeShape);
      writeBrandCache({ logo_shape_sistema: safeShape });
    };

    const applyName = (name) => {
      if (!mounted) return;
      const n = String(name || "").trim();
      setClinicName(n);
      if (n) {
        writeBrandCache({ nombre: n });
      }
    };

    const loadConfigLogo = async () => {
      try {
        const res = await fetch(`${BASE_URL}api_get_configuracion.php`, {
          method: "GET",
          credentials: "include",
          cache: "no-store"
        });
        const data = await res.json();
        if (!mounted || !data?.success) return;
        const cfg = data.data || {};
        applyLogo(cfg.logo_url, cfg.updated_at || Date.now());
        applyName(cfg.nombre_clinica);
        applyLogoSize(cfg.logo_size_sistema);
        applyLogoShape(cfg.logo_shape_sistema);
      } catch {
        // keep fallback
      }
    };

    const onConfigUpdated = (event) => {
      const detail = event?.detail || {};
      applyLogo(detail.logo_url || "", detail.updated_at || Date.now());
      applyName(detail.nombre_clinica);
      applyLogoSize(detail.logo_size_sistema);
      applyLogoShape(detail.logo_shape_sistema);
    };

    loadConfigLogo();
    window.addEventListener("clinica-config-updated", onConfigUpdated);

    return () => {
      mounted = false;
      window.removeEventListener("clinica-config-updated", onConfigUpdated);
    };
  }, []);

  useEffect(() => {
    const safeName = String(clinicName || '').trim();
    document.title = safeName ? `${safeName} - Sistema` : 'Sistema';
  }, [clinicName]);

  useEffect(() => {
    applyFavicon(logoSrc);
  }, [logoSrc]);

  // Cierra el sidebar automáticamente al cambiar a móvil/tablet
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setSidebarOpen(false); // en PC, el sidebar siempre visible por CSS
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-blue-50 overflow-x-hidden">
      {/* Navbar at the top */}
      <Navbar usuario={usuario} onMenu={() => setSidebarOpen(true)} logoSrc={logoSrc} clinicName={clinicName} logoSize={systemLogoSize} logoIsWide={effectiveLogoIsWide} />
      <div className="flex flex-1 max-w-full">
        {/* Sidebar for navigation (fijo en PC, drawer en móvil/tablet) */}
        <Sidebar 
          open={sidebarOpen} 
          onClose={() => setSidebarOpen(false)} 
          onLogout={onLogout} 
          usuario={usuario}
          logoSrc={logoSrc}
          clinicName={clinicName}
          logoSize={systemLogoSize}
          logoIsWide={effectiveLogoIsWide}
        />
        <main className="flex-1 px-2 sm:px-4 md:px-8 min-w-0 max-w-full overflow-x-auto">
          {children}
          <QuoteCartPanel />
        </main>
      </div>
      {/* Footer at the bottom */}
      <Footer clinicName={clinicName} />
    </div>
  );
}

export default DashboardLayout;
