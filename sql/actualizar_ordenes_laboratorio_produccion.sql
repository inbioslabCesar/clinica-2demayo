-- Script para actualizar la tabla ordenes_laboratorio en producción (Hostinger)
-- Agregar columnas faltantes: cobro_id y paciente_id

USE u330560936_2demayobd;

-- Verificar estructura actual
DESCRIBE ordenes_laboratorio;

-- Agregar columna cobro_id si no existe
ALTER TABLE ordenes_laboratorio 
ADD COLUMN IF NOT EXISTS cobro_id INT DEFAULT NULL AFTER id,
ADD INDEX idx_cobro_id (cobro_id);

-- Agregar columna paciente_id si no existe  
ALTER TABLE ordenes_laboratorio 
ADD COLUMN IF NOT EXISTS paciente_id INT DEFAULT NULL AFTER consulta_id,
ADD INDEX idx_paciente_id (paciente_id);

-- Agregar llaves foráneas si las tablas relacionadas existen
-- ALTER TABLE ordenes_laboratorio 
-- ADD CONSTRAINT fk_ordenes_laboratorio_cobro_id 
-- FOREIGN KEY (cobro_id) REFERENCES cobros(id) ON DELETE SET NULL;

-- ALTER TABLE ordenes_laboratorio 
-- ADD CONSTRAINT fk_ordenes_laboratorio_paciente_id 
-- FOREIGN KEY (paciente_id) REFERENCES pacientes(id) ON DELETE SET NULL;

-- Verificar estructura actualizada
DESCRIBE ordenes_laboratorio;

-- Mostrar datos existentes para verificar
SELECT * FROM ordenes_laboratorio LIMIT 5;