-- Migración: índice para acelerar listado de cotizaciones
-- Fecha: 2026-03-03
-- Objetivo: optimizar subconsulta de servicios por cotización en el listado paginado.

-- IMPORTANTE:
-- Este script evita information_schema para no fallar por permisos restringidos.
--
-- 1) Ejecuta primero esta opción (estructura v2 con estado_item):
ALTER TABLE cotizaciones_detalle
ADD INDEX idx_cot_detalle_listado (cotizacion_id, estado_item, servicio_tipo);

-- 2) Si te sale error "Unknown column 'estado_item'", usa esta alternativa (estructura v1):
-- ALTER TABLE cotizaciones_detalle
-- ADD INDEX idx_cot_detalle_listado (cotizacion_id, servicio_tipo);

-- 3) Si te sale error "Duplicate key name", significa que el índice ya existe.

-- Verificación rápida
SHOW INDEX FROM cotizaciones_detalle WHERE Key_name = 'idx_cot_detalle_listado';
