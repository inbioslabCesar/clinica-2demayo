-- 20260502_trazabilidad_contratos.sql
-- Trazabilidad estructural de origen en contratos y analitica.
-- Objetivo: que cada servicio del contrato nazca con consulta/medico de origen
-- y snapshots historicos para auditoria.

SET @db_name := DATABASE();

-- ---------------------------------------------------------------------
-- contratos_plantillas_items (fuente inmutable de medico por item)
-- ---------------------------------------------------------------------
SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'contratos_plantillas_items' AND COLUMN_NAME = 'medico_id') = 0,
  'ALTER TABLE contratos_plantillas_items ADD COLUMN medico_id INT NULL AFTER servicio_id',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'contratos_plantillas_items' AND COLUMN_NAME = 'medico_nombre_snapshot') = 0,
  'ALTER TABLE contratos_plantillas_items ADD COLUMN medico_nombre_snapshot VARCHAR(200) NULL AFTER medico_id',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'contratos_plantillas_items' AND COLUMN_NAME = 'medico_cmp_snapshot') = 0,
  'ALTER TABLE contratos_plantillas_items ADD COLUMN medico_cmp_snapshot VARCHAR(50) NULL AFTER medico_nombre_snapshot',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'contratos_plantillas_items' AND INDEX_NAME = 'idx_cpi_medico') = 0,
  'ALTER TABLE contratos_plantillas_items ADD INDEX idx_cpi_medico (medico_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.table_constraints
   WHERE table_schema = @db_name AND table_name = 'contratos_plantillas_items' AND constraint_name = 'fk_cpi_medico') = 0,
  'ALTER TABLE contratos_plantillas_items ADD CONSTRAINT fk_cpi_medico FOREIGN KEY (medico_id) REFERENCES medicos(id) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------
-- contratos_paciente_servicios
-- ---------------------------------------------------------------------
SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'contratos_paciente_servicios' AND COLUMN_NAME = 'consulta_origen_id') = 0,
  'ALTER TABLE contratos_paciente_servicios ADD COLUMN consulta_origen_id INT NULL AFTER servicio_id',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'contratos_paciente_servicios' AND COLUMN_NAME = 'medico_origen_id') = 0,
  'ALTER TABLE contratos_paciente_servicios ADD COLUMN medico_origen_id INT NULL AFTER consulta_origen_id',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'contratos_paciente_servicios' AND COLUMN_NAME = 'medico_origen_nombre_snapshot') = 0,
  'ALTER TABLE contratos_paciente_servicios ADD COLUMN medico_origen_nombre_snapshot VARCHAR(200) NULL AFTER medico_origen_id',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'contratos_paciente_servicios' AND COLUMN_NAME = 'medico_origen_cmp_snapshot') = 0,
  'ALTER TABLE contratos_paciente_servicios ADD COLUMN medico_origen_cmp_snapshot VARCHAR(50) NULL AFTER medico_origen_nombre_snapshot',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'contratos_paciente_servicios' AND COLUMN_NAME = 'servicio_nombre_snapshot') = 0,
  'ALTER TABLE contratos_paciente_servicios ADD COLUMN servicio_nombre_snapshot VARCHAR(255) NULL AFTER medico_origen_cmp_snapshot',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'contratos_paciente_servicios' AND INDEX_NAME = 'idx_cps_consulta_origen') = 0,
  'ALTER TABLE contratos_paciente_servicios ADD INDEX idx_cps_consulta_origen (consulta_origen_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'contratos_paciente_servicios' AND INDEX_NAME = 'idx_cps_medico_origen') = 0,
  'ALTER TABLE contratos_paciente_servicios ADD INDEX idx_cps_medico_origen (medico_origen_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.table_constraints
   WHERE table_schema = @db_name AND table_name = 'contratos_paciente_servicios' AND constraint_name = 'fk_cps_consulta_origen') = 0,
  'ALTER TABLE contratos_paciente_servicios ADD CONSTRAINT fk_cps_consulta_origen FOREIGN KEY (consulta_origen_id) REFERENCES consultas(id) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.table_constraints
   WHERE table_schema = @db_name AND table_name = 'contratos_paciente_servicios' AND constraint_name = 'fk_cps_medico_origen') = 0,
  'ALTER TABLE contratos_paciente_servicios ADD CONSTRAINT fk_cps_medico_origen FOREIGN KEY (medico_origen_id) REFERENCES medicos(id) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------
-- produccion_contrato_detalle
-- ---------------------------------------------------------------------
SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'produccion_contrato_detalle' AND COLUMN_NAME = 'consulta_origen_id') = 0,
  'ALTER TABLE produccion_contrato_detalle ADD COLUMN consulta_origen_id INT NULL AFTER consulta_id',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'produccion_contrato_detalle' AND COLUMN_NAME = 'medico_origen_id') = 0,
  'ALTER TABLE produccion_contrato_detalle ADD COLUMN medico_origen_id INT NULL AFTER medico_id',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'produccion_contrato_detalle' AND COLUMN_NAME = 'medico_origen_nombre_snapshot') = 0,
  'ALTER TABLE produccion_contrato_detalle ADD COLUMN medico_origen_nombre_snapshot VARCHAR(200) NULL AFTER medico_origen_id',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'produccion_contrato_detalle' AND COLUMN_NAME = 'servicio_nombre_snapshot') = 0,
  'ALTER TABLE produccion_contrato_detalle ADD COLUMN servicio_nombre_snapshot VARCHAR(255) NULL AFTER medico_origen_nombre_snapshot',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'produccion_contrato_detalle' AND INDEX_NAME = 'idx_pcd_consulta_origen') = 0,
  'ALTER TABLE produccion_contrato_detalle ADD INDEX idx_pcd_consulta_origen (consulta_origen_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'produccion_contrato_detalle' AND INDEX_NAME = 'idx_pcd_medico_origen') = 0,
  'ALTER TABLE produccion_contrato_detalle ADD INDEX idx_pcd_medico_origen (medico_origen_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.table_constraints
   WHERE table_schema = @db_name AND table_name = 'produccion_contrato_detalle' AND constraint_name = 'fk_pcd_consulta_origen') = 0,
  'ALTER TABLE produccion_contrato_detalle ADD CONSTRAINT fk_pcd_consulta_origen FOREIGN KEY (consulta_origen_id) REFERENCES consultas(id) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.table_constraints
   WHERE table_schema = @db_name AND table_name = 'produccion_contrato_detalle' AND constraint_name = 'fk_pcd_medico_origen') = 0,
  'ALTER TABLE produccion_contrato_detalle ADD CONSTRAINT fk_pcd_medico_origen FOREIGN KEY (medico_origen_id) REFERENCES medicos(id) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------
-- Backfill de medico en plantilla y propagacion a contrato
-- ---------------------------------------------------------------------
UPDATE contratos_plantillas_items cpi
INNER JOIN tarifas t
  ON t.id = cpi.servicio_id
 AND (
   LOWER(TRIM(cpi.servicio_tipo)) COLLATE utf8mb4_unicode_ci = LOWER(TRIM(t.servicio_tipo)) COLLATE utf8mb4_unicode_ci
   OR (LOWER(TRIM(cpi.servicio_tipo)) COLLATE utf8mb4_unicode_ci = 'procedimiento' AND LOWER(TRIM(t.servicio_tipo)) COLLATE utf8mb4_unicode_ci = 'procedimientos')
   OR (LOWER(TRIM(cpi.servicio_tipo)) COLLATE utf8mb4_unicode_ci = 'rayosx' AND LOWER(TRIM(t.servicio_tipo)) COLLATE utf8mb4_unicode_ci IN ('rayos x', 'rayos_x', 'rayosx'))
 )
SET cpi.medico_id = t.medico_id
WHERE (cpi.medico_id IS NULL OR cpi.medico_id = 0)
  AND t.medico_id IS NOT NULL
  AND t.medico_id > 0;

UPDATE contratos_plantillas_items cpi
LEFT JOIN medicos m ON m.id = cpi.medico_id
SET cpi.medico_nombre_snapshot = TRIM(CONCAT(COALESCE(m.nombre, ''), ' ', COALESCE(m.apellido, ''))),
    cpi.medico_cmp_snapshot = COALESCE(m.cmp, cpi.medico_cmp_snapshot)
WHERE cpi.medico_id IS NOT NULL
  AND cpi.medico_id > 0
  AND (
    cpi.medico_nombre_snapshot IS NULL OR cpi.medico_nombre_snapshot = ''
    OR cpi.medico_cmp_snapshot IS NULL OR cpi.medico_cmp_snapshot = ''
  );

UPDATE contratos_paciente_servicios cps
INNER JOIN contratos_plantillas_items cpi ON cpi.id = cps.plantilla_item_id
SET cps.medico_origen_id = COALESCE(cps.medico_origen_id, cpi.medico_id),
    cps.medico_origen_nombre_snapshot = CASE
      WHEN (cps.medico_origen_nombre_snapshot IS NULL OR cps.medico_origen_nombre_snapshot = '') THEN COALESCE(cpi.medico_nombre_snapshot, cps.medico_origen_nombre_snapshot)
      ELSE cps.medico_origen_nombre_snapshot
    END,
    cps.medico_origen_cmp_snapshot = CASE
      WHEN (cps.medico_origen_cmp_snapshot IS NULL OR cps.medico_origen_cmp_snapshot = '') THEN COALESCE(cpi.medico_cmp_snapshot, cps.medico_origen_cmp_snapshot)
      ELSE cps.medico_origen_cmp_snapshot
    END
WHERE (cps.medico_origen_id IS NULL OR cps.medico_origen_id = 0)
   OR (cps.medico_origen_nombre_snapshot IS NULL OR cps.medico_origen_nombre_snapshot = '')
   OR (cps.medico_origen_cmp_snapshot IS NULL OR cps.medico_origen_cmp_snapshot = '');

-- ---------------------------------------------------------------------
-- Backfill minimo de snapshots de servicio (si estan vacios)
-- ---------------------------------------------------------------------
UPDATE contratos_paciente_servicios cps
INNER JOIN contratos_plantillas_items cpi ON cpi.id = cps.plantilla_item_id
SET cps.servicio_nombre_snapshot = cpi.descripcion_snapshot
WHERE (cps.servicio_nombre_snapshot IS NULL OR cps.servicio_nombre_snapshot = '')
  AND cpi.descripcion_snapshot IS NOT NULL
  AND cpi.descripcion_snapshot <> '';

UPDATE produccion_contrato_detalle pcd
INNER JOIN contratos_paciente_servicios cps ON cps.id = pcd.contrato_paciente_servicio_id
SET pcd.medico_origen_id = COALESCE(pcd.medico_origen_id, cps.medico_origen_id),
    pcd.medico_origen_nombre_snapshot = CASE
      WHEN (pcd.medico_origen_nombre_snapshot IS NULL OR pcd.medico_origen_nombre_snapshot = '') THEN COALESCE(cps.medico_origen_nombre_snapshot, pcd.medico_origen_nombre_snapshot)
      ELSE pcd.medico_origen_nombre_snapshot
    END,
    pcd.servicio_nombre_snapshot = CASE
      WHEN (pcd.servicio_nombre_snapshot IS NULL OR pcd.servicio_nombre_snapshot = '') THEN COALESCE(cps.servicio_nombre_snapshot, pcd.servicio_nombre_snapshot)
      ELSE pcd.servicio_nombre_snapshot
    END
WHERE (pcd.medico_origen_id IS NULL OR pcd.medico_origen_id = 0)
   OR (pcd.medico_origen_nombre_snapshot IS NULL OR pcd.medico_origen_nombre_snapshot = '')
   OR (pcd.servicio_nombre_snapshot IS NULL OR pcd.servicio_nombre_snapshot = '');

UPDATE produccion_contrato_detalle pcd
SET pcd.servicio_nombre_snapshot = pcd.servicio_nombre
WHERE (pcd.servicio_nombre_snapshot IS NULL OR pcd.servicio_nombre_snapshot = '')
  AND pcd.servicio_nombre IS NOT NULL
  AND pcd.servicio_nombre <> '';

-- ---------------------------------------------------------------------
-- Ampliar ENUM origen_tipo en contratos_paciente_servicios para incluir 'plantilla'
-- (idempotente: si ya tiene el valor, el MODIFY no hace daño)
-- ---------------------------------------------------------------------
ALTER TABLE contratos_paciente_servicios
  MODIFY COLUMN origen_tipo ENUM('manual','cotizacion','consulta','mixto','migracion','plantilla') NOT NULL DEFAULT 'manual';

SELECT 'OK - trazabilidad contratos aplicada (plantilla -> contrato -> produccion)' AS estado;
