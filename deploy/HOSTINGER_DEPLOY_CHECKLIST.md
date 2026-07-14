# Deploy rapido a Hostinger

## 1) Generar release local

En PowerShell, desde la raiz del proyecto:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\prepare_hostinger_release.ps1
```

Esto genera un zip en `deploy/hostinger-release-YYYYMMDD-HHMMSS.zip`.

## 2) Preparar produccion en Hostinger

1. Crear respaldo de `public_html/` y de la base de datos.
2. Confirmar que `public_html/sistema/config.php` tenga credenciales reales de produccion.
3. Confirmar permisos de carpetas de escritura: `uploads/`, `tmp/`, `maintenance/`.

## 3) Subir archivos

Descomprime el zip y sube:

1. `frontend-landing/*` a `/public_html/`
2. `backend-sistema/*` a `/public_html/sistema/`
3. `frontend-sistema/*` a `/public_html/sistema/`

Nota: Si pregunta sobreescribir, aceptar para actualizar.

## 4) Verificaciones post-deploy

1. Abrir `https://TU_DOMINIO/sistema/`
2. Hacer login y navegar 3 modulos: pacientes, cotizaciones, recordatorios.
3. Validar API de salud: `https://TU_DOMINIO/sistema/api_health.php`
4. Probar refresco en ruta profunda (ej: `/sistema/cotizaciones`) para validar `.htaccess`.

## 5) Si algo falla

1. Revisar `error_log` de Hostinger.
2. Confirmar `config.php` de produccion.
3. Confirmar version activa leyendo:
   - `/public_html/deploy_version.txt` (landing)
   - `/public_html/sistema/deploy_version.txt` (sistema)
