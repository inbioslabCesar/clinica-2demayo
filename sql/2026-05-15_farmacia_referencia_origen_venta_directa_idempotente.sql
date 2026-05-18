-- 2026-05-15_farmacia_referencia_origen_venta_directa_idempotente.sql
-- Agrega columna referencia_origen para trazabilidad comercial en ventas de farmacia.
-- Objetivo: guardar referencia de procedencia (particular, clinica remitente, etc.)
-- en cotizaciones, cobros y flujo legacy de cotizaciones_farmacia.

SET @db := DATABASE();

-- 1) cotizaciones.referencia_origen
SET @exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = @db
    AND table_name = 'cotizaciones'
    AND column_name = 'referencia_origen'
);
SET @sql := IF(
  @exists = 0,
  'ALTER TABLE cotizaciones ADD COLUMN referencia_origen VARCHAR(255) NULL AFTER observaciones',
  'SELECT "skip cotizaciones.referencia_origen"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2) cobros.referencia_origen
SET @exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = @db
    AND table_name = 'cobros'
    AND column_name = 'referencia_origen'
);
SET @sql := IF(
  @exists = 0,
  'ALTER TABLE cobros ADD COLUMN referencia_origen VARCHAR(255) NULL AFTER observaciones',
  'SELECT "skip cobros.referencia_origen"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3) cotizaciones_farmacia.referencia_origen
SET @exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = @db
    AND table_name = 'cotizaciones_farmacia'
    AND column_name = 'referencia_origen'
);
SET @sql := IF(
  @exists = 0,
  'ALTER TABLE cotizaciones_farmacia ADD COLUMN referencia_origen VARCHAR(255) NULL AFTER observaciones',
  'SELECT "skip cotizaciones_farmacia.referencia_origen"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 4) Índices opcionales para búsqueda textual de referencia
SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = @db
    AND table_name = 'cobros'
    AND index_name = 'idx_cobros_referencia_origen'
);
SET @sql := IF(
  @idx_exists = 0,
  'ALTER TABLE cobros ADD INDEX idx_cobros_referencia_origen (referencia_origen)',
  'SELECT "skip idx_cobros_referencia_origen"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = @db
    AND table_name = 'cotizaciones_farmacia'
    AND index_name = 'idx_cf_referencia_origen'
);
SET @sql := IF(
  @idx_exists = 0,
  'ALTER TABLE cotizaciones_farmacia ADD INDEX idx_cf_referencia_origen (referencia_origen)',
  'SELECT "skip idx_cf_referencia_origen"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
