-- 32_fix_agenda_atendida_sin_consulta.sql
-- Repara eventos de agenda_contrato marcados como atendido/espontaneo sin consulta_id.
-- Estrategia:
--   1) Vinculo exacto por paciente + fecha + hora de agenda.
--   2) Fallback por paciente + fecha (si solo existe una consulta candidata ese dia).

START TRANSACTION;

-- Diagnostico previo
SELECT ac.id,
       ac.contrato_paciente_id,
       cp.paciente_id,
       ac.fecha_programada,
       ac.estado_evento,
       ac.consulta_id,
       ac.ejecucion_estado,
       ac.ejecucion_token
FROM agenda_contrato ac
INNER JOIN contratos_paciente cp ON cp.id = ac.contrato_paciente_id
WHERE LOWER(TRIM(COALESCE(ac.estado_evento, ''))) IN ('atendido', 'espontaneo')
  AND (ac.consulta_id IS NULL OR ac.consulta_id = 0)
ORDER BY ac.fecha_programada ASC, ac.id ASC;

-- Paso 1: match exacto por fecha + hora
UPDATE agenda_contrato ac
INNER JOIN contratos_paciente cp ON cp.id = ac.contrato_paciente_id
INNER JOIN consultas c
    ON c.paciente_id = cp.paciente_id
   AND c.fecha = DATE(ac.fecha_programada)
   AND TIME(c.hora) = TIME(ac.fecha_programada)
SET ac.consulta_id = c.id,
    ac.updated_by = COALESCE(ac.updated_by, 1)
WHERE LOWER(TRIM(COALESCE(ac.estado_evento, ''))) IN ('atendido', 'espontaneo')
  AND (ac.consulta_id IS NULL OR ac.consulta_id = 0)
  AND c.id > 0;

SELECT ROW_COUNT() AS vinculados_match_exacto;

-- Paso 2: fallback por dia cuando hay una sola consulta candidata
UPDATE agenda_contrato ac
INNER JOIN contratos_paciente cp ON cp.id = ac.contrato_paciente_id
INNER JOIN (
    SELECT cp2.id AS contrato_paciente_id,
           DATE(ac2.fecha_programada) AS fecha_agenda,
           MIN(c2.id) AS consulta_id,
           COUNT(*) AS total_match
    FROM agenda_contrato ac2
    INNER JOIN contratos_paciente cp2 ON cp2.id = ac2.contrato_paciente_id
    INNER JOIN consultas c2
        ON c2.paciente_id = cp2.paciente_id
       AND c2.fecha = DATE(ac2.fecha_programada)
    WHERE LOWER(TRIM(COALESCE(ac2.estado_evento, ''))) IN ('atendido', 'espontaneo')
      AND (ac2.consulta_id IS NULL OR ac2.consulta_id = 0)
    GROUP BY cp2.id, DATE(ac2.fecha_programada)
    HAVING total_match = 1
) f ON f.contrato_paciente_id = ac.contrato_paciente_id
   AND f.fecha_agenda = DATE(ac.fecha_programada)
SET ac.consulta_id = f.consulta_id,
    ac.updated_by = COALESCE(ac.updated_by, 1)
WHERE LOWER(TRIM(COALESCE(ac.estado_evento, ''))) IN ('atendido', 'espontaneo')
  AND (ac.consulta_id IS NULL OR ac.consulta_id = 0);

SELECT ROW_COUNT() AS vinculados_fallback_dia_unico;

-- Diagnostico posterior
SELECT ac.id,
       ac.contrato_paciente_id,
       cp.paciente_id,
       ac.fecha_programada,
       ac.estado_evento,
       ac.consulta_id,
       ac.ejecucion_estado,
       ac.ejecucion_token
FROM agenda_contrato ac
INNER JOIN contratos_paciente cp ON cp.id = ac.contrato_paciente_id
WHERE LOWER(TRIM(COALESCE(ac.estado_evento, ''))) IN ('atendido', 'espontaneo')
  AND (ac.consulta_id IS NULL OR ac.consulta_id = 0)
ORDER BY ac.fecha_programada ASC, ac.id ASC;

COMMIT;
