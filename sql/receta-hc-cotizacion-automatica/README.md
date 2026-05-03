# Receta HC -> Cotizacion automatica

## Archivos
- `01_schema_receta_hc_cotizacion_automatica.sql`: crea tablas de sincronizacion e items pendientes.
- `02_verificacion_receta_hc_cotizacion_automatica.sql`: consultas de verificacion post deploy.
- `90_apply_dev.php`: aplicador local para desarrollo.

## Produccion
1. Ejecutar `01_schema_receta_hc_cotizacion_automatica.sql`.
2. Validar con `02_verificacion_receta_hc_cotizacion_automatica.sql`.

## Desarrollo
```bash
php sql/receta-hc-cotizacion-automatica/90_apply_dev.php
```
