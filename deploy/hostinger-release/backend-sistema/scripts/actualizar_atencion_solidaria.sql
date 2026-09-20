-- Atención solidaria: descuento total con renuncia explícita del honorario médico.
-- Ejecutar una sola vez en desarrollo/producción antes de usar el flujo.
-- Si la columna ya existe, no volver a ejecutar el ALTER.

ALTER TABLE cobros
    ADD COLUMN atencion_solidaria TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'Atencion gratuita con renuncia de honorario medico';

SHOW COLUMNS FROM cobros LIKE 'atencion_solidaria';
