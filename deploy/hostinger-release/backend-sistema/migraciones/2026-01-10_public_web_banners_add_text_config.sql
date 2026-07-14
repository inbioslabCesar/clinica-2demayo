-- Configuración de texto por banner (posición, colores y tamaños)

ALTER TABLE public_banners
  ADD COLUMN texto_lado VARCHAR(10) NOT NULL DEFAULT 'left' AFTER overlay_blanco,
  ADD COLUMN titulo_color VARCHAR(20) NULL AFTER texto_lado,
  ADD COLUMN subtitulo_color VARCHAR(20) NULL AFTER titulo_color,
  ADD COLUMN titulo_tamano VARCHAR(10) NOT NULL DEFAULT 'lg' AFTER subtitulo_color,
  ADD COLUMN subtitulo_tamano VARCHAR(10) NOT NULL DEFAULT 'md' AFTER titulo_tamano;
