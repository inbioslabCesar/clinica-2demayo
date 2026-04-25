-- Reset de catalogos: examenes_laboratorio y medicamentos
-- Uso recomendado: respaldo previo antes de ejecutar en produccion.
-- Este script limpia tablas hijas directas para evitar bloqueos por FK.

SET NAMES utf8mb4;
SET @db := DATABASE();
SET FOREIGN_KEY_CHECKS = 0;

-- 1) Hijas de examenes_laboratorio
SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = @db AND table_name = 'inventario_consumos_examen'
    ),
    'TRUNCATE TABLE inventario_consumos_examen',
    'SELECT "skip inventario_consumos_examen"'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = @db AND table_name = 'inventario_examen_recetas'
    ),
    'TRUNCATE TABLE inventario_examen_recetas',
    'SELECT "skip inventario_examen_recetas"'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Opcional: limpiar historico asociado por id de examen (sin FK directa)
-- SET @sql := (
--   SELECT IF(
--     EXISTS(
--       SELECT 1 FROM information_schema.tables
--       WHERE table_schema = @db AND table_name = 'laboratorio_referencia_movimientos'
--     ),
--     'TRUNCATE TABLE laboratorio_referencia_movimientos',
--     'SELECT "skip laboratorio_referencia_movimientos"'
--   )
-- );
-- PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2) Hijas de medicamentos
SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = @db AND table_name = 'movimientos_medicamento'
    ),
    'TRUNCATE TABLE movimientos_medicamento',
    'SELECT "skip movimientos_medicamento"'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = @db AND table_name = 'cotizaciones_farmacia_detalle'
    ),
    'TRUNCATE TABLE cotizaciones_farmacia_detalle',
    'SELECT "skip cotizaciones_farmacia_detalle"'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3) Catalogos principales
-- Nota: en MariaDB/MySQL, TRUNCATE puede fallar en tablas padre con FK (#1701),
-- aun con FOREIGN_KEY_CHECKS=0. Se usa DELETE + reinicio de AUTO_INCREMENT.
SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = @db AND table_name = 'examenes_laboratorio'
    ),
    'DELETE FROM examenes_laboratorio',
    'SELECT "skip examenes_laboratorio"'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = @db AND table_name = 'examenes_laboratorio'
    ),
    'ALTER TABLE examenes_laboratorio AUTO_INCREMENT = 1',
    'SELECT "skip ai examenes_laboratorio"'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = @db AND table_name = 'medicamentos'
    ),
    'DELETE FROM medicamentos',
    'SELECT "skip medicamentos"'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = @db AND table_name = 'medicamentos'
    ),
    'ALTER TABLE medicamentos AUTO_INCREMENT = 1',
    'SELECT "skip ai medicamentos"'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET FOREIGN_KEY_CHECKS = 1;

-- Validacion final
SET @sql := (
  SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = @db AND table_name = 'examenes_laboratorio'),
    'SELECT COUNT(*) AS total_examenes FROM examenes_laboratorio',
    'SELECT "tabla examenes_laboratorio no existe" AS total_examenes'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = @db AND table_name = 'medicamentos'),
    'SELECT COUNT(*) AS total_medicamentos FROM medicamentos',
    'SELECT "tabla medicamentos no existe" AS total_medicamentos'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
