-- ============================================================================
-- FASE 1 HIBRIDA: Agrupacion Inteligente de Cotizaciones (Farmacia)
-- ============================================================================
-- Fecha: 02/05/2026
-- Descripcion: Agrega soporte para auto-detectar y consolidar cotizaciones
--              pendientes de farmacia del mismo paciente, evitando duplicados.
--
-- NOTA IMPORTANTE (HOSTINGER/phpMyAdmin):
--   Sin DELIMITER, sin procedures, sin DECLARE.
--   Usa ALTER TABLE ... IF NOT EXISTS (MariaDB nativo) para idempotencia.
--   Todas las verificaciones usan INFORMATION_SCHEMA para evitar #1109.
-- ============================================================================

-- ============================================================================
-- MIGRACION
-- ============================================================================

ALTER TABLE cotizaciones
    ADD COLUMN IF NOT EXISTS responsable_farmacia_id INT NULL DEFAULT NULL
    AFTER usuario_id;

ALTER TABLE cotizaciones
    ADD INDEX IF NOT EXISTS idx_responsable_farmacia_id (responsable_farmacia_id);

ALTER TABLE cotizaciones
    ADD INDEX IF NOT EXISTS idx_resp_farm_estado (responsable_farmacia_id, estado);

-- ============================================================================
-- VERIFICACION POST-MIGRACION
-- ============================================================================

SELECT DATABASE() AS base_activa;

SELECT
    TABLE_NAME,
    COLUMN_NAME,
    COLUMN_TYPE,
    IS_NULLABLE,
    COLUMN_KEY,
    EXTRA
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'cotizaciones'
  AND COLUMN_NAME IN ('responsable_farmacia_id', 'usuario_id')
ORDER BY ORDINAL_POSITION;

SELECT INDEX_NAME, COLUMN_NAME, NON_UNIQUE
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'cotizaciones'
  AND COLUMN_NAME = 'responsable_farmacia_id';

SELECT
    COUNT(*) AS total_cotizaciones_en_tabla
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'cotizaciones';

-- ============================================================================
-- ROLLBACK (manual)
-- ============================================================================
/*
ALTER TABLE cotizaciones DROP INDEX idx_responsable_farmacia_id;
ALTER TABLE cotizaciones DROP INDEX idx_resp_farm_estado;
ALTER TABLE cotizaciones DROP COLUMN responsable_farmacia_id;
*/

-- ============================================================================
-- FIN
-- ============================================================================
