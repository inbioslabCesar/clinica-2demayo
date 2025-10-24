// src/config/config.js
// Detectar automáticamente el entorno
const isProduction = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';

// URL base automática según el entorno
export const BASE_URL = isProduction 
    ? "https://darkcyan-gnu-615778.hostingersite.com/"
    : "http://localhost/clinica-2demayo/";

// Configuración de seguridad
export const SECURITY_CONFIG = {
    // Requerir HTTPS en producción
    requireHTTPS: window.location.protocol === 'https:',
    
    // Validar que estamos en un entorno seguro antes de enviar credenciales
    isSecureContext: window.isSecureContext || window.location.hostname === 'localhost',
    
    // Longitud mínima de contraseña (desactivada)
    minPasswordLength: 0,
    
    // Tiempo de espera para requests (ms)
    requestTimeout: 10000
};
