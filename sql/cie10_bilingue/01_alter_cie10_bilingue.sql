-- CIE10 bilingue (ES/EN) - cambio no destructivo
-- Agrega columnas en castellano manteniendo las columnas actuales.

SET NAMES utf8mb4;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'cie10' AND column_name = 'nombre_es') = 0,
  'ALTER TABLE cie10 ADD COLUMN nombre_es VARCHAR(500) NULL AFTER nombre',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'cie10' AND column_name = 'categoria_es') = 0,
  'ALTER TABLE cie10 ADD COLUMN categoria_es VARCHAR(100) NULL AFTER categoria',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'cie10' AND column_name = 'subcategoria_es') = 0,
  'ALTER TABLE cie10 ADD COLUMN subcategoria_es VARCHAR(100) NULL AFTER subcategoria',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'cie10' AND column_name = 'descripcion_es') = 0,
  'ALTER TABLE cie10 ADD COLUMN descripcion_es TEXT NULL AFTER descripcion',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'cie10' AND index_name = 'idx_cie10_categoria_es') = 0,
  'CREATE INDEX idx_cie10_categoria_es ON cie10 (categoria_es)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'cie10' AND index_name = 'idx_cie10_subcategoria_es') = 0,
  'CREATE INDEX idx_cie10_subcategoria_es ON cie10 (subcategoria_es)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'cie10' AND index_name = 'ft_cie10_es') = 0,
  'CREATE FULLTEXT INDEX ft_cie10_es ON cie10 (nombre_es, descripcion_es)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT 'OK - esquema bilingue listo' AS estado;
