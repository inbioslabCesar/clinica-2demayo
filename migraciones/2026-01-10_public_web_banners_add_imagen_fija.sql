-- Agrega una segunda imagen opcional por banner (para la sección fija en la Home)

ALTER TABLE public_banners
  ADD COLUMN imagen_fija_url TEXT NULL AFTER imagen_url;
