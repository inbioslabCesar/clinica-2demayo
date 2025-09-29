// src/utils/security.js
import { SECURITY_CONFIG } from '../config/config';

/**
 * Utilidades de seguridad para proteger credenciales
 */
export class SecurityUtils {
    
    /**
     * Validar si es seguro enviar credenciales
     */
    static validateSecureContext() {
        const hostname = window.location.hostname;
        const protocol = window.location.protocol;
        
        // Permitir localhost en desarrollo
        if (hostname === 'localhost' || hostname === '127.0.0.1') {
            return { isValid: true, context: 'development' };
        }
        
        // Requerir HTTPS en otros entornos
        if (protocol !== 'https:') {
            return { 
                isValid: false, 
                message: 'Se requiere conexión segura (HTTPS). No se pueden enviar credenciales por HTTP.',
                context: 'production'
            };
        }
        
        return { isValid: true, context: 'production' };
    }
    
    /**
     * Validar fuerza de contraseña básica
     */
    static validatePassword(password) {
        if (!password || password.length < SECURITY_CONFIG.minPasswordLength) {
            return {
                isValid: false,
                message: `La contraseña debe tener al menos ${SECURITY_CONFIG.minPasswordLength} caracteres`
            };
        }
        
        // Validaciones adicionales de seguridad
        if (password.length > 128) {
            return {
                isValid: false,
                message: 'La contraseña es demasiado larga'
            };
        }
        
        return { isValid: true };
    }
    
    /**
     * Crear headers seguros para requests
     */
    static createSecureHeaders() {
        return {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest', // Protección CSRF básica
        };
    }
    
    /**
     * Crear configuración segura para fetch
     */
    static createSecureFetchConfig(body = null) {
        const config = {
            headers: this.createSecureHeaders(),
            credentials: 'include', // Para cookies de sesión
            mode: 'cors',
        };
        
        if (body) {
            config.method = 'POST';
            config.body = JSON.stringify(body);
        }
        
        return config;
    }
    
    /**
     * Log de eventos de seguridad (para debugging)
     */
    static logSecurityEvent(event, details = {}) {
        if (import.meta.env.DEV) {
            console.warn(`[SECURITY] ${event}:`, details);
        }
    }
}

/**
 * Hook personalizado para validar seguridad antes de login
 */
export function useSecureLogin() {
    const attemptLogin = async (credentials, apiUrl) => {
        // 1. Validar contexto seguro
        const contextCheck = SecurityUtils.validateSecureContext();
        if (!contextCheck.isValid) {
            SecurityUtils.logSecurityEvent('INSECURE_CONTEXT_BLOCKED', {
                url: apiUrl,
                protocol: window.location.protocol
            });
            throw new Error(contextCheck.message);
        }
        
        // 2. Validar contraseña
        const passwordCheck = SecurityUtils.validatePassword(credentials.password);
        if (!passwordCheck.isValid) {
            SecurityUtils.logSecurityEvent('WEAK_PASSWORD_BLOCKED', {
                length: credentials.password?.length
            });
            throw new Error(passwordCheck.message);
        }
        
        // 3. Realizar login con configuración segura
        SecurityUtils.logSecurityEvent('SECURE_LOGIN_ATTEMPT', {
            url: apiUrl,
            context: contextCheck.context
        });
        
        const response = await fetch(apiUrl, SecurityUtils.createSecureFetchConfig(credentials));
        
        if (!response.ok) {
            SecurityUtils.logSecurityEvent('LOGIN_FAILED', {
                status: response.status,
                url: apiUrl
            });
            throw new Error(`Error de login: ${response.status}`);
        }
        
        SecurityUtils.logSecurityEvent('LOGIN_SUCCESS', {
            url: apiUrl
        });
        
        return response.json();
    };
    
    return { attemptLogin };
}