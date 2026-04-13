
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BASE_URL, SECURITY_CONFIG } from "../../config/config";
import { Icon } from '@fluentui/react';
import { normalizePermisos } from "../../config/recepcionPermisos";

const LOGIN_BRAND_CACHE_KEY = 'login_brand_cache_v1';
const FALLBACK_LOGO_SRC = `${import.meta.env.BASE_URL}2demayo.svg`;

function toAbsoluteLogoUrl(rawLogo) {
  const raw = String(rawLogo || '').trim();
  if (!raw) return '';
  if (/^(https?:\/\/|data:|blob:)/i.test(raw)) return raw;
  return `${String(BASE_URL || '').replace(/\/+$/, '')}/${raw.replace(/^\/+/, '')}`;
}

function readCachedBrand() {
  try {
    const raw = sessionStorage.getItem(LOGIN_BRAND_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const clinicName = String(parsed?.clinicName || '').trim();
    const logoSrc = String(parsed?.logoSrc || '').trim();
    if (!clinicName && !logoSrc) return null;
    return { clinicName, logoSrc };
  } catch {
    return null;
  }
}

function writeCachedBrand(brand) {
  try {
    sessionStorage.setItem(LOGIN_BRAND_CACHE_KEY, JSON.stringify({
      clinicName: String(brand?.clinicName || '').trim(),
      logoSrc: String(brand?.logoSrc || '').trim(),
      ts: Date.now(),
    }));
  } catch {
    // ignore cache write issues
  }
}

function preloadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(src);
    img.onerror = reject;
    img.src = src;
  });
}

function applyFavicon(iconHref) {
  const href = String(iconHref || '').trim() || FALLBACK_LOGO_SRC;
  let link = document.querySelector("link[rel='icon']");
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = href;
}

function Login({ onLogin }) {
  const cachedBrand = readCachedBrand();
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [logoSrc, setLogoSrc] = useState(cachedBrand?.logoSrc || '');
  const [clinicName, setClinicName] = useState(cachedBrand?.clinicName || '');
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;
    const loadLogo = async () => {
      try {
        const res = await fetch(BASE_URL + 'api_get_configuracion.php', {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store'
        });
        const data = await res.json();
        if (!mounted || !data?.success) return;
        const cfg = data.data || {};
        const configuredName = String(cfg.nombre_clinica || '').trim();
        if (configuredName && mounted) {
          setClinicName(configuredName);
        }

        const raw = String(cfg.logo_url || '').trim();
        const absolute = toAbsoluteLogoUrl(raw);
        let resolvedLogo = '';

        if (absolute) {
          const versionBase = String(cfg.updated_at || cfg.config_updated_at || '').trim();
          const versionToken = versionBase ? encodeURIComponent(versionBase) : '';
          const candidate = versionToken
            ? `${absolute}${absolute.includes('?') ? '&' : '?'}v=${versionToken}`
            : absolute;

          try {
            await preloadImage(candidate);
            resolvedLogo = candidate;
          } catch {
            resolvedLogo = '';
          }
        }

        if (mounted) {
          setLogoSrc((prev) => (prev === resolvedLogo ? prev : resolvedLogo));
        }

        writeCachedBrand({
          clinicName: configuredName,
          logoSrc: resolvedLogo,
        });
      } catch {
        if (mounted) {
          setLogoSrc('');
        }
      }
    };
    loadLogo();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const safeName = String(clinicName || '').trim();
    document.title = safeName ? `${safeName} - Acceso` : 'Acceso';
  }, [clinicName]);

  useEffect(() => {
    applyFavicon(logoSrc);
  }, [logoSrc]);

  // Validación de seguridad básica
  const validateSecurity = () => {
    // En producción, verificar HTTPS
    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
      return {
        isValid: false,
        message: "⚠️ Conexión insegura detectada. Se requiere HTTPS para proteger tus credenciales."
      };
    }

    // Validar longitud mínima de contraseña según configuración
    if (password.length < SECURITY_CONFIG.minPasswordLength) {
      return {
        isValid: false,
        message: `La contraseña debe tener al menos ${SECURITY_CONFIG.minPasswordLength} caracteres`
      };
    }
    return { isValid: true };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    
    // Validar seguridad ANTES de enviar
    const securityCheck = validateSecurity();
    if (!securityCheck.isValid) {
      setError(securityCheck.message);
      setLoading(false);
      return;
    }
    
    const esEmail = usuario.includes("@") && usuario.includes(".");
    try {
      if (esEmail) {
        // 1. Intentar login como médico
        let resMedico, dataMedico;
        try {
          resMedico = await fetch(BASE_URL + "api_login_medico.php", {
            method: "POST",
            headers: { 
              "Content-Type": "application/json",
              "X-Requested-With": "XMLHttpRequest"
            },
            body: JSON.stringify({ email: usuario, password }),
            credentials: "include"
          });
          dataMedico = await resMedico.json();
        } catch {
          resMedico = { ok: false };
          dataMedico = {};
        }
        if (resMedico.ok && dataMedico.success) {
          const medicoConRol = { ...dataMedico.medico, rol: 'medico' };
          sessionStorage.removeItem('usuario');
          sessionStorage.removeItem('user_role');
          sessionStorage.setItem('medico', JSON.stringify(medicoConRol));
          onLogin && onLogin(medicoConRol);
          navigate("/");
          return;
        }
        // Si falla, intentar como usuario normal
        let res, data;
        try {
          res = await fetch(BASE_URL + "api_login.php", {
            method: "POST",
            headers: { 
              "Content-Type": "application/json",
              "X-Requested-With": "XMLHttpRequest"
            },
            body: JSON.stringify({ usuario, password }),
            credentials: "include"
          });
          data = await res.json();
        } catch {
          res = { ok: false };
          data = {};
        }
        if (res.ok && data.success) {
          const usuarioNormalizado = {
            ...data.usuario,
            permisos: normalizePermisos(data?.usuario?.permisos || []),
          };
          sessionStorage.removeItem('medico');
          sessionStorage.setItem('usuario', JSON.stringify(usuarioNormalizado));
          // Guardar el rol explícitamente para uso global
          if (usuarioNormalizado.rol) {
            sessionStorage.setItem('user_role', usuarioNormalizado.rol);
          } else {
            sessionStorage.setItem('user_role', 'recepcionista');
          }
          onLogin && onLogin(usuarioNormalizado);
          navigate("/");
          return;
        }
      } else {
        // 1. Intentar login como usuario normal
        let res, data;
        try {
          res = await fetch(BASE_URL + "api_login.php", {
            method: "POST",
            headers: { 
              "Content-Type": "application/json",
              "X-Requested-With": "XMLHttpRequest"
            },
            body: JSON.stringify({ usuario, password }),
            credentials: "include"
          });
          data = await res.json();
        } catch {
          res = { ok: false };
          data = {};
        }
        if (res.ok && data.success) {
          const usuarioNormalizado = {
            ...data.usuario,
            permisos: normalizePermisos(data?.usuario?.permisos || []),
          };
          sessionStorage.removeItem('medico');
          sessionStorage.setItem('usuario', JSON.stringify(usuarioNormalizado));
          // Guardar el rol explícitamente para uso global
          if (usuarioNormalizado.rol) {
            sessionStorage.setItem('user_role', usuarioNormalizado.rol);
          } else {
            sessionStorage.setItem('user_role', 'recepcionista');
          }
          onLogin && onLogin(usuarioNormalizado);
          navigate("/");
          return;
        }
        // Si falla, intentar como médico
        let resMedico, dataMedico;
        try {
          resMedico = await fetch(BASE_URL + "api_login_medico.php", {
            method: "POST",
            headers: { 
              "Content-Type": "application/json",
              "X-Requested-With": "XMLHttpRequest"
            },
            body: JSON.stringify({ email: usuario, password }),
            credentials: "include"
          });
          dataMedico = await resMedico.json();
        } catch {
          resMedico = { ok: false };
          dataMedico = {};
        }
        if (resMedico.ok && dataMedico.success) {
          const medicoConRol = { ...dataMedico.medico, rol: 'medico' };
          sessionStorage.removeItem('usuario');
          sessionStorage.removeItem('user_role');
          sessionStorage.setItem('medico', JSON.stringify(medicoConRol));
          onLogin && onLogin(medicoConRol);
          navigate("/");
          return;
        }
      }
      setError("Usuario o contraseña incorrectos");
    } catch {
      setError("Error de conexión con el servidor");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden" style={{ background: 'linear-gradient(to bottom right, var(--color-login-from), var(--color-login-via), var(--color-login-to))' }}>
      {/* Efectos de fondo */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full blur-3xl opacity-20" style={{ backgroundColor: 'var(--color-login-via)' }}></div>
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full blur-3xl opacity-20" style={{ backgroundColor: 'var(--color-login-from)' }}></div>
        <div className="absolute top-3/4 left-1/2 w-64 h-64 rounded-full blur-3xl opacity-20" style={{ backgroundColor: 'var(--color-login-to)' }}></div>
      </div>

      {/* Formulario de Login */}
      <div className="relative z-10 w-full max-w-md">
        <div className="bg-white/10 backdrop-blur-xl rounded-3xl border border-white/20 shadow-2xl p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="relative mx-auto w-20 h-20 mb-6">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-400 to-purple-500 rounded-full blur-lg opacity-60"></div>
              {logoSrc ? (
                <img 
                  src={logoSrc}
                  alt="Logo clínica" 
                  className="relative w-20 h-20 object-contain bg-white/90 rounded-full p-3 shadow-lg ring-4 ring-white/30"
                  onError={() => setLogoSrc('')}
                />
              ) : (
                <div className="relative w-20 h-20 bg-white/90 rounded-full shadow-lg ring-4 ring-white/30 flex items-center justify-center">
                  <Icon iconName="Hospital" className="text-3xl text-violet-600" />
                </div>
              )}
            </div>
            <h1 className="text-3xl font-bold text-white mb-2 drop-shadow-lg">
              {clinicName}
            </h1>
            <p className="text-lg text-white/80">
              Acceso al Sistema Médico
            </p>
          </div>

          {/* Formulario */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Input Usuario */}
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Icon iconName="Contact" className="text-xl text-white/60" />
              </div>
              <input
                type="text"
                placeholder="Usuario o email del médico"
                value={usuario}
                onChange={(e) => setUsuario(e.target.value)}
                className="w-full bg-white/10 border border-white/20 rounded-2xl pl-12 pr-4 py-4 text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-transparent backdrop-blur-sm transition-all duration-300"
                required
              />
            </div>

            {/* Input Contraseña */}
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Icon iconName="Lock" className="text-xl text-white/60" />
              </div>
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Contraseña"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-white/10 border border-white/20 rounded-2xl pl-12 pr-12 py-4 text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-transparent backdrop-blur-sm transition-all duration-300"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-4 flex items-center text-white/60 hover:text-white transition-colors"
              >
                <Icon iconName={showPassword ? "Hide" : "RedEye"} className="text-xl" />
              </button>
            </div>

            {/* Botón de Login */}
            <button 
              type="submit" 
              disabled={loading}
              className="w-full hover:opacity-90 text-white font-bold rounded-2xl py-4 px-6 shadow-lg hover:shadow-xl transform hover:scale-[1.02] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-3 relative overflow-hidden"
              style={{ background: 'linear-gradient(to right, var(--color-primary), var(--color-accent), var(--color-secondary))' }}
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>Verificando...</span>
                </>
              ) : (
                <>
                  <Icon iconName="SignIn" className="text-xl" />
                  <span>Ingresar al Sistema</span>
                </>
              )}
              
              {/* Efecto de brillo */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
            </button>

            {/* Error */}
            {error && (
              <div className="bg-red-500/20 backdrop-blur-sm border border-red-400/30 rounded-2xl p-4 text-center">
                <div className="flex items-center justify-center gap-2 text-red-200">
                  <Icon iconName="ErrorBadge" className="text-xl" />
                  <span className="font-medium">{error}</span>
                </div>
              </div>
            )}
          </form>

          {/* Footer */}
          <div className="mt-8 text-center">
            <div className="flex items-center justify-center gap-2 text-white/60 text-sm">
              <Icon iconName="Shield" className="text-lg" />
              <span>Sistema Seguro y Confiable</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Login;
