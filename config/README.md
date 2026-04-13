# Configuración Dinámica por Clínica

Este proyecto soporta múltiples instancias (una por clínica) sin tocar el núcleo.

## Orden de carga

El resolvedor en [config/db_resolver.php](config/db_resolver.php) carga configuración en este orden:

1. Variables de entorno (`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASS`, `APP_ENV`)
2. Archivo forzado por `CLINICA_CONFIG_FILE`
3. `config/instance.local.php`
4. `config/instances/<instancia>.php`
5. `../clinica-config/<instancia>.php` (carpeta externa al proyecto)
6. Fallback local/producción para compatibilidad

## Cómo se calcula la instancia

- Usa `CLINICA_INSTANCE` si existe.
- Si no, usa `HTTP_HOST` normalizado.

Ejemplo:
- `sistema.clinica2demayo.com` -> `sistema_clinica2demayo_com`

## Recomendación para producción en Hostinger

1. Crear carpeta externa (no versionada), por ejemplo:
   - `../clinica-config/`
2. Crear archivo por clínica:
   - `../clinica-config/sistema_clinica2demayo_com.php`
3. Opcionalmente definir `CLINICA_CONFIG_FILE` para ruta absoluta.

## Formato del archivo de clínica

Ejemplo basado en [config/instances/clinic.example.php](config/instances/clinic.example.php):

```php
<?php
return [
    'APP_ENV' => 'production',
    'DB_HOST' => 'localhost',
   'DB_PORT' => 3306,
    'DB_NAME' => 'u330560936_clinicas_bd',
    'DB_USER' => 'u330560936_clinicas',
    'DB_PASS' => 'TU_PASSWORD_AQUI',
];
```

## Notes para Codespaces

- Hosts con sufijos `.app.github.dev` y `.preview.app.github.dev` se tratan como entorno de desarrollo.
- Si necesitas conectar a una BD no local, define explícitamente `DB_HOST` y `DB_PORT`.
- El fallback existente se mantiene para no romper despliegues actuales.

## Archivos actualizados

- [config.php](config.php)
- [config_pdf.php](config_pdf.php)
- [config/db_resolver.php](config/db_resolver.php)
