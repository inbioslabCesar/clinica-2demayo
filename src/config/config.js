// src/config/config.js
// Detectar automáticamente el entorno
const localHosts = new Set(['localhost', '127.0.0.1', '::1']);
const isProduction = !localHosts.has(window.location.hostname);

function resolveRuntimeBasePath() {
    const pathname = String(window.location.pathname || '/');
    return pathname === '/sistema' || pathname.startsWith('/sistema/')
        ? '/sistema/'
        : '/';
}

export const APP_BASE_PATH = import.meta.env.DEV
    ? '/'
    : resolveRuntimeBasePath();

// URL base automática según el entorno.
// En desarrollo: '/' para que el proxy de Vite capture /api_* sin CORS.
// En producción: se resuelve en runtime según la ruta actual.
//   - /sistema/... -> '/sistema/'
//   - /...        -> '/'
export const BASE_URL = import.meta.env.DEV
    ? '/'
    : (isProduction
        ? APP_BASE_PATH
        : "http://127.0.0.1/clinica-2demayo/");

// ---------------------------------------------------------------------------
// Singleton de configuración: una sola promesa por ciclo de vida de pestaña.
// Todos los llamadores del mismo arranque comparten el resultado sin duplicar
// el request a api_get_configuracion.php.
// ---------------------------------------------------------------------------
let _configPromise = null;
let _configResolvedAt = 0;
const CONFIG_SINGLETON_TTL_MS = 5 * 60 * 1000;

export function fetchConfigSingleton() {
    const now = Date.now();
    if (_configPromise && (now - _configResolvedAt) < CONFIG_SINGLETON_TTL_MS) {
        return _configPromise;
    }
    _configPromise = fetch(
        BASE_URL + 'api_get_configuracion.php',
        { credentials: 'include', cache: 'no-store' }
    )
        .then(r => r.json())
        .then(data => {
            _configResolvedAt = Date.now();
            return data;
        })
        .catch(() => {
            // Si falla, invalidar para que el siguiente intento reintente
            _configPromise = null;
            _configResolvedAt = 0;
            return { success: false };
        });
    return _configPromise;
}

export function invalidateConfigSingleton() {
    _configPromise = null;
    _configResolvedAt = 0;
}

// Configuración de seguridad
export const SECURITY_CONFIG = {
    // Requerir HTTPS en producción
    requireHTTPS: window.location.protocol === 'https:',
    
    // Validar que estamos en un entorno seguro antes de enviar credenciales
    isSecureContext: window.isSecureContext || localHosts.has(window.location.hostname),
    
    // Longitud mínima de contraseña (desactivada)
    minPasswordLength: 0,
    
    // Tiempo de espera para requests (ms)
    requestTimeout: 10000
};
