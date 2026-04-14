-- Optimizacion de indices para lista de consultas (produccion)
-- Fecha: 2026-04-13
-- Objetivo: mejorar paginacion/filtros y reducir costo del JOIN agregado de cotizaciones.
-- Script idempotente: verifica existencia antes de crear cada indice.

SET @schema_name = DATABASE();

-- 1) Consultas por medico + orden por fecha/hora
SET @sql = IF(
  (SELECT COUNT(*)
   FROM information_schema.statistics
   WHERE table_schema = @schema_name
     AND table_name = 'consultas'
     AND index_name = 'idx_consultas_medico_fecha_hora') = 0,
  'ALTER TABLE consultas ADD INDEX idx_consultas_medico_fecha_hora (medico_id, fecha, hora)',
  'SELECT "idx_consultas_medico_fecha_hora ya existe"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2) Consultas por paciente + orden por fecha/hora
SET @sql = IF(
  (SELECT COUNT(*)
   FROM information_schema.statistics
   WHERE table_schema = @schema_name
     AND table_name = 'consultas'
     AND index_name = 'idx_consultas_paciente_fecha_hora') = 0,
  'ALTER TABLE consultas ADD INDEX idx_consultas_paciente_fecha_hora (paciente_id, fecha, hora)',
  'SELECT "idx_consultas_paciente_fecha_hora ya existe"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3) Orden global por fecha/hora cuando no hay filtro por medico/paciente
SET @sql = IF(
  (SELECT COUNT(*)
   FROM information_schema.statistics
   WHERE table_schema = @schema_name
     AND table_name = 'consultas'
     AND index_name = 'idx_consultas_fecha_hora') = 0,
  'ALTER TABLE consultas ADD INDEX idx_consultas_fecha_hora (fecha, hora)',
  'SELECT "idx_consultas_fecha_hora ya existe"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 4) Soporte al JOIN agregado por consulta -> cotizacion
SET @sql = IF(
  (SELECT COUNT(*)
   FROM information_schema.statistics
   WHERE table_schema = @schema_name
     AND table_name = 'cotizaciones_detalle'
     AND index_name = 'idx_cd_consulta_cotizacion') = 0,
  'ALTER TABLE cotizaciones_detalle ADD INDEX idx_cd_consulta_cotizacion (consulta_id, cotizacion_id)',
  'SELECT "idx_cd_consulta_cotizacion ya existe"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 5) Soporte al filtro por estado de cotizaciones (en joins/reportes)
SET @sql = IF(
  (SELECT COUNT(*)
   FROM information_schema.statistics
   WHERE table_schema = @schema_name
     AND table_name = 'cotizaciones'
     AND index_name = 'idx_cotizaciones_estado') = 0,
  'ALTER TABLE cotizaciones ADD INDEX idx_cotizaciones_estado (estado)',
  'SELECT "idx_cotizaciones_estado ya existe"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Actualiza estadisticas del optimizador
ANALYZE TABLE consultas, cotizaciones_detalle, cotizaciones;

SELECT 'Optimizacion de indices finalizada' AS resultado;
