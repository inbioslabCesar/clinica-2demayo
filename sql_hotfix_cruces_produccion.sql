-- HOTFIX PRODUCCION: corrige cruces cotizaciones_detalle.consulta_id por paciente
-- Uso en phpMyAdmin:
-- 1) Ejecutar completo este script en la BD de produccion.
-- 2) Revisar SELECT de previsualizacion y el post-check final.

START TRANSACTION;

DROP TEMPORARY TABLE IF EXISTS tmp_cruces_activos;
CREATE TEMPORARY TABLE tmp_cruces_activos AS
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

-- Resolver consulta candidata segura del mismo paciente
UPDATE tmp_cruces_activos t
SET t.consulta_id_new = (
  SELECT c.id
  FROM consultas c
  WHERE c.paciente_id = t.paciente_cotizacion_id
    AND (t.medico_detalle_id = 0 OR c.medico_id = t.medico_detalle_id)
    AND c.fecha BETWEEN DATE_SUB(DATE(t.fecha_cotizacion), INTERVAL 60 DAY)
                    AND DATE_ADD(DATE(t.fecha_cotizacion), INTERVAL 60 DAY)
  ORDER BY
    CASE WHEN LOWER(TRIM(COALESCE(c.origen_creacion, ''))) = 'hc_proxima' THEN 0 ELSE 1 END,
    CASE WHEN c.fecha >= DATE(t.fecha_cotizacion) THEN 0 ELSE 1 END,
    ABS(TIMESTAMPDIFF(MINUTE, CONCAT(c.fecha, ' ', COALESCE(c.hora, '00:00:00')), t.fecha_cotizacion)),
    c.id DESC
  LIMIT 1
);

-- Previsualizacion (verificar antes de aplicar)
SELECT
  cotizacion_id,
  cotizacion_detalle_id,
  consulta_id_old,
  consulta_id_new,
  paciente_cotizacion_id,
  paciente_consulta_old_id,
  medico_detalle_id,
  fecha_cotizacion
FROM tmp_cruces_activos
ORDER BY cotizacion_id, cotizacion_detalle_id;

-- Aplicar solo cuando hay candidato valido
UPDATE cotizaciones_detalle cd
INNER JOIN tmp_cruces_activos t ON t.cotizacion_detalle_id = cd.id
SET cd.consulta_id = t.consulta_id_new
WHERE t.consulta_id_new IS NOT NULL
  AND t.consulta_id_new > 0
  AND t.consulta_id_new <> t.consulta_id_old;

COMMIT;

-- Post-check: cruces restantes
SELECT COUNT(*) AS total_cruces_restantes
FROM cotizaciones_detalle cd
INNER JOIN cotizaciones ct ON ct.id = cd.cotizacion_id
INNER JOIN consultas c ON c.id = cd.consulta_id
WHERE cd.consulta_id IS NOT NULL
  AND cd.consulta_id > 0
  AND LOWER(TRIM(COALESCE(cd.servicio_tipo, ''))) = 'consulta'
  AND LOWER(TRIM(COALESCE(ct.estado, ''))) NOT IN ('anulada', 'anulado')
  AND c.paciente_id <> ct.paciente_id;
