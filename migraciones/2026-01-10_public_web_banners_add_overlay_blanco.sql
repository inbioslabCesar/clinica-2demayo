-- Agrega un flag por banner para mostrar/ocultar el degradado blanco del carrusel

ALTER TABLE public_banners
  ADD COLUMN overlay_blanco TINYINT(1) NOT NULL DEFAULT 1 AFTER imagen_fija_url;
