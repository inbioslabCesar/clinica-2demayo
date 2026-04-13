-- Migration: Permitir NULL en paciente_id de tabla cobros
-- Fecha: 2026-04-06
-- Razón: Permitir registrar cobros de clientes particulares sin paciente_id

START TRANSACTION;

-- Modificar la columna paciente_id para permitir NULL
ALTER TABLE cobros 
MODIFY COLUMN paciente_id INT NULL;

-- Insertar datos de prueba que tengan paciente_id = NULL (para clientes del sistema que ya existan)
-- (Sin acción adicional necesaria)

COMMIT;
