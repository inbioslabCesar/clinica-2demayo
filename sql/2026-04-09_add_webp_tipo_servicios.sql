-- Agregar soporte para webp y tipo de layout (clásico/premium) en servicios web

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
