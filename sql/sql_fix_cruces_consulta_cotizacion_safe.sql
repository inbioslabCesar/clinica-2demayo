-- Fix seguro: corregir cruces paciente-cotizacion vs paciente-consulta
-- Tabla afectada: cotizaciones_detalle.consulta_id
--
-- Criterio de seguridad:
-- 1) Solo procesa detalles tipo consulta, activos (cotizacion no anulada) y con cruce real.
-- 2) Busca consulta candidata del MISMO paciente (y mismo medico si existe), cercana a fecha de cotizacion.
-- 3) Prioriza origen hc_proxima.
-- 4) Si no encuentra candidato, NO actualiza (queda en auditoria como unresolved).

START TRANSACTION;

CREATE TABLE IF NOT EXISTS fix_cruces_consulta_cotizacion_audit (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  run_id CHAR(36) NOT NULL,
  executed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cotizacion_id INT NOT NULL,
  cotizacion_detalle_id INT NOT NULL,
  consulta_id_old INT NOT NULL,
  consulta_id_new INT NULL,
  paciente_cotizacion_id INT NOT NULL,
  paciente_consulta_old_id INT NOT NULL,
  medico_detalle_id INT NULL,
  fecha_cotizacion DATETIME NULL,
  resolution_status VARCHAR(40) NOT NULL,
  notes VARCHAR(255) NULL,
  PRIMARY KEY (id),
  KEY idx_run (run_id),
  KEY idx_cotizacion (cotizacion_id),
  KEY idx_detalle (cotizacion_detalle_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET @fix_run_id = UUID();

DROP TEMPORARY TABLE IF EXISTS tmp_cruces_candidatos;
CREATE TEMPORARY TABLE tmp_cruces_candidatos AS
SELECT
  ct.id AS cotizacion_id,
  cd.id AS cotizacion_detalle_id,
  cd.consulta_id AS consulta_id_old,
  ct.paciente_id AS paciente_cotizacion_id,
  c_old.paciente_id AS paciente_consulta_old_id,
  CASE WHEN cd.medico_id IS NULL OR cd.medico_id <= 0 THEN 0 ELSE cd.medico_id END AS medico_detalle_id,
  ct.fecha AS fecha_cotizacion,
  NULL AS consulta_id_new
FROM cotizaciones_detalle cd
INNER JOIN cotizaciones ct ON ct.id = cd.cotizacion_id
INNER JOIN consultas c_old ON c_old.id = cd.consulta_id
WHERE cd.consulta_id IS NOT NULL
  AND cd.consulta_id > 0
  AND LOWER(TRIM(COALESCE(cd.servicio_tipo, ''))) = 'consulta'
  AND LOWER(TRIM(COALESCE(ct.estado, ''))) NOT IN ('anulada', 'anulado')
  AND c_old.paciente_id <> ct.paciente_id;

-- Resolver mejor candidato por proximidad y prioridad de origen.
-- Nota: subconsulta correlacionada para compatibilidad con MySQL 5.7.
UPDATE tmp_cruces_candidatos t
SET t.consulta_id_new = (
  SELECT c.id
  FROM consultas c
  WHERE c.paciente_id = t.paciente_cotizacion_id
    AND (t.medico_detalle_id = 0 OR c.medico_id = t.medico_detalle_id)
    AND c.fecha BETWEEN DATE_SUB(DATE(t.fecha_cotizacion), INTERVAL 15 DAY)
                    AND DATE_ADD(DATE(t.fecha_cotizacion), INTERVAL 15 DAY)
  ORDER BY
    CASE WHEN LOWER(TRIM(COALESCE(c.origen_creacion, ''))) = 'hc_proxima' THEN 0 ELSE 1 END,
    CASE WHEN c.fecha >= DATE(t.fecha_cotizacion) THEN 0 ELSE 1 END,
    ABS(TIMESTAMPDIFF(MINUTE, CONCAT(c.fecha, ' ', COALESCE(c.hora, '00:00:00')), t.fecha_cotizacion)),
    c.id DESC
  LIMIT 1
);

-- Auditoria previa a update
INSERT INTO fix_cruces_consulta_cotizacion_audit (
  run_id,
  cotizacion_id,
  cotizacion_detalle_id,
  consulta_id_old,
  consulta_id_new,
  paciente_cotizacion_id,
  paciente_consulta_old_id,
  medico_detalle_id,
  fecha_cotizacion,
  resolution_status,
  notes
)
SELECT
  @fix_run_id,
  t.cotizacion_id,
  t.cotizacion_detalle_id,
  t.consulta_id_old,
  t.consulta_id_new,
  t.paciente_cotizacion_id,
  t.paciente_consulta_old_id,
  NULLIF(t.medico_detalle_id, 0),
  t.fecha_cotizacion,
  CASE WHEN t.consulta_id_new IS NULL OR t.consulta_id_new <= 0 THEN 'unresolved' ELSE 'resolved' END,
  CASE WHEN t.consulta_id_new IS NULL OR t.consulta_id_new <= 0
    THEN 'Sin candidato seguro (no se actualiza)'
    ELSE 'Reasignado por paciente/medico/proximidad'
  END
FROM tmp_cruces_candidatos t;

-- Aplicar solo los resueltos
UPDATE cotizaciones_detalle cd
JOIN tmp_cruces_candidatos t ON t.cotizacion_detalle_id = cd.id
SET cd.consulta_id = t.consulta_id_new
WHERE t.consulta_id_new IS NOT NULL
  AND t.consulta_id_new > 0
  AND t.consulta_id_new <> t.consulta_id_old;

COMMIT;

-- Resumen de corrida
SELECT
  run_id,
  COUNT(*) AS total_detectados,
  SUM(CASE WHEN resolution_status = 'resolved' THEN 1 ELSE 0 END) AS total_resueltos,
  SUM(CASE WHEN resolution_status = 'unresolved' THEN 1 ELSE 0 END) AS total_sin_resolver
FROM fix_cruces_consulta_cotizacion_audit
WHERE run_id = @fix_run_id
GROUP BY run_id;

-- Post-check global (debe tender a 0)
SELECT COUNT(*) AS total_cruces_restantes
FROM cotizaciones_detalle cd
INNER JOIN cotizaciones ct ON ct.id = cd.cotizacion_id
INNER JOIN consultas c ON c.id = cd.consulta_id
WHERE cd.consulta_id IS NOT NULL
  AND cd.consulta_id > 0
  AND LOWER(TRIM(COALESCE(cd.servicio_tipo, ''))) = 'consulta'
  AND LOWER(TRIM(COALESCE(ct.estado, ''))) NOT IN ('anulada', 'anulado')
  AND c.paciente_id <> ct.paciente_id;
