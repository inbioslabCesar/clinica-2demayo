-- Agregar campo de firma digital a la tabla medicos
ALTER TABLE medicos ADD COLUMN firma LONGTEXT NULL COMMENT 'Firma digital del médico en base64';

-- Agregar índice para búsquedas más rápidas
ALTER TABLE medicos ADD INDEX idx_firma (firma(100));