-- 26_verificar_contrato_existente_dia3_proxima_cita.sql
-- Verifica en contrato existente (sin escribir datos):
-- Dia 3 -> la consulta final debe estar encadenada como proxima cita de la secuencia iniciada en Dia 1.

SET @paciente_id := 1015;
SET @historia_clinica := 'HC00939';
SET @plantilla_codigo := 'CTR-1-PRUEBA-1';
SET @medico_id_esperado := 19;
SET @contrato_modo := 'SIN_CONTRATO';

SET @contrato_id_plantilla := (
  SELECT cp.id
  FROM contratos_paciente cp
  INNER JOIN contratos_plantillas p ON p.id = cp.plantilla_id
  WHERE cp.paciente_id = @paciente_id
    AND BINARY p.codigo = BINARY @plantilla_codigo
  ORDER BY cp.id DESC
  LIMIT 1
);

SET @contrato_id_ultimo := (
  SELECT cp.id
  FROM contratos_paciente cp
  WHERE cp.paciente_id = @paciente_id
  ORDER BY cp.id DESC
  LIMIT 1
);

SET @contrato_id := COALESCE(@contrato_id_plantilla, @contrato_id_ultimo);

SET @contrato_modo := (
  CASE
    WHEN @contrato_id_plantilla IS NOT NULL THEN 'match_plantilla'
    WHEN @contrato_id_ultimo IS NOT NULL THEN 'fallback_ultimo_contrato'
    ELSE 'sin_contrato'
  END
);

SET @dia1 := (
  SELECT DATE(MIN(ac.fecha_programada))
  FROM agenda_contrato ac
  WHERE ac.contrato_paciente_id = @contrato_id
);

SET @dia3 := (
  SELECT DATE(MAX(ac.fecha_programada))
  FROM agenda_contrato ac
  WHERE ac.contrato_paciente_id = @contrato_id
    AND LOWER(TRIM(ac.servicio_tipo)) = 'consulta'
);

SET @consulta_dia1 := (
  SELECT ac.consulta_id
  FROM agenda_contrato ac
  WHERE ac.contrato_paciente_id = @contrato_id
    AND DATE(ac.fecha_programada) = @dia1
    AND LOWER(TRIM(ac.servicio_tipo)) = 'consulta'
  ORDER BY ac.fecha_programada ASC, ac.id ASC
  LIMIT 1
);

SET @hc_dia1 := (
  SELECT hc.id
  FROM historia_clinica hc
  WHERE hc.consulta_id = @consulta_dia1
  ORDER BY hc.id DESC
  LIMIT 1
);

SET @consulta_dia3 := (
  SELECT ac.consulta_id
  FROM agenda_contrato ac
  WHERE ac.contrato_paciente_id = @contrato_id
    AND DATE(ac.fecha_programada) = @dia3
    AND LOWER(TRIM(ac.servicio_tipo)) = 'consulta'
  ORDER BY ac.fecha_programada DESC, ac.id DESC
  LIMIT 1
);

SELECT
  DATABASE() AS bd_actual,
  @paciente_id AS paciente_id,
  @contrato_id_plantilla AS contrato_id_match_plantilla,
  @contrato_id_ultimo AS contrato_id_ultimo,
  @contrato_modo AS modo_contrato,
  @contrato_id AS contrato_paciente_id,
  @dia1 AS fecha_dia_1,
  @dia3 AS fecha_dia_3,
  @consulta_dia1 AS consulta_dia_1,
  @hc_dia1 AS hc_dia_1,
  @consulta_dia3 AS consulta_dia_3,
  CASE
    WHEN @contrato_id IS NULL THEN 'ERROR: paciente sin contratos registrados'
    WHEN @dia1 IS NULL OR @dia3 IS NULL THEN 'ERROR: no se detecta agenda de consultas para dia 1/dia 3'
    WHEN @consulta_dia3 IS NULL THEN 'ERROR: dia 3 sin consulta vinculada'
    ELSE 'OK: datos base encontrados'
  END AS diagnostico;

SELECT
  ac.id AS agenda_id_dia3,
  ac.fecha_programada,
  ac.estado_evento,
  ac.ejecucion_estado,
  ac.consulta_id,
  c.medico_id,
  c.estado AS consulta_estado,
  c.origen_creacion,
  c.hc_origen_id,
  h_origen.id AS hc_origen_encontrada,
  h_origen.hc_root_id AS hc_origen_root,
  CASE
    WHEN c.hc_origen_id IS NULL THEN 'sin_hc_origen'
    WHEN h_origen.id = @hc_dia1 THEN 'ok_apunta_hc_dia1'
    WHEN h_origen.hc_root_id = @hc_dia1 THEN 'ok_cadena_con_raiz_dia1'
    ELSE 'revisar_cadena'
  END AS validacion_cadena,
  JSON_EXTRACT(h1.datos, '$.proxima_cita') AS proxima_cita_desde_hc_dia1
FROM agenda_contrato ac
LEFT JOIN consultas c ON c.id = ac.consulta_id
LEFT JOIN historia_clinica h_origen ON h_origen.id = c.hc_origen_id
LEFT JOIN historia_clinica h1 ON h1.id = @hc_dia1
WHERE ac.contrato_paciente_id = @contrato_id
  AND DATE(ac.fecha_programada) = @dia3
  AND LOWER(TRIM(ac.servicio_tipo)) = 'consulta'
ORDER BY ac.fecha_programada DESC, ac.id DESC;

SELECT
  SUM(CASE WHEN ac.consulta_id IS NOT NULL THEN 1 ELSE 0 END) AS consulta_dia3_con_consulta,
  SUM(CASE WHEN c.medico_id = @medico_id_esperado THEN 1 ELSE 0 END) AS consulta_dia3_medico_esperado,
  SUM(CASE WHEN c.hc_origen_id IS NOT NULL THEN 1 ELSE 0 END) AS consulta_dia3_con_hc_origen,
  SUM(CASE WHEN h_origen.id = @hc_dia1 OR h_origen.hc_root_id = @hc_dia1 THEN 1 ELSE 0 END) AS consulta_dia3_cadena_desde_dia1
FROM agenda_contrato ac
LEFT JOIN consultas c ON c.id = ac.consulta_id
LEFT JOIN historia_clinica h_origen ON h_origen.id = c.hc_origen_id
WHERE ac.contrato_paciente_id = @contrato_id
  AND DATE(ac.fecha_programada) = @dia3
  AND LOWER(TRIM(ac.servicio_tipo)) = 'consulta';
