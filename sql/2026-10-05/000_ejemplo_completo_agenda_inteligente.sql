-- Ejemplo completo para esta lógica:
-- 1) revisar estado actual
-- 2) activar agenda inteligente de cotización

-- Ver estado actual
SET @has_duracion_slot_min := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'configuracion_clinica'
    AND COLUMN_NAME = 'duracion_slot_min'
);

SET @sql_verify_agenda_inteligente := IF(
  @has_duracion_slot_min > 0,
  'SELECT id, duracion_slot_min, agenda_inteligente_cotizacion_v1
   FROM configuracion_clinica
   ORDER BY id DESC
   LIMIT 1',
  'SELECT id, NULL AS duracion_slot_min, agenda_inteligente_cotizacion_v1
   FROM configuracion_clinica
   ORDER BY id DESC
   LIMIT 1'
);

PREPARE stmt_verify_agenda_inteligente FROM @sql_verify_agenda_inteligente;
EXECUTE stmt_verify_agenda_inteligente;
DEALLOCATE PREPARE stmt_verify_agenda_inteligente;

-- Activar agenda inteligente de cotización
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
