-- v1: Soporte para medicamentos externos/no cobrables en cotizaciones_detalle
-- Idempotente compatible con motores MySQL/MariaDB sin IF NOT EXISTS en ALTER/INDEX.

SET @db_name = DATABASE();

SET @exists_col = (
    SELECT COUNT(*)
    FROM information_schema.columns
    WHERE table_schema = @db_name
      AND table_name = 'cotizaciones_detalle'
      AND column_name = 'es_externo'
);
SET @sql_stmt = IF(
    @exists_col = 0,
    'ALTER TABLE cotizaciones_detalle ADD COLUMN es_externo TINYINT(1) NOT NULL DEFAULT 0 AFTER motivo_edicion',
    'SELECT 1'
);
PREPARE stmt FROM @sql_stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists_col = (
    SELECT COUNT(*)
    FROM information_schema.columns
    WHERE table_schema = @db_name
      AND table_name = 'cotizaciones_detalle'
      AND column_name = 'incluir_en_cobro'
);
SET @sql_stmt = IF(
    @exists_col = 0,
    'ALTER TABLE cotizaciones_detalle ADD COLUMN incluir_en_cobro TINYINT(1) NOT NULL DEFAULT 1 AFTER es_externo',
    'SELECT 1'
);
PREPARE stmt FROM @sql_stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists_col = (
    SELECT COUNT(*)
    FROM information_schema.columns
    WHERE table_schema = @db_name
      AND table_name = 'cotizaciones_detalle'
      AND column_name = 'nombre_externo'
);
SET @sql_stmt = IF(
    @exists_col = 0,
    'ALTER TABLE cotizaciones_detalle ADD COLUMN nombre_externo VARCHAR(255) NULL AFTER incluir_en_cobro',
    'SELECT 1'
);
PREPARE stmt FROM @sql_stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists_col = (
    SELECT COUNT(*)
    FROM information_schema.columns
    WHERE table_schema = @db_name
      AND table_name = 'cotizaciones_detalle'
      AND column_name = 'motivo_externo'
);
SET @sql_stmt = IF(
    @exists_col = 0,
    'ALTER TABLE cotizaciones_detalle ADD COLUMN motivo_externo VARCHAR(80) NULL AFTER nombre_externo',
    'SELECT 1'
);
PREPARE stmt FROM @sql_stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists_idx = (
    SELECT COUNT(*)
    FROM information_schema.statistics
    WHERE table_schema = @db_name
      AND table_name = 'cotizaciones_detalle'
      AND index_name = 'idx_cd_externo_activo'
);
SET @sql_stmt = IF(
    @exists_idx = 0,
    'CREATE INDEX idx_cd_externo_activo ON cotizaciones_detalle (cotizacion_id, es_externo, incluir_en_cobro)',
    'SELECT 1'
);
PREPARE stmt FROM @sql_stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;
