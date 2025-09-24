// src/config/config.example.js
// Archivo de configuración de ejemplo para el frontend
// Copia este archivo como config.js y configura tu URL base

// Para desarrollo local
export const BASE_URL = "http://localhost/policlinico-2demayo/";

// Para producción (descomenta y configura)
// export const BASE_URL = "https://tu-dominio.com/";

// Otras configuraciones
export const APP_NAME = "Clínica 2 de Mayo";
export const VERSION = "1.0.0";

// Configuraciones opcionales
export const CONFIG = {
    // Tiempo de sesión en milisegundos (30 minutos)
    SESSION_TIMEOUT: 30 * 60 * 1000,
    
    // Número máximo de resultados por página
    PAGINATION_SIZE: 10,
    
    // Configuraciones de exportación
    EXPORT: {
        PDF_TITLE: "Clínica 2 de Mayo - Reporte",
        EXCEL_FILENAME: "reporte_clinica_2demayo"
    }
};