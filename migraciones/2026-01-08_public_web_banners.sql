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
