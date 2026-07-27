-- Verificacion de estructura para mejora de pacientes pediatria
-- Fecha: 2026-07-26

SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'pacientes'
  AND COLUMN_NAME IN ('grupo_sanguineo', 'factor_rh');

SELECT
  IF(
    EXISTS(
      SELECT 1
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'pacientes_acompanantes'
    ),
    'OK: tabla pacientes_acompanantes existe',
    'AVISO: tabla pacientes_acompanantes no existe aun. Ejecuta primero: 02_pacientes_acompanantes_tabla_idempotente.sql'
  ) AS estado_tabla_acompanantes;

SELECT
  COLUMN_NAME,
  COLUMN_TYPE,
  IS_NULLABLE,
  COLUMN_DEFAULT,
  EXTRA
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'pacientes_acompanantes'
ORDER BY ORDINAL_POSITION;

SELECT
  DATABASE() AS base_activa,
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'pacientes'
    ) THEN 'OK: tabla pacientes existe en la base activa'
    ELSE 'ERROR: no se encontro tabla pacientes en la base activa'
  END AS estado_tabla_pacientes;

SELECT
  c.COLUMN_NAME,
  c.DATA_TYPE,
  c.IS_NULLABLE,
  c.COLUMN_DEFAULT
FROM information_schema.COLUMNS c
WHERE c.TABLE_SCHEMA = DATABASE()
  AND c.TABLE_NAME = 'pacientes'
  AND c.COLUMN_NAME IN ('grupo_sanguineo', 'factor_rh')
ORDER BY c.ORDINAL_POSITION;
