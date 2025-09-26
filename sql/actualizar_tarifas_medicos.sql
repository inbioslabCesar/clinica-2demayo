-- Script para agregar relación entre médicos y tarifas
-- Ejecutar este script después del sistema_cobros.sql

-- 1. Agregar columna medico_id a la tabla tarifas
ALTER TABLE tarifas 
ADD COLUMN medico_id INT DEFAULT NULL AFTER servicio_id,
ADD INDEX idx_tarifas_medico (medico_id);

-- 2. Agregar foreign key constraint (opcional, recomendado)
-- ALTER TABLE tarifas 
-- ADD CONSTRAINT fk_tarifas_medico 
-- FOREIGN KEY (medico_id) REFERENCES medicos(id) ON DELETE SET NULL;

-- 3. Ejemplos de tarifas específicas por médico
-- Tarifa general (aplica a todos los médicos cuando medico_id es NULL)
INSERT INTO tarifas (servicio_tipo, descripcion, precio_particular, precio_seguro, precio_convenio, medico_id) VALUES
('consulta', 'Consulta General', 50.00, 30.00, 40.00, NULL);

-- Tarifas específicas por médico (reemplazar 1 y 2 con los IDs reales de tus médicos)
-- Médico 1 - Especialista en Cardiología
INSERT INTO tarifas (servicio_tipo, descripcion, precio_particular, precio_seguro, precio_convenio, medico_id) VALUES
('consulta', 'Consulta Cardiología', 80.00, 50.00, 60.00, 1);

-- Médico 2 - Especialista en Pediatría  
INSERT INTO tarifas (servicio_tipo, descripcion, precio_particular, precio_seguro, precio_convenio, medico_id) VALUES
('consulta', 'Consulta Pediatría', 70.00, 45.00, 55.00, 2);

-- 4. Crear vista para facilitar consultas con información del médico
CREATE OR REPLACE VIEW v_tarifas_medicos AS
SELECT 
    t.id,
    t.servicio_tipo,
    t.servicio_id,
    t.descripcion,
    t.precio_particular,
    t.precio_seguro,
    t.precio_convenio,
    t.activo,
    t.medico_id,
    m.nombre as medico_nombre,
    m.especialidad as medico_especialidad,
    CASE 
        WHEN t.medico_id IS NULL THEN 'Tarifa General'
        ELSE CONCAT(m.nombre, ' - ', m.especialidad)
    END as tarifa_descripcion_completa
FROM tarifas t
LEFT JOIN medicos m ON t.medico_id = m.id
ORDER BY t.servicio_tipo, t.medico_id;