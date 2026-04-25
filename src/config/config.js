// src/config/config.js
// Detectar automáticamente el entorno
const localHosts = new Set(['localhost', '127.0.0.1', '::1']);
const isProduction = !localHosts.has(window.location.hostname);

// URL base automática según el entorno
// En desarrollo con Vite usar URL relativa para que el proxy '/api_' evite CORS.
export const BASE_URL = import.meta.env.DEV
    ? '/'
    : (isProduction
        ? (window.location.origin.replace(/\/+$/, '') + '/')
        : "http://127.0.0.1/clinica-2demayo/");

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
