-- Migracion idempotente: campos de grupo sanguineo y factor RH en pacientes
-- Fecha: 2026-07-26

START TRANSACTION;

SET @db := DATABASE();

SET @q := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE pacientes ADD COLUMN grupo_sanguineo VARCHAR(20) NULL AFTER sexo',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'pacientes' AND COLUMN_NAME = 'grupo_sanguineo'
);
PREPARE stmt FROM @q; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @q := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE pacientes ADD COLUMN factor_rh VARCHAR(20) NULL AFTER grupo_sanguineo',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'pacientes' AND COLUMN_NAME = 'factor_rh'
);
PREPARE stmt FROM @q; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE pacientes
SET grupo_sanguineo = 'NO_ESPECIFICADO'
WHERE grupo_sanguineo IS NULL OR TRIM(grupo_sanguineo) = '';

UPDATE pacientes
SET factor_rh = 'NO_ESPECIFICADO'
WHERE factor_rh IS NULL OR TRIM(factor_rh) = '';

COMMIT;
