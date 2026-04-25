-- 29_simular_dia2_laboratorio_1015.sql
-- Simula Dia 2:
-- - crea consulta de seguimiento del laboratorio
-- - vincula el evento laboratorio a esa consulta
-- - crea HC hija
-- - crea orden de laboratorio

START TRANSACTION;

SET @seed_tag := 'SEED_LOCAL_CONTRATO_1015_3DIAS_V1';
SET @paciente_id := 1015;
SET @medico_id := 19;
SET @usuario_id := 1;
SET @fecha_dia2 := DATE('2026-04-21');
SET @cot_obs := CONCAT(@seed_tag, ' DIA2');

SET @contrato_id := (
  SELECT id
  FROM contratos_paciente
  WHERE paciente_id = @paciente_id
    AND BINARY observaciones = BINARY @seed_tag
  ORDER BY id DESC
  LIMIT 1
);

SET @hc1_id := (
  SELECT hc.id
  FROM historia_clinica hc
  INNER JOIN consultas c ON c.id = hc.consulta_id
  WHERE c.paciente_id = @paciente_id
    AND BINARY c.origen_creacion = BINARY 'seed1015_d1'
  ORDER BY hc.id DESC
  LIMIT 1
);

SET @agenda_lab_id := (
  SELECT ac.id
  FROM agenda_contrato ac
  WHERE ac.contrato_paciente_id = @contrato_id
    AND DATE(ac.fecha_programada) = @fecha_dia2
    AND LOWER(TRIM(ac.servicio_tipo)) = 'laboratorio'
  ORDER BY ac.fecha_programada ASC, ac.id ASC
  LIMIT 1
);

SET @lab_servicio_id := (
  SELECT ac.servicio_id
  FROM agenda_contrato ac
  WHERE ac.id = @agenda_lab_id
  LIMIT 1
);
SET @plantilla_item_lab_id := (
  SELECT plantilla_item_id FROM agenda_contrato WHERE id = @agenda_lab_id LIMIT 1
);
SET @titulo_lab := (
  SELECT titulo_evento FROM agenda_contrato WHERE id = @agenda_lab_id LIMIT 1
);
SET @cps_lab_id := (
  SELECT id
  FROM contratos_paciente_servicios
  WHERE contrato_paciente_id = @contrato_id
    AND plantilla_item_id = @plantilla_item_lab_id
  ORDER BY id DESC
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
    @fecha_dia2,
    '09:00:00',
    'completada',
    'programada',
    @hc1_id,
    'seed1015_d2',
    0
);

SET @consulta_id := LAST_INSERT_ID();

INSERT INTO cotizaciones (
    paciente_id,
    usuario_id,
    total,
    total_pagado,
    saldo_pendiente,
    fecha,
    estado,
    version_actual,
    observaciones
) VALUES (
    @paciente_id,
    @usuario_id,
    0.00,
    0.00,
    0.00,
    CONCAT(@fecha_dia2, ' 09:21:00'),
    'pagado',
    1,
    @cot_obs
);

SET @cotizacion_id := LAST_INSERT_ID();

UPDATE cotizaciones
SET numero_comprobante = CONCAT('QSEED-D2-', @cotizacion_id)
WHERE id = @cotizacion_id;

INSERT INTO cotizaciones_detalle (
    cotizacion_id,
    servicio_tipo,
    servicio_id,
    descripcion,
    cantidad,
    precio_unitario,
    subtotal,
    estado_item,
    version_item,
    consulta_id,
    contrato_paciente_id,
    contrato_paciente_servicio_id,
    origen_cobro,
    monto_lista_referencial,
    medico_id,
    derivado
) VALUES (
    @cotizacion_id,
    'laboratorio',
    @lab_servicio_id,
    COALESCE(@titulo_lab, 'Laboratorio Dia 2'),
    1,
    0.00,
    0.00,
    'activo',
    1,
    @consulta_id,
    @contrato_id,
    @cps_lab_id,
    'contrato',
    0.00,
    @medico_id,
    0
);

SET @cot_det_lab_id := (
  SELECT id FROM cotizaciones_detalle
  WHERE cotizacion_id = @cotizacion_id
  ORDER BY id ASC LIMIT 1
);

INSERT INTO cotizacion_eventos (
    cotizacion_id,
    version,
    evento_tipo,
    usuario_id,
    motivo,
    payload_json,
    ip_origen
) VALUES (
    @cotizacion_id,
    1,
    'creada',
    @usuario_id,
    'Seed local Dia 2 con monto 0 por contrato',
    JSON_OBJECT('seed_tag', @seed_tag, 'dia', 2, 'contrato_paciente_id', @contrato_id),
    '127.0.0.1'
);

UPDATE agenda_contrato
SET
    consulta_id = @consulta_id,
    cotizacion_id_ejecucion = @cotizacion_id,
    estado_evento = 'atendido',
    ejecucion_estado = 'ejecutado',
    ejecutado_en = CONCAT(@fecha_dia2, ' 09:20:00'),
    updated_at = NOW()
WHERE id = @agenda_lab_id;

UPDATE contratos_paciente_servicios
SET cantidad_consumida = cantidad_consumida + 1,
    estado = CASE WHEN cantidad_consumida + 1 >= cantidad_total THEN 'agotado' ELSE 'en_uso' END,
    updated_at = NOW()
WHERE id = @cps_lab_id;

INSERT INTO contratos_consumos (
    contrato_paciente_id,
    contrato_paciente_servicio_id,
    paciente_id,
    cotizacion_id,
    cotizacion_detalle_id,
    consulta_id,
    fecha_consumo,
    cantidad_consumida,
    modo_cobertura,
    monto_cubierto,
    monto_cobrado_extra,
    usuario_id,
    observaciones
) VALUES (
    @contrato_id,
    @cps_lab_id,
    @paciente_id,
    @cotizacion_id,
    @cot_det_lab_id,
    @consulta_id,
    CONCAT(@fecha_dia2, ' 09:21:00'),
    1,
    'contrato',
    0.00,
    0.00,
    @usuario_id,
    CONCAT(@cot_obs, ' detalle laboratorio')
);

INSERT INTO historia_clinica (
    consulta_id,
    hc_parent_id,
    hc_root_id,
    chain_depth,
    datos,
    chain_status,
    contrato_paciente_id,
    agenda_contrato_id,
    updated_seq,
    fecha_registro
) VALUES (
    @consulta_id,
    @hc1_id,
    @hc1_id,
    1,
    JSON_OBJECT(
        'seed_tag', @seed_tag,
        'anamnesis', 'HC hija del Dia 2. Seguimiento con laboratorio.',
        'tratamiento', 'Control final al Dia 3.',
        'proxima_cita', JSON_OBJECT(
            'programar', true,
            'fecha', '2026-04-22',
            'hora', '09:00',
            'tipo_consulta', 'programada',
            'origen', 'seed_local_dia2'
        )
    ),
    'activa',
    @contrato_id,
    @agenda_lab_id,
    1,
    CONCAT(@fecha_dia2, ' 09:25:00')
);

SET @hc2_id := LAST_INSERT_ID();

INSERT INTO ordenes_laboratorio (
    consulta_id,
    paciente_id,
    examenes,
    historia_clinica_id,
    fecha,
    estado
) VALUES (
    @consulta_id,
    @paciente_id,
    JSON_ARRAY(@lab_servicio_id),
    @hc2_id,
    CONCAT(@fecha_dia2, ' 09:30:00'),
    'procesado'
);

SELECT
  @contrato_id AS contrato_paciente_id,
  @agenda_lab_id AS agenda_laboratorio_dia2,
  @cotizacion_id AS cotizacion_dia2,
  @consulta_id AS consulta_dia2,
  @hc1_id AS hc_padre_dia1,
  @hc2_id AS hc_dia2,
  @lab_servicio_id AS laboratorio_servicio_id;

COMMIT;
