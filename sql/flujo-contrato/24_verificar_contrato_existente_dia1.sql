-- 24_verificar_contrato_existente_dia1.sql
-- Verifica en contrato existente (sin escribir datos):
-- Dia 1 -> relacion Consulta + Ecografia con misma consulta e HC.

SET @paciente_id := 1015;
SET @historia_clinica := 'HC00939';
SET @plantilla_codigo := 'CTR-1-PRUEBA-1';
SET @medico_id_esperado := 19;
SET @contrato_modo := 'SIN_CONTRATO';

SET @paciente_ok := (
  SELECT id
  FROM pacientes
  WHERE id = @paciente_id
    AND BINARY historia_clinica = BINARY @historia_clinica
  LIMIT 1
);

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

SET @consulta_dia1 := (
  SELECT ac.consulta_id
  FROM agenda_contrato ac
  WHERE ac.contrato_paciente_id = @contrato_id
    AND DATE(ac.fecha_programada) = @dia1
    AND LOWER(TRIM(ac.servicio_tipo)) = 'consulta'
  ORDER BY ac.fecha_programada ASC, ac.id ASC
  LIMIT 1
);

SELECT
  DATABASE() AS bd_actual,
  @paciente_id AS paciente_id_param,
  @historia_clinica AS historia_clinica_param,
  @plantilla_codigo AS plantilla_codigo_param,
  @contrato_id_plantilla AS contrato_id_match_plantilla,
  @contrato_id_ultimo AS contrato_id_ultimo,
  @paciente_ok AS paciente_validado,
  @contrato_id AS contrato_paciente_id,
  @contrato_modo AS modo_contrato,
  @dia1 AS fecha_dia_1,
  @consulta_dia1 AS consulta_dia_1,
  CASE
    WHEN @paciente_ok IS NULL THEN 'ERROR: paciente no encontrado o HC no coincide'
    WHEN @contrato_id IS NULL THEN 'ERROR: paciente sin contratos registrados'
    WHEN @dia1 IS NULL THEN 'ERROR: contrato sin agenda registrada'
    WHEN @consulta_dia1 IS NULL THEN 'ERROR: dia 1 sin consulta vinculada'
    ELSE 'OK: datos base encontrados'
  END AS diagnostico;

SELECT
  cp.id AS contrato_id,
  cp.estado,
  cp.fecha_inicio,
  cp.fecha_fin,
  cp.plantilla_id,
  p.codigo AS plantilla_codigo,
  p.nombre AS plantilla_nombre,
  cp.observaciones
FROM contratos_paciente cp
LEFT JOIN contratos_plantillas p ON p.id = cp.plantilla_id
WHERE cp.paciente_id = @paciente_id
ORDER BY cp.id DESC
LIMIT 10;

SELECT
  @paciente_id AS paciente_id,
  @paciente_ok AS paciente_validado,
  @contrato_id AS contrato_paciente_id,
  @dia1 AS fecha_dia_1,
  @consulta_dia1 AS consulta_dia_1;

SELECT
  ac.id AS agenda_id,
  ac.plantilla_item_id,
  ac.servicio_tipo,
  ac.servicio_id,
  ac.fecha_programada,
  ac.estado_evento,
  ac.ejecucion_estado,
  ac.consulta_id,
  ac.cotizacion_id_ejecucion,
  c.medico_id,
  c.estado AS consulta_estado,
  hc.id AS historia_clinica_id,
  hc.hc_parent_id,
  hc.hc_root_id,
  cot.total AS cotizacion_total,
  cot.estado AS cotizacion_estado,
  CASE
    WHEN LOWER(TRIM(ac.servicio_tipo)) = 'ecografia' AND ac.consulta_id = @consulta_dia1 THEN 'ok_misma_consulta_dia1'
    WHEN LOWER(TRIM(ac.servicio_tipo)) = 'consulta' AND ac.consulta_id = @consulta_dia1 THEN 'ok_consulta_base_dia1'
    ELSE 'revisar'
  END AS validacion_relacion
FROM agenda_contrato ac
LEFT JOIN consultas c ON c.id = ac.consulta_id
LEFT JOIN historia_clinica hc ON hc.consulta_id = ac.consulta_id
LEFT JOIN cotizaciones cot ON cot.id = ac.cotizacion_id_ejecucion
WHERE ac.contrato_paciente_id = @contrato_id
  AND DATE(ac.fecha_programada) = @dia1
  AND LOWER(TRIM(ac.servicio_tipo)) IN ('consulta', 'ecografia')
ORDER BY ac.fecha_programada ASC, ac.id ASC;

SELECT
  SUM(CASE WHEN LOWER(TRIM(ac.servicio_tipo)) = 'consulta' THEN 1 ELSE 0 END) AS total_consulta_dia1,
  SUM(CASE WHEN LOWER(TRIM(ac.servicio_tipo)) = 'ecografia' THEN 1 ELSE 0 END) AS total_ecografia_dia1,
  SUM(CASE WHEN LOWER(TRIM(ac.servicio_tipo)) = 'consulta' AND ac.consulta_id IS NOT NULL THEN 1 ELSE 0 END) AS consulta_con_consulta_id,
  SUM(CASE WHEN LOWER(TRIM(ac.servicio_tipo)) = 'ecografia' AND ac.consulta_id = @consulta_dia1 THEN 1 ELSE 0 END) AS ecografia_misma_consulta,
  SUM(CASE WHEN LOWER(TRIM(ac.servicio_tipo)) = 'consulta' AND c.medico_id = @medico_id_esperado THEN 1 ELSE 0 END) AS consulta_medico_esperado,
  SUM(CASE WHEN hc.id IS NOT NULL THEN 1 ELSE 0 END) AS eventos_con_hc,
  SUM(CASE WHEN ac.cotizacion_id_ejecucion IS NOT NULL THEN 1 ELSE 0 END) AS eventos_con_cotizacion,
  SUM(CASE WHEN cot.total = 0 THEN 1 ELSE 0 END) AS eventos_cotizacion_total_cero
FROM agenda_contrato ac
LEFT JOIN consultas c ON c.id = ac.consulta_id
LEFT JOIN historia_clinica hc ON hc.consulta_id = ac.consulta_id
LEFT JOIN cotizaciones cot ON cot.id = ac.cotizacion_id_ejecucion
WHERE ac.contrato_paciente_id = @contrato_id
  AND DATE(ac.fecha_programada) = @dia1
  AND LOWER(TRIM(ac.servicio_tipo)) IN ('consulta', 'ecografia');
