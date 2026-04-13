-- Agrega fecha_vencimiento a cotizaciones de forma idempotente
-- para habilitar vencimiento de tickets Q en recepcion.

SET @db := DATABASE();

SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db
        AND TABLE_NAME = 'cotizaciones'
        AND COLUMN_NAME = 'fecha_vencimiento'
    ),
    'SELECT ''cotizaciones.fecha_vencimiento ya existe'' AS info',
    'ALTER TABLE cotizaciones ADD COLUMN fecha_vencimiento DATETIME NULL AFTER fecha'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql_idx := (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = @db
        AND TABLE_NAME = 'cotizaciones'
        AND INDEX_NAME = 'idx_cotizaciones_fecha_vencimiento'
    ),
    'SELECT ''idx_cotizaciones_fecha_vencimiento ya existe'' AS info',
    'ALTER TABLE cotizaciones ADD KEY idx_cotizaciones_fecha_vencimiento (fecha_vencimiento)'
  )
);
PREPARE stmt2 FROM @sql_idx;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;
