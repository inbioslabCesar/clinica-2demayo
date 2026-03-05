-- Optimización de índices para listado de consultas en panel médico
-- Fecha: 2026-03-04
-- Contexto: soporte para filtros y paginación server-side en api_consultas.php

SET @db := DATABASE();

-- consultas: acelera WHERE medico_id y ORDER BY fecha,hora
SET @sql := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE consultas ADD INDEX idx_consultas_medico_fecha_hora (medico_id, fecha, hora)',
    'SELECT "idx_consultas_medico_fecha_hora ya existe"'
  )
  FROM information_schema.statistics
  WHERE table_schema = @db
    AND table_name = 'consultas'
    AND index_name = 'idx_consultas_medico_fecha_hora'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- consultas: acelera WHERE paciente_id y ORDER BY fecha,hora
SET @sql := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE consultas ADD INDEX idx_consultas_paciente_fecha_hora (paciente_id, fecha, hora)',
    'SELECT "idx_consultas_paciente_fecha_hora ya existe"'
  )
  FROM information_schema.statistics
  WHERE table_schema = @db
    AND table_name = 'consultas'
    AND index_name = 'idx_consultas_paciente_fecha_hora'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- pacientes: acelera búsquedas por historia clínica
SET @sql := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE pacientes ADD INDEX idx_pacientes_historia_clinica (historia_clinica)',
    'SELECT "idx_pacientes_historia_clinica ya existe"'
  )
  FROM information_schema.statistics
  WHERE table_schema = @db
    AND table_name = 'pacientes'
    AND index_name = 'idx_pacientes_historia_clinica'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- pacientes: acelera búsquedas por DNI
SET @sql := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE pacientes ADD INDEX idx_pacientes_dni (dni)',
    'SELECT "idx_pacientes_dni ya existe"'
  )
  FROM information_schema.statistics
  WHERE table_schema = @db
    AND table_name = 'pacientes'
    AND index_name = 'idx_pacientes_dni'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
