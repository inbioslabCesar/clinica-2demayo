
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { BASE_URL, SECURITY_CONFIG } from "../config/config";
import { Icon } from '@fluentui/react';

function Login({ onLogin }) {
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

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
          sessionStorage.setItem('usuario', JSON.stringify(data.usuario));
          onLogin && onLogin(data.usuario);
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
          sessionStorage.setItem('usuario', JSON.stringify(data.usuario));
          onLogin && onLogin(data.usuario);
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
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-800 to-indigo-900 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Efectos de fondo */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-400/20 rounded-full blur-3xl"></div>
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-purple-400/20 rounded-full blur-3xl"></div>
        <div className="absolute top-3/4 left-1/2 w-64 h-64 bg-indigo-400/20 rounded-full blur-3xl"></div>
      </div>

      {/* Formulario de Login */}
      <div className="relative z-10 w-full max-w-md">
        <div className="bg-white/10 backdrop-blur-xl rounded-3xl border border-white/20 shadow-2xl p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="relative mx-auto w-20 h-20 mb-6">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-400 to-purple-500 rounded-full blur-lg opacity-60"></div>
              <img 
                src="/2demayo.svg" 
                alt="Logo clínica" 
                className="relative w-20 h-20 object-contain bg-white/90 rounded-full p-3 shadow-lg ring-4 ring-white/30" 
              />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2 drop-shadow-lg">
              Clínica 2 de Mayo
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
              className="w-full bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-700 hover:from-blue-700 hover:via-purple-700 hover:to-indigo-800 text-white font-bold rounded-2xl py-4 px-6 shadow-lg hover:shadow-xl transform hover:scale-[1.02] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-3 relative overflow-hidden"
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
