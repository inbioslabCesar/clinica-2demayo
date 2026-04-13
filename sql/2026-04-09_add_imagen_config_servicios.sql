-- Agregar columnas dinámicas para servicios web en orden correcto

-- 1) tipo: clasico/premium
SET @col_tipo_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'public_servicios'
    AND COLUMN_NAME = 'tipo'
);

SET @sql := IF(@col_tipo_exists = 0,
  'ALTER TABLE public_servicios ADD COLUMN tipo ENUM(\"clasico\", \"premium\") NOT NULL DEFAULT \"clasico\" AFTER imagen_url;',
  'SELECT \"OK: public_servicios.tipo ya existe\";'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2) imagen_shape: square/rounded/circle
SET @col_shape_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'public_servicios'
    AND COLUMN_NAME = 'imagen_shape'
);

SET @sql := IF(@col_shape_exists = 0,
  'ALTER TABLE public_servicios ADD COLUMN imagen_shape ENUM(\"square\", \"rounded\", \"circle\") NOT NULL DEFAULT \"rounded\" AFTER tipo;',
  'SELECT \"OK: public_servicios.imagen_shape ya existe\";'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3) imagen_tipo: normal/overlay
SET @col_tipo_img_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'public_servicios'
    AND COLUMN_NAME = 'imagen_tipo'
);

SET @sql := IF(@col_tipo_img_exists = 0,
  'ALTER TABLE public_servicios ADD COLUMN imagen_tipo ENUM(\"normal\", \"overlay\") NOT NULL DEFAULT \"normal\" AFTER imagen_shape;',
  'SELECT \"OK: public_servicios.imagen_tipo ya existe\";'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
