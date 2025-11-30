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
}

/**
 * Hook personalizado para validar seguridad antes de login
 */
export function useSecureLogin() {
    const attemptLogin = async (credentials, apiUrl) => {
        // 1. Validar contexto seguro
        const contextCheck = SecurityUtils.validateSecureContext();
        if (!contextCheck.isValid) {
            throw new Error(contextCheck.message);
        }
        
        // 2. Validar contraseña
        const passwordCheck = SecurityUtils.validatePassword(credentials.password);
        if (!passwordCheck.isValid) {
            throw new Error(passwordCheck.message);
        }
        
        // 3. Realizar login con configuración segura
        // ...existing code...
        
        const response = await fetch(apiUrl, SecurityUtils.createSecureFetchConfig(credentials));
        
        if (!response.ok) {
            throw new Error(`Error de login: ${response.status}`);
        }
        
        // ...existing code...
        
        return response.json();
    };
    
    return { attemptLogin };
}