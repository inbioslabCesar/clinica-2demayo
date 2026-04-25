-- 30_simular_dia3_consulta_final_1015.sql
-- Simula Dia 3:
-- - crea la consulta final como proxima cita de la cadena previa
-- - la deja vinculada al evento del Dia 3
-- - deja el evento pendiente para que puedas probar el cierre/atencion despues

START TRANSACTION;

SET @seed_tag := 'SEED_LOCAL_CONTRATO_1015_3DIAS_V1';
SET @paciente_id := 1015;
SET @medico_id := 19;
SET @fecha_dia3 := DATE('2026-04-22');

SET @contrato_id := (
  SELECT id
  FROM contratos_paciente
  WHERE paciente_id = @paciente_id
    AND BINARY observaciones = BINARY @seed_tag
  ORDER BY id DESC
  LIMIT 1
);

SET @hc2_id := (
  SELECT hc.id
  FROM historia_clinica hc
  INNER JOIN consultas c ON c.id = hc.consulta_id
  WHERE c.paciente_id = @paciente_id
    AND BINARY c.origen_creacion = BINARY 'seed1015_d2'
  ORDER BY hc.id DESC
  LIMIT 1
);

SET @agenda_consulta_dia3 := (
  SELECT ac.id
  FROM agenda_contrato ac
  WHERE ac.contrato_paciente_id = @contrato_id
    AND DATE(ac.fecha_programada) = @fecha_dia3
    AND LOWER(TRIM(ac.servicio_tipo)) = 'consulta'
  ORDER BY ac.fecha_programada ASC, ac.id ASC
  LIMIT 1
);

INSERT INTO consultas (
    paciente_id,
    medico_id,
    fecha,
    hora,
    estado,
    tipo_consulta,
    hc_origen_id,
    origen_creacion,
    es_control
) VALUES (
    @paciente_id,
    @medico_id,
    @fecha_dia3,
    '09:00:00',
    'pendiente',
    'programada',
    @hc2_id,
    'seed1015_d3',
    0
);

SET @consulta_id := LAST_INSERT_ID();

UPDATE agenda_contrato
SET
    consulta_id = @consulta_id,
    estado_evento = 'pendiente',
    ejecucion_estado = 'pendiente',
    updated_at = NOW()
WHERE id = @agenda_consulta_dia3;

SELECT
  @contrato_id AS contrato_paciente_id,
  @agenda_consulta_dia3 AS agenda_consulta_dia3,
  @consulta_id AS consulta_dia3,
  @hc2_id AS hc_origen_dia3;

COMMIT;
