# Solución Logo PDF - Hostinger

## Problema Solucionado:
El logo no aparecía en el PDF de carátula en producción (Hostinger).

## Archivos actualizados:
1. **descargar_caratula_paciente.php** - Detección automática de rutas
2. **2demayo.svg** - Logo copiado a la raíz del proyecto

## Para desplegar en Hostinger:

### Archivos a subir:
```
📂 public_html/
    📄 descargar_caratula_paciente.php  ← Archivo actualizado
    📄 2demayo.svg                      ← Logo en raíz
```

### Estructura final en Hostinger:
```
📂 public_html/
    📄 descargar_caratula_paciente.php
    📄 2demayo.svg
    📄 api_consultas.php
    📄 [otros archivos...]
```

## Cómo funciona la detección automática:

El sistema ahora busca el logo en estas rutas (en orden):
1. **Producción**: `2demayo.svg` (raíz)
2. **Desarrollo**: `public/2demayo.svg`
3. **Fallbacks adicionales** con rutas absolutas

## Verificación:
- ✅ En desarrollo: Logo desde `public/2demayo.svg`
- ✅ En producción: Logo desde `2demayo.svg`
- ✅ Logs de depuración para diagnosticar problemas

El logo ahora aparecerá correctamente en ambos entornos.