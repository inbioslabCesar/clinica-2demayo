-- 28_simular_dia1_consulta_ecografia_1015.sql
-- Simula Dia 1:
-- - crea consulta base
-- - vincula consulta + ecografia del mismo dia a la misma consulta
-- - crea HC raiz
-- - crea orden de imagen

START TRANSACTION;

SET @seed_tag := 'SEED_LOCAL_CONTRATO_1015_3DIAS_V1';
SET @paciente_id := 1015;
SET @medico_id := 19;
SET @usuario_id := 1;
SET @fecha_dia1 := DATE('2026-04-20');
SET @hora_consulta := '09:00:00';
SET @cot_obs := CONCAT(@seed_tag, ' DIA1');

SET @contrato_id := (
  SELECT id
  FROM contratos_paciente
  WHERE paciente_id = @paciente_id
    AND BINARY observaciones = BINARY @seed_tag
  ORDER BY id DESC
  LIMIT 1
);

SET @agenda_consulta_id := (
  SELECT ac.id
  FROM agenda_contrato ac
  WHERE ac.contrato_paciente_id = @contrato_id
    AND DATE(ac.fecha_programada) = @fecha_dia1
    AND LOWER(TRIM(ac.servicio_tipo)) = 'consulta'
  ORDER BY ac.fecha_programada ASC, ac.id ASC
  LIMIT 1
);

SET @agenda_ecografia_id := (
  SELECT ac.id
  FROM agenda_contrato ac
  WHERE ac.contrato_paciente_id = @contrato_id
    AND DATE(ac.fecha_programada) = @fecha_dia1
    AND LOWER(TRIM(ac.servicio_tipo)) = 'ecografia'
  ORDER BY ac.fecha_programada ASC, ac.id ASC
  LIMIT 1
);

SET @plantilla_item_consulta_id := (
  SELECT plantilla_item_id FROM agenda_contrato WHERE id = @agenda_consulta_id LIMIT 1
);
SET @plantilla_item_ecografia_id := (
  SELECT plantilla_item_id FROM agenda_contrato WHERE id = @agenda_ecografia_id LIMIT 1
);
SET @servicio_id_consulta := (
  SELECT servicio_id FROM agenda_contrato WHERE id = @agenda_consulta_id LIMIT 1
);
SET @servicio_id_ecografia := (
  SELECT servicio_id FROM agenda_contrato WHERE id = @agenda_ecografia_id LIMIT 1
);
SET @titulo_consulta := (
  SELECT titulo_evento FROM agenda_contrato WHERE id = @agenda_consulta_id LIMIT 1
);
SET @titulo_ecografia := (
  SELECT titulo_evento FROM agenda_contrato WHERE id = @agenda_ecografia_id LIMIT 1
);
SET @cps_consulta_id := (
  SELECT id
  FROM contratos_paciente_servicios
  WHERE contrato_paciente_id = @contrato_id
    AND plantilla_item_id = @plantilla_item_consulta_id
  ORDER BY id DESC
  LIMIT 1
);
SET @cps_ecografia_id := (
  SELECT id
  FROM contratos_paciente_servicios
  WHERE contrato_paciente_id = @contrato_id
    AND plantilla_item_id = @plantilla_item_ecografia_id
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
    origen_creacion,
    es_control
) VALUES (
    @paciente_id,
    @medico_id,
    @fecha_dia1,
    @hora_consulta,
    'completada',
    'programada',
    'seed1015_d1',
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
    CONCAT(@fecha_dia1, ' 09:31:00'),
    'pagado',
    1,
    @cot_obs
);

SET @cotizacion_id := LAST_INSERT_ID();

UPDATE cotizaciones
SET numero_comprobante = CONCAT('QSEED-D1-', @cotizacion_id)
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
) VALUES
(
    @cotizacion_id,
    'consulta',
    @servicio_id_consulta,
    COALESCE(@titulo_consulta, 'Consulta Dia 1'),
    1,
    0.00,
    0.00,
    'activo',
    1,
    @consulta_id,
    @contrato_id,
    @cps_consulta_id,
    'contrato',
    0.00,
    @medico_id,
    0
),
(
    @cotizacion_id,
    'ecografia',
    @servicio_id_ecografia,
    COALESCE(@titulo_ecografia, 'Ecografia Dia 1'),
    1,
    0.00,
    0.00,
    'activo',
    1,
    @consulta_id,
    @contrato_id,
    @cps_ecografia_id,
    'contrato',
    0.00,
    @medico_id,
    0
);

SET @cot_det_consulta_id := (
  SELECT id FROM cotizaciones_detalle
  WHERE cotizacion_id = @cotizacion_id AND servicio_tipo = 'consulta'
  ORDER BY id ASC LIMIT 1
);
SET @cot_det_ecografia_id := (
  SELECT id FROM cotizaciones_detalle
  WHERE cotizacion_id = @cotizacion_id AND servicio_tipo = 'ecografia'
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
    'Seed local Dia 1 con monto 0 por contrato',
    JSON_OBJECT('seed_tag', @seed_tag, 'dia', 1, 'contrato_paciente_id', @contrato_id),
    '127.0.0.1'
);

UPDATE agenda_contrato
SET
    consulta_id = @consulta_id,
    cotizacion_id_ejecucion = @cotizacion_id,
    estado_evento = 'atendido',
    ejecucion_estado = 'ejecutado',
    ejecutado_en = CONCAT(@fecha_dia1, ' 09:30:00'),
    updated_at = NOW()
WHERE id IN (@agenda_consulta_id, @agenda_ecografia_id);

UPDATE contratos_paciente_servicios
SET cantidad_consumida = cantidad_consumida + 1,
    estado = CASE WHEN cantidad_consumida + 1 >= cantidad_total THEN 'agotado' ELSE 'en_uso' END,
    updated_at = NOW()
WHERE id IN (@cps_consulta_id, @cps_ecografia_id);

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
) VALUES
(
    @contrato_id,
    @cps_consulta_id,
    @paciente_id,
    @cotizacion_id,
    @cot_det_consulta_id,
    @consulta_id,
    CONCAT(@fecha_dia1, ' 09:31:00'),
    1,
    'contrato',
    0.00,
    0.00,
    @usuario_id,
    CONCAT(@cot_obs, ' detalle consulta')
),
(
    @contrato_id,
    @cps_ecografia_id,
    @paciente_id,
    @cotizacion_id,
    @cot_det_ecografia_id,
    @consulta_id,
    CONCAT(@fecha_dia1, ' 09:31:00'),
    1,
    'contrato',
    0.00,
    0.00,
    @usuario_id,
    CONCAT(@cot_obs, ' detalle ecografia')
);

INSERT INTO historia_clinica (
    consulta_id,
    datos,
    chain_status,
    contrato_paciente_id,
    agenda_contrato_id,
    updated_seq,
    fecha_registro
) VALUES (
    @consulta_id,
    JSON_OBJECT(
        'seed_tag', @seed_tag,
        'anamnesis', 'HC raiz del seed local Dia 1. Consulta y ecografia del mismo dia.',
        'tratamiento', 'Continuar con control y laboratorio en Dia 2.',
        'proxima_cita', JSON_OBJECT(
            'programar', true,
            'fecha', '2026-04-21',
            'hora', '09:00',
            'tipo_consulta', 'programada',
            'origen', 'seed_local_dia1'
        )
    ),
    'activa',
    @contrato_id,
    @agenda_consulta_id,
    1,
    CONCAT(@fecha_dia1, ' 09:35:00')
);

SET @hc1_id := LAST_INSERT_ID();

UPDATE historia_clinica
SET hc_root_id = @hc1_id,
    chain_depth = 0,
    hc_parent_id = NULL
WHERE id = @hc1_id;

INSERT INTO ordenes_imagen (
    consulta_id,
    paciente_id,
    tipo,
    indicaciones,
    estado,
    solicitado_por,
    historia_clinica_id,
    fecha
) VALUES (
    @consulta_id,
    @paciente_id,
    'ecografia',
    'Seed local Dia 1: ecografia abdominal completa ligada a la HC raiz.',
    'pendiente',
    @medico_id,
    @hc1_id,
    CONCAT(@fecha_dia1, ' 10:00:00')
);

SELECT
  @contrato_id AS contrato_paciente_id,
  @agenda_consulta_id AS agenda_consulta_dia1,
  @agenda_ecografia_id AS agenda_ecografia_dia1,
  @cotizacion_id AS cotizacion_dia1,
  @consulta_id AS consulta_dia1,
  @hc1_id AS hc_dia1;

COMMIT;
