# Instrucciones para Despliegue en Producción

## Problema: PDF no funciona en producción

### Causa más probable:
La carpeta `vendor` con las librerías PHP no está instalada en el servidor de producción.

## Solución 1: Instalar dependencias en producción

### Para Hostinger u otros hosting compartidos:

1. **Subir composer.json al servidor**
2. **Conectarse por SSH o File Manager**
3. **Ejecutar en el directorio raíz:**
   ```bash
   composer install --no-dev --optimize-autoloader
   ```

### Si no tienes acceso SSH:

1. **En tu computadora local, ejecuta:**
   ```bash
   composer install --no-dev --optimize-autoloader
   ```

2. **Comprimir la carpeta vendor:**
   ```bash
   zip -r vendor.zip vendor/
   ```

3. **Subir vendor.zip al servidor**

4. **Descomprimir en el directorio raíz del proyecto**

## Solución 2: Verificar el problema

### Acceder a la URL de diagnóstico:
```
https://clinica2demayo.com/diagnostico_pdf.php?format=json
```

Esto te dirá exactamente qué está fallando.

## Solución 3: Fallback automático

El sistema ahora tiene un fallback automático:
- Si dompdf no está disponible, descarga un archivo HTML
- El archivo HTML se puede convertir a PDF manualmente

## Archivos importantes:

- `composer.json` - Define las dependencias
- `vendor/` - Carpeta con las librerías (debe existir en producción)
- `descargar_caratula_paciente.php` - Generador de PDF (ya actualizado)
- `diagnostico_pdf.php` - Script de diagnóstico

## Verificación rápida:

1. ¿Existe `vendor/autoload.php` en producción?
2. ¿Se puede ejecutar `composer install`?
3. ¿El diagnóstico muestra que dompdf funciona?

Si nada funciona, el sistema descargará HTML automáticamente.