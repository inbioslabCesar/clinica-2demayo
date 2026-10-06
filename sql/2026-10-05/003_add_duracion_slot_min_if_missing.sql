-- Crea duracion_slot_min solo si la columna no existe (compatibilidad BD antigua).

SET @has_duracion_slot_min := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'configuracion_clinica'
    AND COLUMN_NAME = 'duracion_slot_min'
);

SET @sql_add_duracion_slot := IF(
  @has_duracion_slot_min = 0,
  'ALTER TABLE configuracion_clinica
   ADD COLUMN duracion_slot_min INT NOT NULL DEFAULT 30',
  'SELECT 1'
);

PREPARE stmt_add_duracion_slot FROM @sql_add_duracion_slot;
EXECUTE stmt_add_duracion_slot;
DEALLOCATE PREPARE stmt_add_duracion_slot;

SELECT id, duracion_slot_min
FROM configuracion_clinica
ORDER BY id DESC
LIMIT 1;
