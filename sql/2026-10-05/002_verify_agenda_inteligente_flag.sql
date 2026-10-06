-- Verifica estado actual de la bandera.
-- Compatibilidad: si la BD no tiene duracion_slot_min, no falla.

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
