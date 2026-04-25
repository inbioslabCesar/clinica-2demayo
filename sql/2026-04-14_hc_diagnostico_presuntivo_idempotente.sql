-- Habilita tipo de diagnostico 'presuntivo' en esquemas relacionales que usen ENUM.
-- En este proyecto principal, historia_clinica guarda diagnosticos dentro de JSON (campo datos),
-- por lo que no requiere ALTER TABLE para funcionar.

SET @tbl_hcd_exists := (
  SELECT COUNT(*)
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'historia_clinica_diagnosticos'
);

SET @tbl_hcd_is_enum := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'historia_clinica_diagnosticos'
    AND COLUMN_NAME = 'tipo'
    AND DATA_TYPE = 'enum'
);

SET @tbl_hcd_has_pres := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'historia_clinica_diagnosticos'
    AND COLUMN_NAME = 'tipo'
    AND COLUMN_TYPE LIKE '%''presuntivo''%'
);

SET @sql_hcd := IF(
  @tbl_hcd_exists = 1 AND @tbl_hcd_is_enum = 1 AND @tbl_hcd_has_pres = 0,
  "ALTER TABLE historia_clinica_diagnosticos MODIFY COLUMN tipo ENUM('principal','secundario','presuntivo','definitivo') NOT NULL DEFAULT 'principal'",
  "SELECT 'No change for historia_clinica_diagnosticos.tipo' AS info"
);

PREPARE stmt_hcd FROM @sql_hcd;
EXECUTE stmt_hcd;
DEALLOCATE PREPARE stmt_hcd;

SET @tbl_dc_exists := (
  SELECT COUNT(*)
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'diagnosticos_consulta'
);

SET @tbl_dc_is_enum := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'diagnosticos_consulta'
    AND COLUMN_NAME = 'tipo'
    AND DATA_TYPE = 'enum'
);

SET @tbl_dc_has_pres := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'diagnosticos_consulta'
    AND COLUMN_NAME = 'tipo'
    AND COLUMN_TYPE LIKE '%''presuntivo''%'
);

SET @sql_dc := IF(
  @tbl_dc_exists = 1 AND @tbl_dc_is_enum = 1 AND @tbl_dc_has_pres = 0,
  "ALTER TABLE diagnosticos_consulta MODIFY COLUMN tipo ENUM('principal','secundario','presuntivo','definitivo') NOT NULL DEFAULT 'principal'",
  "SELECT 'No change for diagnosticos_consulta.tipo' AS info"
);

PREPARE stmt_dc FROM @sql_dc;
EXECUTE stmt_dc;
DEALLOCATE PREPARE stmt_dc;
