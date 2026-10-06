-- Activa la validación de agenda inteligente para cotización en todas las filas.
-- Importante: este cambio es de configuración de BD y no viaja con el build.

SET @has_agenda_flag := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'configuracion_clinica'
    AND COLUMN_NAME = 'agenda_inteligente_cotizacion_v1'
);

SET @sql_add_agenda_flag := IF(
  @has_agenda_flag = 0,
  'ALTER TABLE configuracion_clinica
   ADD COLUMN agenda_inteligente_cotizacion_v1 TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT 1'
);

PREPARE stmt_add_agenda_flag FROM @sql_add_agenda_flag;
EXECUTE stmt_add_agenda_flag;
DEALLOCATE PREPARE stmt_add_agenda_flag;

UPDATE configuracion_clinica
SET agenda_inteligente_cotizacion_v1 = 1;
