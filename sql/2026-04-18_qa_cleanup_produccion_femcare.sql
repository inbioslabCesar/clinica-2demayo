-- QA cleanup toolkit (produccion) - Femcare
-- Uso: ejecutar en phpMyAdmin por bloques, en orden.
-- IMPORTANTE: Ajusta variables antes de borrar.

/* ============================================================
   BLOQUE 1: PARAMETROS DE PRUEBA
   ============================================================ */
SET @qa_paciente_id := 10;
SET @qa_usuario_id := NULL; -- opcional: ej. 12, o NULL para ignorar usuario
SET @qa_desde_dt := '2026-04-18 00:00:00';
SET @qa_hasta_dt := '2026-04-18 23:59:59';
SET @qa_origen_consulta := 'cotizador'; -- opcional: 'cotizador' o NULL

/* ============================================================
   BLOQUE 2: PRECHECK (SOLO LECTURA)
   ============================================================ */

-- Consultas objetivo
SELECT c.id, c.paciente_id, c.medico_id, c.fecha, c.hora, c.estado, c.origen_creacion, c.cobro_id
FROM consultas c
WHERE c.paciente_id = @qa_paciente_id
  AND c.fecha BETWEEN DATE(@qa_desde_dt) AND DATE(@qa_hasta_dt)
  AND (@qa_origen_consulta IS NULL OR c.origen_creacion = @qa_origen_consulta)
ORDER BY c.fecha, c.hora;

-- Recordatorios ligados a consultas objetivo
SELECT r.*
FROM recordatorios_consultas r
WHERE r.consulta_id IN (
  SELECT c.id
  FROM consultas c
  WHERE c.paciente_id = @qa_paciente_id
    AND c.fecha BETWEEN DATE(@qa_desde_dt) AND DATE(@qa_hasta_dt)
    AND (@qa_origen_consulta IS NULL OR c.origen_creacion = @qa_origen_consulta)
);

-- Triaje ligado a consultas objetivo
SELECT t.*
FROM triaje t
WHERE t.consulta_id IN (
  SELECT c.id
  FROM consultas c
  WHERE c.paciente_id = @qa_paciente_id
    AND c.fecha BETWEEN DATE(@qa_desde_dt) AND DATE(@qa_hasta_dt)
    AND (@qa_origen_consulta IS NULL OR c.origen_creacion = @qa_origen_consulta)
);

-- Atenciones del paciente en ventana
SELECT a.*
FROM atenciones a
WHERE a.paciente_id = @qa_paciente_id
  AND a.fecha BETWEEN @qa_desde_dt AND @qa_hasta_dt
  AND (@qa_usuario_id IS NULL OR a.usuario_id = @qa_usuario_id)
ORDER BY a.fecha;

-- Cotizaciones del paciente en ventana
SELECT cot.*
FROM cotizaciones cot
WHERE cot.paciente_id = @qa_paciente_id
  AND cot.fecha BETWEEN @qa_desde_dt AND @qa_hasta_dt
  AND (@qa_usuario_id IS NULL OR cot.usuario_id = @qa_usuario_id)
ORDER BY cot.fecha;

-- Detalle de cotizaciones objetivo
SELECT cd.*
FROM cotizaciones_detalle cd
WHERE cd.cotizacion_id IN (
  SELECT cot.id
  FROM cotizaciones cot
  WHERE cot.paciente_id = @qa_paciente_id
    AND cot.fecha BETWEEN @qa_desde_dt AND @qa_hasta_dt
    AND (@qa_usuario_id IS NULL OR cot.usuario_id = @qa_usuario_id)
);

-- Cobros del paciente en ventana
SELECT c.id, c.paciente_id, c.usuario_id, c.fecha_cobro, c.total, c.estado, c.tipo_pago
FROM cobros c
WHERE c.paciente_id = @qa_paciente_id
  AND c.fecha_cobro BETWEEN @qa_desde_dt AND @qa_hasta_dt
  AND (@qa_usuario_id IS NULL OR c.usuario_id = @qa_usuario_id)
ORDER BY c.fecha_cobro;

-- Detalle de cobros objetivo
SELECT cd.*
FROM cobros_detalle cd
WHERE cd.cobro_id IN (
  SELECT c.id
  FROM cobros c
  WHERE c.paciente_id = @qa_paciente_id
    AND c.fecha_cobro BETWEEN @qa_desde_dt AND @qa_hasta_dt
    AND (@qa_usuario_id IS NULL OR c.usuario_id = @qa_usuario_id)
);

-- Conteo resumido (debe revisarse antes de ejecutar borrado)
SELECT
  (SELECT COUNT(*) FROM consultas c
   WHERE c.paciente_id = @qa_paciente_id
     AND c.fecha BETWEEN DATE(@qa_desde_dt) AND DATE(@qa_hasta_dt)
     AND (@qa_origen_consulta IS NULL OR c.origen_creacion = @qa_origen_consulta)) AS consultas_obj,
  (SELECT COUNT(*) FROM recordatorios_consultas r
   WHERE r.consulta_id IN (
     SELECT c.id FROM consultas c
     WHERE c.paciente_id = @qa_paciente_id
       AND c.fecha BETWEEN DATE(@qa_desde_dt) AND DATE(@qa_hasta_dt)
       AND (@qa_origen_consulta IS NULL OR c.origen_creacion = @qa_origen_consulta)
   )) AS recordatorios_obj,
  (SELECT COUNT(*) FROM triaje t
   WHERE t.consulta_id IN (
     SELECT c.id FROM consultas c
     WHERE c.paciente_id = @qa_paciente_id
       AND c.fecha BETWEEN DATE(@qa_desde_dt) AND DATE(@qa_hasta_dt)
       AND (@qa_origen_consulta IS NULL OR c.origen_creacion = @qa_origen_consulta)
   )) AS triaje_obj,
  (SELECT COUNT(*) FROM atenciones a
   WHERE a.paciente_id = @qa_paciente_id
     AND a.fecha BETWEEN @qa_desde_dt AND @qa_hasta_dt
     AND (@qa_usuario_id IS NULL OR a.usuario_id = @qa_usuario_id)) AS atenciones_obj,
  (SELECT COUNT(*) FROM cotizaciones cot
   WHERE cot.paciente_id = @qa_paciente_id
     AND cot.fecha BETWEEN @qa_desde_dt AND @qa_hasta_dt
     AND (@qa_usuario_id IS NULL OR cot.usuario_id = @qa_usuario_id)) AS cotizaciones_obj,
  (SELECT COUNT(*) FROM cotizaciones_detalle cd
   WHERE cd.cotizacion_id IN (
     SELECT cot.id FROM cotizaciones cot
     WHERE cot.paciente_id = @qa_paciente_id
       AND cot.fecha BETWEEN @qa_desde_dt AND @qa_hasta_dt
       AND (@qa_usuario_id IS NULL OR cot.usuario_id = @qa_usuario_id)
   )) AS cot_det_obj,
  (SELECT COUNT(*) FROM cobros c
   WHERE c.paciente_id = @qa_paciente_id
     AND c.fecha_cobro BETWEEN @qa_desde_dt AND @qa_hasta_dt
     AND (@qa_usuario_id IS NULL OR c.usuario_id = @qa_usuario_id)) AS cobros_obj,
  (SELECT COUNT(*) FROM cobros_detalle cd
   WHERE cd.cobro_id IN (
     SELECT c.id FROM cobros c
     WHERE c.paciente_id = @qa_paciente_id
       AND c.fecha_cobro BETWEEN @qa_desde_dt AND @qa_hasta_dt
       AND (@qa_usuario_id IS NULL OR c.usuario_id = @qa_usuario_id)
   )) AS cob_det_obj;


/* ============================================================
   BLOQUE 3: LIMPIEZA (BORRADO)
   Ejecuta solo si el precheck es correcto.
   ============================================================ */

START TRANSACTION;

-- 3.1 Captura IDs objetivo en tablas temporales para consistencia.
DROP TEMPORARY TABLE IF EXISTS tmp_qa_consultas;
CREATE TEMPORARY TABLE tmp_qa_consultas (id INT PRIMARY KEY);

INSERT INTO tmp_qa_consultas (id)
SELECT c.id
FROM consultas c
WHERE c.paciente_id = @qa_paciente_id
  AND c.fecha BETWEEN DATE(@qa_desde_dt) AND DATE(@qa_hasta_dt)
  AND (@qa_origen_consulta IS NULL OR c.origen_creacion = @qa_origen_consulta);

DROP TEMPORARY TABLE IF EXISTS tmp_qa_cotizaciones;
CREATE TEMPORARY TABLE tmp_qa_cotizaciones (id INT PRIMARY KEY);

INSERT INTO tmp_qa_cotizaciones (id)
SELECT cot.id
FROM cotizaciones cot
WHERE cot.paciente_id = @qa_paciente_id
  AND cot.fecha BETWEEN @qa_desde_dt AND @qa_hasta_dt
  AND (@qa_usuario_id IS NULL OR cot.usuario_id = @qa_usuario_id);

DROP TEMPORARY TABLE IF EXISTS tmp_qa_cobros;
CREATE TEMPORARY TABLE tmp_qa_cobros (id INT PRIMARY KEY);

INSERT INTO tmp_qa_cobros (id)
SELECT c.id
FROM cobros c
WHERE c.paciente_id = @qa_paciente_id
  AND c.fecha_cobro BETWEEN @qa_desde_dt AND @qa_hasta_dt
  AND (@qa_usuario_id IS NULL OR c.usuario_id = @qa_usuario_id);

-- 3.2 Borrado en orden seguro (hijos -> padres).
DELETE FROM recordatorios_consultas
WHERE consulta_id IN (SELECT id FROM tmp_qa_consultas);

DELETE FROM triaje
WHERE consulta_id IN (SELECT id FROM tmp_qa_consultas);

DELETE FROM tratamientos_enfermeria
WHERE consulta_id IN (SELECT id FROM tmp_qa_consultas);

DELETE FROM atenciones
WHERE paciente_id = @qa_paciente_id
  AND fecha BETWEEN @qa_desde_dt AND @qa_hasta_dt
  AND (@qa_usuario_id IS NULL OR usuario_id = @qa_usuario_id);

DELETE FROM cobros_detalle
WHERE cobro_id IN (SELECT id FROM tmp_qa_cobros);

DELETE FROM cobros
WHERE id IN (SELECT id FROM tmp_qa_cobros);

DELETE FROM cotizaciones_detalle
WHERE cotizacion_id IN (SELECT id FROM tmp_qa_cotizaciones);

DELETE FROM cotizaciones
WHERE id IN (SELECT id FROM tmp_qa_cotizaciones);

DELETE FROM consultas
WHERE id IN (SELECT id FROM tmp_qa_consultas);

-- Elimina tambien el paciente de prueba (ID 9 = Cesar Guimaraez)
DELETE FROM pacientes
WHERE id = 10;

COMMIT;


/* ============================================================
   BLOQUE 4: VERIFICACION POST-LIMPIEZA
   ============================================================ */

SELECT
  (SELECT COUNT(*) FROM consultas c
   WHERE c.paciente_id = @qa_paciente_id
     AND c.fecha BETWEEN DATE(@qa_desde_dt) AND DATE(@qa_hasta_dt)
     AND (@qa_origen_consulta IS NULL OR c.origen_creacion = @qa_origen_consulta)) AS consultas_restantes,
  (SELECT COUNT(*) FROM atenciones a
   WHERE a.paciente_id = @qa_paciente_id
     AND a.fecha BETWEEN @qa_desde_dt AND @qa_hasta_dt
     AND (@qa_usuario_id IS NULL OR a.usuario_id = @qa_usuario_id)) AS atenciones_restantes,
  (SELECT COUNT(*) FROM cotizaciones cot
   WHERE cot.paciente_id = @qa_paciente_id
     AND cot.fecha BETWEEN @qa_desde_dt AND @qa_hasta_dt
     AND (@qa_usuario_id IS NULL OR cot.usuario_id = @qa_usuario_id)) AS cotizaciones_restantes,
  (SELECT COUNT(*) FROM cobros c
   WHERE c.paciente_id = @qa_paciente_id
     AND c.fecha_cobro BETWEEN @qa_desde_dt AND @qa_hasta_dt
     AND (@qa_usuario_id IS NULL OR c.usuario_id = @qa_usuario_id)) AS cobros_restantes,
  (SELECT COUNT(*) FROM pacientes p
   WHERE p.id = 9) AS paciente_9_restante;

-- Si necesitas abortar en pruebas antes del COMMIT, usa: ROLLBACK;
