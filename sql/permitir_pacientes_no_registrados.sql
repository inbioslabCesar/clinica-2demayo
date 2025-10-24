-- Script para permitir pacientes no registrados en el sistema de cobros
-- Ejecutar este script para permitir que paciente_id sea NULL en la tabla cobros

-- Modificar la tabla cobros para permitir paciente_id NULL
ALTER TABLE cobros MODIFY COLUMN paciente_id INT NULL;

-- Agregar comentario para documentar el cambio
ALTER TABLE cobros COMMENT = 'Tabla de cobros - paciente_id puede ser NULL para pacientes no registrados';

-- Opcional: Agregar campos para almacenar datos de pacientes no registrados
-- (Alternativa: usar las observaciones para almacenar esta información)
-- ALTER TABLE cobros ADD COLUMN paciente_nombre_temporal VARCHAR(200) NULL AFTER paciente_id;
-- ALTER TABLE cobros ADD COLUMN paciente_dni_temporal VARCHAR(20) NULL AFTER paciente_nombre_temporal;