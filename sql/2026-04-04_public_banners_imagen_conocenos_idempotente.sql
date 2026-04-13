-- Agrega imagen dedicada para la seccion Conocenos (landing clasica y premium)
SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'public_banners'
    AND COLUMN_NAME = 'imagen_conocenos_url'
);

SET @ddl := IF(
  @col_exists = 0,
  'ALTER TABLE public_banners ADD COLUMN imagen_conocenos_url VARCHAR(500) NULL AFTER imagen_fija_url',
  'SELECT 1'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
