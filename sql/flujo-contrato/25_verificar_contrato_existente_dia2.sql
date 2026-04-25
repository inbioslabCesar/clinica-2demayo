-- 25_verificar_contrato_existente_dia2.sql
-- Verifica en contrato existente (sin escribir datos):
-- Dia 2 -> relacion Laboratorio con Consulta/HC y orden de laboratorio.

SET @paciente_id := 1015;
SET @historia_clinica := 'HC00939';
SET @plantilla_codigo := 'CTR-1-PRUEBA-1';
SET @servicio_lab_id_esperado := 2;
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

SET @dia2 := (
  SELECT DATE(MIN(ac.fecha_programada))
  FROM agenda_contrato ac
  WHERE ac.contrato_paciente_id = @contrato_id
    AND DATE(ac.fecha_programada) > @dia1
    AND LOWER(TRIM(ac.servicio_tipo)) = 'laboratorio'
);

SET @consulta_dia2 := (
  SELECT ac.consulta_id
  FROM agenda_contrato ac
  WHERE ac.contrato_paciente_id = @contrato_id
    AND DATE(ac.fecha_programada) = @dia2
    AND LOWER(TRIM(ac.servicio_tipo)) = 'laboratorio'
  ORDER BY ac.fecha_programada ASC, ac.id ASC
  LIMIT 1
);

SET @hc_dia2 := (
  SELECT hc.id
  FROM historia_clinica hc
  WHERE hc.consulta_id = @consulta_dia2
  ORDER BY hc.id DESC
  LIMIT 1
);

SELECT
  DATABASE() AS bd_actual,
  @paciente_id AS paciente_id,
  @contrato_id_plantilla AS contrato_id_match_plantilla,
  @contrato_id_ultimo AS contrato_id_ultimo,
  @contrato_modo AS modo_contrato,
  @contrato_id AS contrato_paciente_id,
  @dia2 AS fecha_dia_2,
  @consulta_dia2 AS consulta_dia_2,
  @hc_dia2 AS historia_clinica_dia_2,
  CASE
    WHEN @contrato_id IS NULL THEN 'ERROR: paciente sin contratos registrados'
    WHEN @dia2 IS NULL THEN 'ERROR: no se detecta evento de laboratorio dia 2'
    WHEN @consulta_dia2 IS NULL THEN 'ERROR: laboratorio dia 2 sin consulta vinculada'
    ELSE 'OK: datos base encontrados'
  END AS diagnostico;

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
  c.estado AS consulta_estado,
  c.hc_origen_id,
  hc.id AS historia_clinica_id,
  hc.hc_parent_id,
  hc.hc_root_id,
  cot.total AS cotizacion_total,
  cot.estado AS cotizacion_estado,
  ol.id AS orden_laboratorio_id,
  ol.estado AS orden_laboratorio_estado,
  ol.historia_clinica_id AS orden_hc_id
FROM agenda_contrato ac
LEFT JOIN consultas c ON c.id = ac.consulta_id
LEFT JOIN historia_clinica hc ON hc.consulta_id = ac.consulta_id
LEFT JOIN cotizaciones cot ON cot.id = ac.cotizacion_id_ejecucion
LEFT JOIN ordenes_laboratorio ol ON ol.consulta_id = ac.consulta_id
WHERE ac.contrato_paciente_id = @contrato_id
  AND DATE(ac.fecha_programada) = @dia2
  AND LOWER(TRIM(ac.servicio_tipo)) = 'laboratorio'
ORDER BY ac.fecha_programada ASC, ac.id ASC;

SELECT
  SUM(CASE WHEN LOWER(TRIM(ac.servicio_tipo)) = 'laboratorio' THEN 1 ELSE 0 END) AS total_laboratorio_dia2,
  SUM(CASE WHEN LOWER(TRIM(ac.servicio_tipo)) = 'laboratorio' AND ac.servicio_id = @servicio_lab_id_esperado THEN 1 ELSE 0 END) AS laboratorio_servicio_esperado,
  SUM(CASE WHEN ac.consulta_id IS NOT NULL THEN 1 ELSE 0 END) AS laboratorio_con_consulta,
  SUM(CASE WHEN hc.id IS NOT NULL THEN 1 ELSE 0 END) AS laboratorio_con_hc,
  SUM(CASE WHEN ol.id IS NOT NULL THEN 1 ELSE 0 END) AS laboratorio_con_orden,
  SUM(CASE WHEN ol.historia_clinica_id = hc.id THEN 1 ELSE 0 END) AS orden_ligada_a_hc,
  SUM(CASE WHEN ac.cotizacion_id_ejecucion IS NOT NULL THEN 1 ELSE 0 END) AS laboratorio_con_cotizacion,
  SUM(CASE WHEN cot.total = 0 THEN 1 ELSE 0 END) AS laboratorio_cotizacion_total_cero
FROM agenda_contrato ac
LEFT JOIN historia_clinica hc ON hc.consulta_id = ac.consulta_id
LEFT JOIN cotizaciones cot ON cot.id = ac.cotizacion_id_ejecucion
LEFT JOIN ordenes_laboratorio ol ON ol.consulta_id = ac.consulta_id
WHERE ac.contrato_paciente_id = @contrato_id
  AND DATE(ac.fecha_programada) = @dia2
  AND LOWER(TRIM(ac.servicio_tipo)) = 'laboratorio';
