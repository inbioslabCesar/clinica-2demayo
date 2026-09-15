-- Fix masivo: proxima_cita en historia_clinica apuntando a consultas de otro paciente.
-- Uso:
-- 1) Ejecutar en desarrollo para validar.
-- 2) Ejecutar en produccion en ventana de mantenimiento.
-- 3) Revisar SELECT finales y tabla de auditoria hc_proxima_repair_audit.

START TRANSACTION;

CREATE TABLE IF NOT EXISTS hc_proxima_repair_audit (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  executed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  hc_id INT NOT NULL,
  consulta_base_id INT NOT NULL,
  paciente_base_id INT NOT NULL,
  prox_consulta_id_old INT NULL,
  prox_consulta_id_new INT NULL,
  prox_fecha DATE NULL,
  prox_hora TIME NULL,
  repair_action VARCHAR(60) NOT NULL,
  notes VARCHAR(255) NULL,
  PRIMARY KEY (id),
  KEY idx_hc_id (hc_id),
  KEY idx_consulta_base_id (consulta_base_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DROP TEMPORARY TABLE IF EXISTS tmp_hc_proxima_candidates;
CREATE TEMPORARY TABLE tmp_hc_proxima_candidates AS
SELECT
  h.id AS hc_id,
  h.consulta_id AS consulta_base_id,
  cb.paciente_id AS paciente_base_id,
  cb.medico_id AS medico_base_id,
  CAST(JSON_UNQUOTE(JSON_EXTRACT(h.datos, '$.proxima_cita.consulta_id')) AS UNSIGNED) AS prox_consulta_id_old,
  STR_TO_DATE(JSON_UNQUOTE(JSON_EXTRACT(h.datos, '$.proxima_cita.fecha')), '%Y-%m-%d') AS prox_fecha,
  CASE
    WHEN JSON_UNQUOTE(JSON_EXTRACT(h.datos, '$.proxima_cita.hora')) REGEXP '^[0-9]{2}:[0-9]{2}:[0-9]{2}$'
      THEN CAST(JSON_UNQUOTE(JSON_EXTRACT(h.datos, '$.proxima_cita.hora')) AS TIME)
    WHEN JSON_UNQUOTE(JSON_EXTRACT(h.datos, '$.proxima_cita.hora')) REGEXP '^[0-9]{2}:[0-9]{2}$'
      THEN CAST(CONCAT(JSON_UNQUOTE(JSON_EXTRACT(h.datos, '$.proxima_cita.hora')), ':00') AS TIME)
    WHEN JSON_UNQUOTE(JSON_EXTRACT(h.datos, '$.proxima_cita.hora')) REGEXP '^[0-9]{1,2}:[0-9]{2}[[:space:]]*[APap][Mm]$'
      THEN STR_TO_DATE(JSON_UNQUOTE(JSON_EXTRACT(h.datos, '$.proxima_cita.hora')), '%h:%i %p')
    ELSE CAST('00:00:00' AS TIME)
  END AS prox_hora,
  CASE WHEN JSON_EXTRACT(h.datos, '$.proxima_cita.es_control') = true THEN 1 ELSE 0 END AS es_control,
  c_old.id AS prox_consulta_real_id,
  c_old.paciente_id AS prox_consulta_paciente_id
FROM historia_clinica h
INNER JOIN consultas cb ON cb.id = h.consulta_id
LEFT JOIN consultas c_old ON c_old.id = CAST(JSON_UNQUOTE(JSON_EXTRACT(h.datos, '$.proxima_cita.consulta_id')) AS UNSIGNED)
WHERE JSON_EXTRACT(h.datos, '$.proxima_cita') IS NOT NULL
  AND JSON_UNQUOTE(JSON_EXTRACT(h.datos, '$.proxima_cita.fecha')) IS NOT NULL
  AND TRIM(JSON_UNQUOTE(JSON_EXTRACT(h.datos, '$.proxima_cita.fecha'))) <> ''
  AND (
    c_old.id IS NULL
    OR c_old.paciente_id <> cb.paciente_id
  );

DROP TEMPORARY TABLE IF EXISTS tmp_hc_proxima_resolved;
CREATE TEMPORARY TABLE tmp_hc_proxima_resolved (
  hc_id INT PRIMARY KEY,
  consulta_base_id INT NOT NULL,
  paciente_base_id INT NOT NULL,
  medico_base_id INT NOT NULL,
  prox_consulta_id_old INT NULL,
  prox_fecha DATE NULL,
  prox_hora TIME NULL,
  es_control TINYINT(1) NOT NULL DEFAULT 0,
  prox_consulta_id_new INT NULL,
  repair_action VARCHAR(60) NULL
) ENGINE=MEMORY;

INSERT INTO tmp_hc_proxima_resolved (
  hc_id, consulta_base_id, paciente_base_id, medico_base_id,
  prox_consulta_id_old, prox_fecha, prox_hora, es_control
)
SELECT
  hc_id, consulta_base_id, paciente_base_id, medico_base_id,
  prox_consulta_id_old, prox_fecha, prox_hora, es_control
FROM tmp_hc_proxima_candidates;

-- Paso 1: Si ya existe una consulta valida del mismo paciente para la misma HC/fecha/hora, reutilizarla.
UPDATE tmp_hc_proxima_resolved r
JOIN (
  SELECT
    c.hc_origen_id AS hc_id,
    c.paciente_id,
    c.fecha,
    TIME(c.hora) AS hora_norm,
    MIN(c.id) AS consulta_match_id
  FROM consultas c
  WHERE LOWER(TRIM(COALESCE(c.origen_creacion, ''))) = 'hc_proxima'
  GROUP BY c.hc_origen_id, c.paciente_id, c.fecha, TIME(c.hora)
) m
  ON m.hc_id = r.hc_id
 AND m.paciente_id = r.paciente_base_id
 AND m.fecha = r.prox_fecha
 AND m.hora_norm = r.prox_hora
SET
  r.prox_consulta_id_new = m.consulta_match_id,
  r.repair_action = 'relink_existing';

-- Paso 2: Crear consulta faltante para las HC aun no resueltas.
INSERT INTO consultas (
  paciente_id,
  medico_id,
  fecha,
  hora,
  tipo_consulta,
  estado,
  hc_origen_id,
  origen_creacion,
  es_control
)
SELECT
  r.paciente_base_id,
  CASE WHEN r.medico_base_id > 0 THEN r.medico_base_id ELSE 1 END,
  r.prox_fecha,
  r.prox_hora,
  'programada',
  CASE WHEN r.es_control = 1 THEN 'pendiente' ELSE 'falta_cancelar' END,
  r.hc_id,
  'hc_proxima',
  r.es_control
FROM tmp_hc_proxima_resolved r
WHERE r.prox_consulta_id_new IS NULL
  AND r.prox_fecha IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM consultas c
    WHERE c.hc_origen_id = r.hc_id
      AND c.paciente_id = r.paciente_base_id
      AND c.fecha = r.prox_fecha
      AND TIME(c.hora) = r.prox_hora
      AND LOWER(TRIM(COALESCE(c.origen_creacion, ''))) = 'hc_proxima'
  );

-- Paso 3: Resolver ids creados/reusados.
UPDATE tmp_hc_proxima_resolved r
JOIN consultas c
  ON c.hc_origen_id = r.hc_id
 AND c.paciente_id = r.paciente_base_id
 AND c.fecha = r.prox_fecha
 AND TIME(c.hora) = r.prox_hora
 AND LOWER(TRIM(COALESCE(c.origen_creacion, ''))) = 'hc_proxima'
SET
  r.prox_consulta_id_new = c.id,
  r.repair_action = CASE
    WHEN r.repair_action IS NULL THEN 'created_or_resolved'
    ELSE r.repair_action
  END
WHERE r.prox_consulta_id_new IS NULL;

-- Paso 4: Auditoria antes de aplicar en JSON.
INSERT INTO hc_proxima_repair_audit (
  hc_id,
  consulta_base_id,
  paciente_base_id,
  prox_consulta_id_old,
  prox_consulta_id_new,
  prox_fecha,
  prox_hora,
  repair_action,
  notes
)
SELECT
  r.hc_id,
  r.consulta_base_id,
  r.paciente_base_id,
  r.prox_consulta_id_old,
  r.prox_consulta_id_new,
  r.prox_fecha,
  r.prox_hora,
  COALESCE(r.repair_action, 'unresolved'),
  CASE
    WHEN r.prox_consulta_id_new IS NULL THEN 'No se pudo resolver automaticamente'
    WHEN r.prox_consulta_id_old IS NULL OR r.prox_consulta_id_old = 0 THEN 'consulta_id previo vacio'
    ELSE 'consulta_id cruzado o invalido corregido'
  END
FROM tmp_hc_proxima_resolved r;

-- Paso 5: Actualizar JSON de HC solo cuando se resolvio una consulta valida.
UPDATE historia_clinica h
JOIN tmp_hc_proxima_resolved r ON r.hc_id = h.id
SET h.datos = JSON_SET(
  h.datos,
  '$.proxima_cita.consulta_id', CAST(r.prox_consulta_id_new AS UNSIGNED),
  '$.proxima_cita.origen', 'historia_clinica'
)
WHERE r.prox_consulta_id_new IS NOT NULL;

COMMIT;

-- Reporte post-fix (debe tender a 0 cruzadas por paciente).
SELECT
  COUNT(*) AS total_con_proxima,
  SUM(CASE WHEN prox_consulta_id IS NULL OR prox_consulta_id = 0 THEN 1 ELSE 0 END) AS sin_consulta_id,
  SUM(CASE WHEN prox_consulta_id IS NOT NULL AND c.id IS NULL THEN 1 ELSE 0 END) AS consulta_id_inexistente,
  SUM(CASE WHEN prox_consulta_id IS NOT NULL AND c.id IS NOT NULL AND c.paciente_id <> base.paciente_id THEN 1 ELSE 0 END) AS consulta_id_cruzada_paciente
FROM (
  SELECT
    h.id AS hc_id,
    h.consulta_id AS consulta_base_id,
    cb.paciente_id,
    CAST(JSON_UNQUOTE(JSON_EXTRACT(h.datos, '$.proxima_cita.consulta_id')) AS UNSIGNED) AS prox_consulta_id
  FROM historia_clinica h
  INNER JOIN consultas cb ON cb.id = h.consulta_id
  WHERE JSON_EXTRACT(h.datos, '$.proxima_cita') IS NOT NULL
) base
LEFT JOIN consultas c ON c.id = base.prox_consulta_id;

SELECT
  repair_action,
  COUNT(*) AS total
FROM hc_proxima_repair_audit
WHERE executed_at >= (NOW() - INTERVAL 10 MINUTE)
GROUP BY repair_action
ORDER BY total DESC;
