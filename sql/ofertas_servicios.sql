-- Web pública: servicios + ofertas (tablas) + imagen_url en servicios
-- Ejecutar en la misma BD donde está el sistema.

CREATE TABLE IF NOT EXISTS public_servicios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  titulo VARCHAR(200) NOT NULL,
  descripcion TEXT NULL,
  icono VARCHAR(120) NULL,
  precio DECIMAL(10,2) NULL,
  orden INT NOT NULL DEFAULT 0,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_public_servicios_activo_orden (activo, orden)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS public_ofertas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  titulo VARCHAR(200) NOT NULL,
  descripcion TEXT NULL,
  precio_antes DECIMAL(10,2) NULL,
  precio_oferta DECIMAL(10,2) NULL,
  fecha_inicio DATE NULL,
  fecha_fin DATE NULL,
  imagen_url VARCHAR(255) NULL,
  orden INT NOT NULL DEFAULT 0,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_public_ofertas_activo_orden (activo, orden),
  INDEX idx_public_ofertas_fechas (fecha_inicio, fecha_fin)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Agregar imagen_url a servicios si aún no existe
SET @col_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'public_servicios'
    AND COLUMN_NAME = 'imagen_url'
);

SET @sql := IF(@col_exists = 0,
  'ALTER TABLE public_servicios ADD COLUMN imagen_url VARCHAR(255) NULL AFTER icono;',
  'SELECT \"OK: public_servicios.imagen_url ya existe\";'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Banners para el carrusel de la web pública
-- Ejecutar en la misma BD del sistema

CREATE TABLE IF NOT EXISTS public_banners (
  id INT AUTO_INCREMENT PRIMARY KEY,
  titulo VARCHAR(255) NULL,
  subtitulo VARCHAR(255) NULL,
  imagen_url TEXT NOT NULL,
  imagen_fija_url TEXT NULL,
  overlay_blanco TINYINT(1) NOT NULL DEFAULT 1,
  texto_lado VARCHAR(10) NOT NULL DEFAULT 'left',
  titulo_color VARCHAR(20) NULL,
  subtitulo_color VARCHAR(20) NULL,
  titulo_tamano VARCHAR(10) NOT NULL DEFAULT 'lg',
  subtitulo_tamano VARCHAR(10) NOT NULL DEFAULT 'md',
  orden INT NOT NULL DEFAULT 0,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_public_banners_activo_orden (activo, orden)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Agregar columnas a public_banners si aún no existen (idempotente)
SET @col_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'public_banners'
    AND COLUMN_NAME = 'imagen_fija_url'
);

SET @sql := IF(@col_exists = 0,
  'ALTER TABLE public_banners ADD COLUMN imagen_fija_url TEXT NULL AFTER imagen_url;',
  'SELECT "OK: public_banners.imagen_fija_url ya existe";'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'public_banners'
    AND COLUMN_NAME = 'overlay_blanco'
);

SET @sql := IF(@col_exists = 0,
  'ALTER TABLE public_banners ADD COLUMN overlay_blanco TINYINT(1) NOT NULL DEFAULT 1 AFTER imagen_fija_url;',
  'SELECT "OK: public_banners.overlay_blanco ya existe";'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'public_banners'
    AND COLUMN_NAME = 'texto_lado'
);

SET @sql := IF(@col_exists = 0,
  'ALTER TABLE public_banners ADD COLUMN texto_lado VARCHAR(10) NOT NULL DEFAULT ''left'' AFTER overlay_blanco;',
  'SELECT "OK: public_banners.texto_lado ya existe";'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'public_banners'
    AND COLUMN_NAME = 'titulo_color'
);

SET @sql := IF(@col_exists = 0,
  'ALTER TABLE public_banners ADD COLUMN titulo_color VARCHAR(20) NULL AFTER texto_lado;',
  'SELECT "OK: public_banners.titulo_color ya existe";'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'public_banners'
    AND COLUMN_NAME = 'subtitulo_color'
);

SET @sql := IF(@col_exists = 0,
  'ALTER TABLE public_banners ADD COLUMN subtitulo_color VARCHAR(20) NULL AFTER titulo_color;',
  'SELECT "OK: public_banners.subtitulo_color ya existe";'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'public_banners'
    AND COLUMN_NAME = 'titulo_tamano'
);

SET @sql := IF(@col_exists = 0,
  'ALTER TABLE public_banners ADD COLUMN titulo_tamano VARCHAR(10) NOT NULL DEFAULT ''lg'' AFTER subtitulo_color;',
  'SELECT "OK: public_banners.titulo_tamano ya existe";'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'public_banners'
    AND COLUMN_NAME = 'subtitulo_tamano'
);

SET @sql := IF(@col_exists = 0,
  'ALTER TABLE public_banners ADD COLUMN subtitulo_tamano VARCHAR(10) NOT NULL DEFAULT ''md'' AFTER titulo_tamano;',
  'SELECT "OK: public_banners.subtitulo_tamano ya existe";'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;