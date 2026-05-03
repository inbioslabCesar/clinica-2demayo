# Produccion medica vs venta directa

Carpeta de migracion para clasificar cada item cobrado como:
- produccion_medica
- venta_directa

## Orden sugerido en produccion

1. Ejecutar 01_schema_produccion_medica_detalle_idempotente.sql
2. Verificar estructura y conciliacion con 02_verificacion_produccion_medica_detalle.sql

## Desarrollo

Para aplicar rapido en entorno local:

php sql/produccion-medica-venta-directa/90_apply_dev.php

## Notas

- La tabla es un espejo analitico. No reemplaza a cobros ni ingresos_diarios como fuente contable.
- El backend registra por item al momento del cobro y usa hash_origen para evitar duplicados por reproceso.
