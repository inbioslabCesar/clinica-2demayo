-- Agregar campos profesionales a la tabla medicos
-- para información completa del médico

-- Agregar campo apellido (separado del nombre)
ALTER TABLE medicos ADD COLUMN apellido VARCHAR(100) NULL COMMENT 'Apellido del médico';

-- Agregar campo CMP (Colegio Médico del Perú)
ALTER TABLE medicos ADD COLUMN cmp VARCHAR(20) NULL COMMENT 'Código del Colegio Médico del Perú';

-- Agregar campo RNE (Registro Nacional de Especialidad)
ALTER TABLE medicos ADD COLUMN rne VARCHAR(20) NULL COMMENT 'Registro Nacional de Especialidad para especialistas';

-- Agregar índices para búsquedas más rápidas
ALTER TABLE medicos ADD INDEX idx_cmp (cmp);
ALTER TABLE medicos ADD INDEX idx_rne (rne);

-- Comentario sobre el uso
-- CMP: Obligatorio para todos los médicos (ejemplo: "64201")
-- RNE: Solo para especialistas (ejemplo: "36922")
-- apellido: Para separar nombre y apellido correctamente