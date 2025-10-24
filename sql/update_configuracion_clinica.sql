-- Agregar campos faltantes a la tabla configuracion_clinica
ALTER TABLE configuracion_clinica
ADD COLUMN especialidades TEXT NULL AFTER ruc,
ADD COLUMN mision TEXT NULL AFTER especialidades,
ADD COLUMN vision TEXT NULL AFTER mision,
ADD COLUMN valores TEXT NULL AFTER vision,
ADD COLUMN director_general VARCHAR(255) NULL AFTER valores,
ADD COLUMN jefe_enfermeria VARCHAR(255) NULL AFTER director_general,
ADD COLUMN contacto_emergencias VARCHAR(100) NULL AFTER jefe_enfermeria;