-- Agregar imagen_url a servicios web (si no existe)

ALTER TABLE public_servicios
  ADD COLUMN imagen_url VARCHAR(255) NULL AFTER icono;
