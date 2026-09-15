-- Auditoria de integridad: cotizacion_detalle.consulta_id cruzado con otro paciente
-- Objetivo:
-- 1) Detectar y registrar diariamente cruces consulta<->paciente.
-- 2) Tener evidencia historica por ejecucion.
-- 3) (Opcional) Bloquear nuevos cruces desde BD con trigger.
--
-- Compatibilidad: MySQL 5.7+/8.0
-- Seguridad: este script NO modifica datos clinicos ni cotizaciones existentes.

/* ============================================================
   A) TABLAS DE AUDITORIA
   ============================================================ */

CREATE TABLE IF NOT EXISTS auditoria_consulta_cotizacion_runs (
  run_id CHAR(36) NOT NULL,
  executed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  host_name VARCHAR(120) NULL,
  app_env VARCHAR(40) NULL,
  total_rows INT NOT NULL DEFAULT 0,
  total_cruces INT NOT NULL DEFAULT 0,
  PRIMARY KEY (run_id),
  KEY idx_executed_at (executed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS auditoria_consulta_cotizacion_detalle (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  run_id CHAR(36) NOT NULL,
  cotizacion_id INT NOT NULL,
  cotizacion_detalle_id INT NOT NULL,
  servicio_tipo VARCHAR(50) NULL,
  consulta_id INT NOT NULL,
  paciente_cotizacion_id INT NOT NULL,
  paciente_consulta_id INT NOT NULL,
  medico_detalle_id INT NULL,
  fecha_cotizacion DATETIME NULL,
  fecha_consulta DATE NULL,
  hora_consulta TIME NULL,
  estado_cotizacion VARCHAR(50) NULL,
  estado_consulta VARCHAR(50) NULL,
  origen_consulta VARCHAR(80) NULL,
  hc_origen_id INT NULL,
  observacion VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_run (run_id),
  KEY idx_cotizacion (cotizacion_id),
  KEY idx_consulta (consulta_id),
  KEY idx_paciente_cot (paciente_cotizacion_id),
  KEY idx_paciente_cons (paciente_consulta_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

/* ============================================================
   B) EJECUCION DE AUDITORIA (MANUAL / CRON / EVENT)
   ============================================================ */

SET @audit_run_id = UUID();
SET @audit_host = @@hostname;
SET @audit_env = 'produccion';

INSERT INTO auditoria_consulta_cotizacion_detalle (
  run_id,
  cotizacion_id,
  cotizacion_detalle_id,
  servicio_tipo,
  consulta_id,
  paciente_cotizacion_id,
  paciente_consulta_id,
  medico_detalle_id,
  fecha_cotizacion,
  fecha_consulta,
  hora_consulta,
  estado_cotizacion,
  estado_consulta,
  origen_consulta,
  hc_origen_id,
  observacion
)
SELECT
  @audit_run_id AS run_id,
  ct.id AS cotizacion_id,
  cd.id AS cotizacion_detalle_id,
  cd.servicio_tipo,
  c.id AS consulta_id,
  ct.paciente_id AS paciente_cotizacion_id,
  c.paciente_id AS paciente_consulta_id,
  CASE
    WHEN cd.medico_id IS NULL OR cd.medico_id <= 0 THEN NULL
    ELSE cd.medico_id
  END AS medico_detalle_id,
  ct.fecha AS fecha_cotizacion,
  c.fecha AS fecha_consulta,
  c.hora AS hora_consulta,
  ct.estado AS estado_cotizacion,
  c.estado AS estado_consulta,
  c.origen_creacion AS origen_consulta,
  c.hc_origen_id,
  'consulta_id de detalle apunta a paciente distinto de la cotizacion' AS observacion
FROM cotizaciones_detalle cd
INNER JOIN cotizaciones ct ON ct.id = cd.cotizacion_id
INNER JOIN consultas c ON c.id = cd.consulta_id
WHERE cd.consulta_id IS NOT NULL
  AND cd.consulta_id > 0
  AND LOWER(TRIM(COALESCE(cd.servicio_tipo, ''))) = 'consulta'
  AND LOWER(TRIM(COALESCE(ct.estado, ''))) NOT IN ('anulada', 'anulado')
  AND c.paciente_id <> ct.paciente_id;

SET @audit_total_cruces = (
  SELECT COUNT(*)
  FROM auditoria_consulta_cotizacion_detalle
  WHERE run_id = @audit_run_id
);

SET @audit_total_rows = (
  SELECT COUNT(*)
  FROM cotizaciones_detalle cd
  INNER JOIN cotizaciones ct ON ct.id = cd.cotizacion_id
  WHERE cd.consulta_id IS NOT NULL
    AND cd.consulta_id > 0
    AND LOWER(TRIM(COALESCE(cd.servicio_tipo, ''))) = 'consulta'
    AND LOWER(TRIM(COALESCE(ct.estado, ''))) NOT IN ('anulada', 'anulado')
);

INSERT INTO auditoria_consulta_cotizacion_runs (
  run_id,
  host_name,
  app_env,
  total_rows,
  total_cruces
)
VALUES (
  @audit_run_id,
  @audit_host,
  @audit_env,
  COALESCE(@audit_total_rows, 0),
  COALESCE(@audit_total_cruces, 0)
);

-- Resumen de la corrida actual
SELECT
  r.run_id,
  r.executed_at,
  r.host_name,
  r.app_env,
  r.total_rows,
  r.total_cruces
FROM auditoria_consulta_cotizacion_runs r
WHERE r.run_id = @audit_run_id;

-- Detalle de cruces hallados en la corrida actual
SELECT
  d.cotizacion_id,
  d.cotizacion_detalle_id,
  d.consulta_id,
  d.paciente_cotizacion_id,
  d.paciente_consulta_id,
  d.fecha_cotizacion,
  d.fecha_consulta,
  d.hora_consulta,
  d.estado_cotizacion,
  d.estado_consulta,
  d.origen_consulta,
  d.hc_origen_id
FROM auditoria_consulta_cotizacion_detalle d
WHERE d.run_id = @audit_run_id
ORDER BY d.cotizacion_id, d.cotizacion_detalle_id;

/* ============================================================
   C) DASHBOARD RAPIDO DE ULTIMAS EJECUCIONES
   ============================================================ */

SELECT
  executed_at,
  total_rows,
  total_cruces,
  ROUND((total_cruces / NULLIF(total_rows, 0)) * 100, 4) AS porcentaje_cruce
FROM auditoria_consulta_cotizacion_runs
ORDER BY executed_at DESC
LIMIT 30;

/* ============================================================
   D) OPCIONAL: BLOQUEO PREVENTIVO EN BD (TRIGGER)
   ============================================================
   Recomendado despues de limpiar cruces historicos.
   Si no deseas bloquear en BD, deja esta seccion comentada.
*/

-- DELIMITER $$
--
-- DROP TRIGGER IF EXISTS trg_cd_consulta_paciente_guard_ins $$
-- CREATE TRIGGER trg_cd_consulta_paciente_guard_ins
-- BEFORE INSERT ON cotizaciones_detalle
-- FOR EACH ROW
-- BEGIN
--   DECLARE v_paciente_cot INT DEFAULT 0;
--   DECLARE v_paciente_cons INT DEFAULT 0;
--
--   IF NEW.consulta_id IS NOT NULL
--      AND NEW.consulta_id > 0
--      AND LOWER(TRIM(COALESCE(NEW.servicio_tipo, ''))) = 'consulta' THEN
--
--     SELECT paciente_id INTO v_paciente_cot
--     FROM cotizaciones
--     WHERE id = NEW.cotizacion_id
--     LIMIT 1;
--
--     SELECT paciente_id INTO v_paciente_cons
--     FROM consultas
--     WHERE id = NEW.consulta_id
--     LIMIT 1;
--
--     IF v_paciente_cot IS NULL OR v_paciente_cot <= 0 THEN
--       SIGNAL SQLSTATE '45000'
--         SET MESSAGE_TEXT = 'Integridad: cotizacion invalida para validar paciente.';
--     END IF;
--
--     IF v_paciente_cons IS NULL OR v_paciente_cons <= 0 THEN
--       SIGNAL SQLSTATE '45000'
--         SET MESSAGE_TEXT = 'Integridad: consulta_id inexistente en cotizaciones_detalle.';
--     END IF;
--
--     IF v_paciente_cot <> v_paciente_cons THEN
--       SIGNAL SQLSTATE '45000'
--         SET MESSAGE_TEXT = 'Integridad: consulta_id pertenece a otro paciente.';
--     END IF;
--   END IF;
-- END $$
--
-- DROP TRIGGER IF EXISTS trg_cd_consulta_paciente_guard_upd $$
-- CREATE TRIGGER trg_cd_consulta_paciente_guard_upd
-- BEFORE UPDATE ON cotizaciones_detalle
-- FOR EACH ROW
-- BEGIN
--   DECLARE v_paciente_cot INT DEFAULT 0;
--   DECLARE v_paciente_cons INT DEFAULT 0;
--
--   IF NEW.consulta_id IS NOT NULL
--      AND NEW.consulta_id > 0
--      AND LOWER(TRIM(COALESCE(NEW.servicio_tipo, ''))) = 'consulta' THEN
--
--     SELECT paciente_id INTO v_paciente_cot
--     FROM cotizaciones
--     WHERE id = NEW.cotizacion_id
--     LIMIT 1;
--
--     SELECT paciente_id INTO v_paciente_cons
--     FROM consultas
--     WHERE id = NEW.consulta_id
--     LIMIT 1;
--
--     IF v_paciente_cot IS NULL OR v_paciente_cot <= 0 THEN
--       SIGNAL SQLSTATE '45000'
--         SET MESSAGE_TEXT = 'Integridad: cotizacion invalida para validar paciente.';
--     END IF;
--
--     IF v_paciente_cons IS NULL OR v_paciente_cons <= 0 THEN
--       SIGNAL SQLSTATE '45000'
--         SET MESSAGE_TEXT = 'Integridad: consulta_id inexistente en cotizaciones_detalle.';
--     END IF;
--
--     IF v_paciente_cot <> v_paciente_cons THEN
--       SIGNAL SQLSTATE '45000'
--         SET MESSAGE_TEXT = 'Integridad: consulta_id pertenece a otro paciente.';
--     END IF;
--   END IF;
-- END $$
--
-- DELIMITER ;

/* ============================================================
   E) OPCIONAL: EVENTO DIARIO MYSQL
   ============================================================
   Requiere EVENT_SCHEDULER habilitado.
   Ejecutar solo si el hosting lo permite.
*/

-- SHOW VARIABLES LIKE 'event_scheduler';
-- SET GLOBAL event_scheduler = ON;

-- DELIMITER $$
-- DROP EVENT IF EXISTS ev_auditoria_consulta_cotizacion_diaria $$
-- CREATE EVENT ev_auditoria_consulta_cotizacion_diaria
--   ON SCHEDULE EVERY 1 DAY
--   STARTS (CURRENT_DATE + INTERVAL 1 DAY + INTERVAL 2 HOUR)
-- DO
-- BEGIN
--   SET @audit_run_id = UUID();
--   SET @audit_host = @@hostname;
--   SET @audit_env = 'produccion';
--
--   INSERT INTO auditoria_consulta_cotizacion_detalle (
--     run_id, cotizacion_id, cotizacion_detalle_id, servicio_tipo, consulta_id,
--     paciente_cotizacion_id, paciente_consulta_id, medico_detalle_id,
--     fecha_cotizacion, fecha_consulta, hora_consulta,
--     estado_cotizacion, estado_consulta, origen_consulta, hc_origen_id, observacion
--   )
--   SELECT
--     @audit_run_id,
--     ct.id,
--     cd.id,
--     cd.servicio_tipo,
--     c.id,
--     ct.paciente_id,
--     c.paciente_id,
--     CASE WHEN cd.medico_id IS NULL OR cd.medico_id <= 0 THEN NULL ELSE cd.medico_id END,
--     ct.fecha,
--     c.fecha,
--     c.hora,
--     ct.estado,
--     c.estado,
--     c.origen_creacion,
--     c.hc_origen_id,
--     'consulta_id de detalle apunta a paciente distinto de la cotizacion'
--   FROM cotizaciones_detalle cd
--   INNER JOIN cotizaciones ct ON ct.id = cd.cotizacion_id
--   INNER JOIN consultas c ON c.id = cd.consulta_id
--   WHERE cd.consulta_id IS NOT NULL
--     AND cd.consulta_id > 0
--     AND LOWER(TRIM(COALESCE(cd.servicio_tipo, ''))) = 'consulta'
--     AND LOWER(TRIM(COALESCE(ct.estado, ''))) NOT IN ('anulada', 'anulado')
--     AND c.paciente_id <> ct.paciente_id;
--
--   SET @audit_total_cruces = (
--     SELECT COUNT(*) FROM auditoria_consulta_cotizacion_detalle WHERE run_id = @audit_run_id
--   );
--
--   SET @audit_total_rows = (
--     SELECT COUNT(*)
--     FROM cotizaciones_detalle cd
--     INNER JOIN cotizaciones ct ON ct.id = cd.cotizacion_id
--     WHERE cd.consulta_id IS NOT NULL
--       AND cd.consulta_id > 0
--       AND LOWER(TRIM(COALESCE(cd.servicio_tipo, ''))) = 'consulta'
--       AND LOWER(TRIM(COALESCE(ct.estado, ''))) NOT IN ('anulada', 'anulado')
--   );
--
--   INSERT INTO auditoria_consulta_cotizacion_runs (run_id, host_name, app_env, total_rows, total_cruces)
--   VALUES (@audit_run_id, @audit_host, @audit_env, COALESCE(@audit_total_rows, 0), COALESCE(@audit_total_cruces, 0));
-- END $$
-- DELIMITER ;
