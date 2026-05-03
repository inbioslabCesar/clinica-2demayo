-- 2026-05-02_01_origen_medico_consulta_contrato.sql
-- Vinculacion estructural de contratos con origen clinico (consulta/medico)
-- Objetivo: persistir trazabilidad en contratos_paciente_servicios desde el origen

START TRANSACTION;

-- ============================================================
-- 1) contratos_paciente_servicios: columnas de origen permanente
-- ============================================================
ALTER TABLE contratos_paciente_servicios
  ADD COLUMN consulta_origen_id INT NULL AFTER servicio_id,
  ADD COLUMN medico_origen_id INT NULL AFTER consulta_origen_id,
  ADD COLUMN origen_tipo ENUM('manual','cotizacion','consulta','mixto','migracion') NOT NULL DEFAULT 'manual' AFTER medico_origen_id,
  ADD COLUMN origen_referencia_tabla VARCHAR(50) NULL AFTER origen_tipo,
  ADD COLUMN origen_referencia_id BIGINT UNSIGNED NULL AFTER origen_referencia_tabla,
  ADD COLUMN origen_asignado_en DATETIME NULL AFTER origen_referencia_id,
  ADD COLUMN origen_asignado_por INT NULL AFTER origen_asignado_en,
  ADD COLUMN medico_origen_nombre_snapshot VARCHAR(200) NULL AFTER origen_asignado_por,
  ADD COLUMN medico_origen_cmp_snapshot VARCHAR(30) NULL AFTER medico_origen_nombre_snapshot;

ALTER TABLE contratos_paciente_servicios
  MODIFY COLUMN origen_asignado_por INT NULL;

-- Indices de soporte
SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'contratos_paciente_servicios' AND index_name = 'idx_cps_consulta_origen') = 0,
  'ALTER TABLE contratos_paciente_servicios ADD INDEX idx_cps_consulta_origen (consulta_origen_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'contratos_paciente_servicios' AND index_name = 'idx_cps_medico_origen') = 0,
  'ALTER TABLE contratos_paciente_servicios ADD INDEX idx_cps_medico_origen (medico_origen_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'contratos_paciente_servicios' AND index_name = 'idx_cps_origen_ref') = 0,
  'ALTER TABLE contratos_paciente_servicios ADD INDEX idx_cps_origen_ref (origen_referencia_tabla, origen_referencia_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- FKs de origen clinico (permanecen aunque agenda cambie)
SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'contratos_paciente_servicios' AND constraint_name = 'fk_cps_consulta_origen') = 0,
  'ALTER TABLE contratos_paciente_servicios ADD CONSTRAINT fk_cps_consulta_origen FOREIGN KEY (consulta_origen_id) REFERENCES consultas(id) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'contratos_paciente_servicios' AND constraint_name = 'fk_cps_medico_origen') = 0,
  'ALTER TABLE contratos_paciente_servicios ADD CONSTRAINT fk_cps_medico_origen FOREIGN KEY (medico_origen_id) REFERENCES medicos(id) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'contratos_paciente_servicios' AND constraint_name = 'fk_cps_origen_asignado_por') = 0,
  'ALTER TABLE contratos_paciente_servicios ADD CONSTRAINT fk_cps_origen_asignado_por FOREIGN KEY (origen_asignado_por) REFERENCES usuarios(id) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================================
-- 2) produccion_contrato_detalle: referencia directa a cps + origen
-- ============================================================
ALTER TABLE produccion_contrato_detalle
  ADD COLUMN contrato_paciente_servicio_id BIGINT UNSIGNED NULL AFTER contrato_paciente_id,
  ADD COLUMN consulta_origen_id INT NULL AFTER consulta_id,
  ADD COLUMN medico_origen_id INT NULL AFTER medico_id,
  ADD COLUMN medico_origen_nombre_snapshot VARCHAR(200) NULL AFTER medico_origen_id;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'produccion_contrato_detalle' AND index_name = 'idx_pcd_cps') = 0,
  'ALTER TABLE produccion_contrato_detalle ADD INDEX idx_pcd_cps (contrato_paciente_servicio_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'produccion_contrato_detalle' AND index_name = 'idx_pcd_consulta_origen') = 0,
  'ALTER TABLE produccion_contrato_detalle ADD INDEX idx_pcd_consulta_origen (consulta_origen_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'produccion_contrato_detalle' AND index_name = 'idx_pcd_medico_origen') = 0,
  'ALTER TABLE produccion_contrato_detalle ADD INDEX idx_pcd_medico_origen (medico_origen_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'produccion_contrato_detalle' AND constraint_name = 'fk_pcd_cps') = 0,
  'ALTER TABLE produccion_contrato_detalle ADD CONSTRAINT fk_pcd_cps FOREIGN KEY (contrato_paciente_servicio_id) REFERENCES contratos_paciente_servicios(id) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'produccion_contrato_detalle' AND constraint_name = 'fk_pcd_consulta_origen') = 0,
  'ALTER TABLE produccion_contrato_detalle ADD CONSTRAINT fk_pcd_consulta_origen FOREIGN KEY (consulta_origen_id) REFERENCES consultas(id) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'produccion_contrato_detalle' AND constraint_name = 'fk_pcd_medico_origen') = 0,
  'ALTER TABLE produccion_contrato_detalle ADD CONSTRAINT fk_pcd_medico_origen FOREIGN KEY (medico_origen_id) REFERENCES medicos(id) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================================
-- 3) Backfill de origen desde cotizaciones_detalle y consulta
-- ============================================================
UPDATE contratos_paciente_servicios cps
LEFT JOIN (
    SELECT
        cd.contrato_paciente_servicio_id AS cps_id,
        MAX(CASE WHEN cd.consulta_id IS NOT NULL AND cd.consulta_id > 0 THEN cd.consulta_id END) AS consulta_id,
        MAX(CASE WHEN cd.medico_id IS NOT NULL AND cd.medico_id > 0 THEN cd.medico_id END) AS medico_id,
        MAX(cd.cotizacion_id) AS cotizacion_id
    FROM cotizaciones_detalle cd
    WHERE cd.contrato_paciente_servicio_id IS NOT NULL
      AND cd.contrato_paciente_servicio_id > 0
    GROUP BY cd.contrato_paciente_servicio_id
) m ON m.cps_id = cps.id
SET
    cps.consulta_origen_id = COALESCE(cps.consulta_origen_id, m.consulta_id),
    cps.medico_origen_id = COALESCE(cps.medico_origen_id, m.medico_id),
    cps.origen_tipo = CASE WHEN m.cotizacion_id IS NOT NULL THEN 'cotizacion' ELSE cps.origen_tipo END,
    cps.origen_referencia_tabla = CASE WHEN m.cotizacion_id IS NOT NULL THEN 'cotizaciones' ELSE cps.origen_referencia_tabla END,
    cps.origen_referencia_id = CASE WHEN m.cotizacion_id IS NOT NULL THEN m.cotizacion_id ELSE cps.origen_referencia_id END,
    cps.origen_asignado_en = COALESCE(cps.origen_asignado_en, cps.created_at)
WHERE m.cps_id IS NOT NULL;

UPDATE contratos_paciente_servicios cps
INNER JOIN consultas c ON c.id = cps.consulta_origen_id
SET cps.medico_origen_id = c.medico_id
WHERE (cps.medico_origen_id IS NULL OR cps.medico_origen_id = 0)
  AND c.medico_id IS NOT NULL
  AND c.medico_id > 0;

UPDATE contratos_paciente_servicios cps
LEFT JOIN medicos m ON m.id = cps.medico_origen_id
SET
  cps.medico_origen_nombre_snapshot = TRIM(CONCAT(COALESCE(m.nombre, ''), ' ', COALESCE(m.apellido, ''))),
  cps.medico_origen_cmp_snapshot = COALESCE(NULLIF(m.cmp, ''), cps.medico_origen_cmp_snapshot)
WHERE cps.medico_origen_id IS NOT NULL
  AND cps.medico_origen_id > 0
  AND m.id IS NOT NULL;

-- Backfill en analitica contractual
UPDATE produccion_contrato_detalle pcd
INNER JOIN agenda_contrato ac ON ac.id = pcd.agenda_evento_id
INNER JOIN contratos_paciente_servicios cps
   ON cps.contrato_paciente_id = pcd.contrato_paciente_id
  AND cps.plantilla_item_id = ac.plantilla_item_id
SET
    pcd.contrato_paciente_servicio_id = COALESCE(pcd.contrato_paciente_servicio_id, cps.id),
    pcd.consulta_origen_id = COALESCE(pcd.consulta_origen_id, cps.consulta_origen_id),
    pcd.medico_origen_id = COALESCE(pcd.medico_origen_id, cps.medico_origen_id),
    pcd.medico_origen_nombre_snapshot = COALESCE(pcd.medico_origen_nombre_snapshot, cps.medico_origen_nombre_snapshot),
    pcd.medico_id = COALESCE(pcd.medico_id, cps.medico_origen_id)
WHERE pcd.contrato_paciente_servicio_id IS NULL;

UPDATE produccion_contrato_detalle pcd
SET pcd.medico_id = COALESCE(pcd.medico_id, pcd.medico_origen_id)
WHERE pcd.medico_id IS NULL
  AND pcd.medico_origen_id IS NOT NULL;

COMMIT;

-- Verificacion rapida
SELECT
  (SELECT COUNT(*) FROM contratos_paciente_servicios WHERE consulta_origen_id IS NOT NULL OR medico_origen_id IS NOT NULL) AS cps_con_origen,
  (SELECT COUNT(*) FROM produccion_contrato_detalle WHERE contrato_paciente_servicio_id IS NOT NULL) AS pcd_con_cps;
