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
const AGENDA_SLOT_STORAGE_KEY = 'clinica_agenda_slot_min';

function normalizeAgendaSlotMinutes(raw) {
    const n = Number(raw || 30);
    if (!Number.isFinite(n) || n <= 0) return 30;
    return Math.max(5, Math.min(120, Math.round(n)));
}

function cacheAgendaSlotMinutes(raw) {
    const slot = normalizeAgendaSlotMinutes(raw);
    try {
        sessionStorage.setItem(AGENDA_SLOT_STORAGE_KEY, String(slot));
    } catch {
        // noop
    }
    if (typeof window !== 'undefined') {
        window.__CLINICA_AGENDA_SLOT_MIN = slot;
    }
    return slot;
}

export function getCachedAgendaSlotMinutes() {
    if (typeof window !== 'undefined' && Number.isFinite(Number(window.__CLINICA_AGENDA_SLOT_MIN))) {
        return normalizeAgendaSlotMinutes(window.__CLINICA_AGENDA_SLOT_MIN);
    }
    try {
        const stored = sessionStorage.getItem(AGENDA_SLOT_STORAGE_KEY);
        if (stored !== null) return normalizeAgendaSlotMinutes(stored);
    } catch {
        // noop
    }
    return 30;
}

if (typeof window !== 'undefined') {
    window.addEventListener('clinica-config-updated', (event) => {
        cacheAgendaSlotMinutes(event?.detail?.duracion_slot_min);
    });
}

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
            cacheAgendaSlotMinutes(data?.data?.duracion_slot_min);
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
