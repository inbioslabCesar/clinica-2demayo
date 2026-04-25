-- 22_seed_flujo_contrato_celeste.sql
-- Seed de prueba end-to-end para flujo de contratos con paciente CELESTE (HC00939).
--
-- Crea:
--   - contrato_paciente + servicios
--   - agenda_contrato
--   - una consulta atendida del contrato
--   - cotizacion completa (4 items)
--   - abono (cobro + seguimiento pago + ingreso diario)
--   - consumo de 1 servicio del contrato
--
-- Re-ejecutable: primero limpia datos previos del mismo seed_tag.

START TRANSACTION;

SET @seed_tag := 'SEED_FLUJO_CONTRATO_CELESTE_V1';
SET @usuario_id := 1;
SET @medico_id := 19;
SET @fecha_inicio := CURDATE();
SET @fecha_fin := DATE_ADD(@fecha_inicio, INTERVAL 2 DAY);

SET @paciente_id := (
    SELECT id
    FROM pacientes
    WHERE historia_clinica = 'HC00939'
    ORDER BY id DESC
    LIMIT 1
);

SET @plantilla_id := (
    SELECT id
    FROM contratos_plantillas
    WHERE codigo = 'CTR-1-PRUEBA-1' AND estado = 'activo'
    ORDER BY id DESC
    LIMIT 1
);

SET @caja_id := (
    SELECT id
    FROM cajas
    WHERE estado = 'abierta'
    ORDER BY id DESC
    LIMIT 1
);

SET @turno := (
    SELECT turno
    FROM cajas
    WHERE id = @caja_id
    LIMIT 1
);

-- Limpieza previa del mismo seed_tag (si existiera)
DELETE idr
FROM ingresos_diarios idr
WHERE BINARY idr.referencia_tabla = BINARY 'paciente_seguimiento_pagos'
    AND LOCATE(BINARY @seed_tag, BINARY idr.descripcion) > 0;

DELETE cm
FROM cotizacion_movimientos cm
INNER JOIN cotizaciones c ON c.id = cm.cotizacion_id
WHERE BINARY c.observaciones = BINARY @seed_tag;

DELETE ce
FROM cotizacion_eventos ce
INNER JOIN cotizaciones c ON c.id = ce.cotizacion_id
WHERE BINARY c.observaciones = BINARY @seed_tag;

DELETE cc
FROM contratos_consumos cc
WHERE BINARY cc.observaciones = BINARY @seed_tag;

DELETE psp
FROM paciente_seguimiento_pagos psp
INNER JOIN contratos_paciente cp ON cp.id = psp.contrato_paciente_id
WHERE BINARY cp.observaciones = BINARY @seed_tag;

DELETE cd
FROM cobros_detalle cd
INNER JOIN cobros cb ON cb.id = cd.cobro_id
WHERE BINARY cb.observaciones = BINARY @seed_tag;

DELETE cb
FROM cobros cb
WHERE BINARY cb.observaciones = BINARY @seed_tag;

DELETE cdet
FROM cotizaciones_detalle cdet
INNER JOIN cotizaciones c ON c.id = cdet.cotizacion_id
WHERE BINARY c.observaciones = BINARY @seed_tag;

DELETE c
FROM cotizaciones c
WHERE BINARY c.observaciones = BINARY @seed_tag;

DELETE tr
FROM triaje tr
INNER JOIN consultas q ON q.id = tr.consulta_id
WHERE BINARY q.origen_creacion = BINARY 'contrato_agenda'
  AND q.paciente_id = @paciente_id
    AND q.cobro_id IS NULL;

DELETE q
FROM consultas q
WHERE q.origen_creacion = 'contrato_agenda'
  AND q.paciente_id = @paciente_id
  AND q.es_control = 0
  AND q.hc_origen_id IS NULL;

DELETE ac
FROM agenda_contrato ac
INNER JOIN contratos_paciente cp ON cp.id = ac.contrato_paciente_id
WHERE BINARY cp.observaciones = BINARY @seed_tag;

DELETE cps
FROM contratos_paciente_servicios cps
INNER JOIN contratos_paciente cp ON cp.id = cps.contrato_paciente_id
WHERE BINARY cp.observaciones = BINARY @seed_tag;

DELETE cp
FROM contratos_paciente cp
WHERE BINARY cp.observaciones = BINARY @seed_tag;

-- Crear contrato paciente
INSERT INTO contratos_paciente (
    paciente_id,
    plantilla_id,
    fecha_inicio,
    fecha_fin,
    monto_total,
    saldo_pendiente,
    estado,
    fecha_limite_liquidacion,
    observaciones,
    anchor_tipo,
    anchor_fecha,
    created_by,
    updated_by
)
VALUES (
    @paciente_id,
    @plantilla_id,
    @fecha_inicio,
    @fecha_fin,
    850.00,
    850.00,
    'activo',
    DATE_ADD(@fecha_inicio, INTERVAL 7 DAY),
    @seed_tag,
    'ninguno',
    NULL,
    @usuario_id,
    @usuario_id
);

SET @contrato_paciente_id := LAST_INSERT_ID();

-- Crear servicios del contrato desde la plantilla
INSERT INTO contratos_paciente_servicios (
    contrato_paciente_id,
    plantilla_item_id,
    servicio_tipo,
    servicio_id,
    cantidad_total,
    cantidad_consumida,
    estado
)
SELECT
    @contrato_paciente_id,
    cpi.id,
    cpi.servicio_tipo,
    cpi.servicio_id,
    cpi.cantidad_incluida,
    0,
    'pendiente'
FROM contratos_plantillas_items cpi
WHERE cpi.plantilla_id = @plantilla_id
  AND cpi.activo = 1
ORDER BY cpi.orden_programado, cpi.id;

-- Crear agenda simple de 3 dias
INSERT INTO agenda_contrato (
    contrato_paciente_id,
    plantilla_hito_id,
    plantilla_item_id,
    servicio_tipo,
    servicio_id,
    titulo_evento,
    fecha_programada,
    estado_evento,
    tolerancia_desde,
    tolerancia_hasta,
    observaciones,
    created_by,
    updated_by
)
SELECT
    @contrato_paciente_id,
    NULL,
    cpi.id,
    cpi.servicio_tipo,
    cpi.servicio_id,
    CONCAT('Seed Celeste - ', cpi.descripcion_snapshot),
    CONCAT(
      DATE_FORMAT(
        DATE_ADD(
          @fecha_inicio,
          INTERVAL CASE
            WHEN cpi.orden_programado <= 2 THEN 0
            WHEN cpi.orden_programado = 3 THEN 1
            ELSE 2
          END DAY
        ),
        '%Y-%m-%d'
      ),
      ' 09:00:00'
    ),
    'pendiente',
    DATE_ADD(@fecha_inicio, INTERVAL -1 DAY),
    DATE_ADD(@fecha_fin, INTERVAL 1 DAY),
    @seed_tag,
    @usuario_id,
    @usuario_id
FROM contratos_plantillas_items cpi
WHERE cpi.plantilla_id = @plantilla_id
  AND cpi.activo = 1
ORDER BY cpi.orden_programado, cpi.id;

-- Seleccionar el primer servicio consulta del contrato
SET @cps_consulta_1 := (
    SELECT cps.id
    FROM contratos_paciente_servicios cps
    INNER JOIN contratos_plantillas_items cpi ON cpi.id = cps.plantilla_item_id
    WHERE cps.contrato_paciente_id = @contrato_paciente_id
      AND cpi.servicio_tipo = 'consulta'
    ORDER BY cpi.orden_programado, cpi.id
    LIMIT 1
);

SET @agenda_consulta_1 := (
    SELECT ac.id
    FROM agenda_contrato ac
    INNER JOIN contratos_paciente_servicios cps ON cps.contrato_paciente_id = ac.contrato_paciente_id
      AND cps.plantilla_item_id = ac.plantilla_item_id
    WHERE ac.contrato_paciente_id = @contrato_paciente_id
      AND cps.id = @cps_consulta_1
    ORDER BY ac.fecha_programada, ac.id
    LIMIT 1
);

-- Crear consulta atendida de contrato
INSERT INTO consultas (
    paciente_id,
    medico_id,
    fecha,
    hora,
    estado,
    tipo_consulta,
    clasificacion,
    triaje_realizado,
    origen_creacion,
    es_control
)
VALUES (
    @paciente_id,
    @medico_id,
    @fecha_inicio,
    '09:00:00',
    'completada',
    'programada',
    NULL,
    0,
    'contrato_agenda',
    0
);

SET @consulta_id := LAST_INSERT_ID();

UPDATE agenda_contrato
SET
    estado_evento = 'atendido',
    consulta_id = @consulta_id,
    ejecucion_estado = 'ejecutado',
    ejecutado_en = NOW(),
    ejecutado_por = @usuario_id,
    updated_by = @usuario_id,
    updated_at = NOW()
WHERE id = @agenda_consulta_1;

-- Crear cotizacion
INSERT INTO cotizaciones (
    numero_comprobante,
    paciente_id,
    usuario_id,
    total,
    total_pagado,
    saldo_pendiente,
    fecha,
    updated_at,
    estado,
    version_actual,
    observaciones
)
VALUES (
    CONCAT('COT-SEED-', DATE_FORMAT(NOW(), '%Y%m%d%H%i%s')),
    @paciente_id,
    @usuario_id,
    850.00,
    0.00,
    850.00,
    NOW(),
    NOW(),
    'pendiente',
    1,
    @seed_tag
);

SET @cotizacion_id := LAST_INSERT_ID();

SET @cps_eco := (
    SELECT cps.id
    FROM contratos_paciente_servicios cps
    INNER JOIN contratos_plantillas_items cpi ON cpi.id = cps.plantilla_item_id
    WHERE cps.contrato_paciente_id = @contrato_paciente_id
      AND cpi.servicio_tipo = 'ecografia'
    ORDER BY cpi.orden_programado, cpi.id
    LIMIT 1
);

SET @cps_lab := (
    SELECT cps.id
    FROM contratos_paciente_servicios cps
    INNER JOIN contratos_plantillas_items cpi ON cpi.id = cps.plantilla_item_id
    WHERE cps.contrato_paciente_id = @contrato_paciente_id
      AND cpi.servicio_tipo = 'laboratorio'
    ORDER BY cpi.orden_programado, cpi.id
    LIMIT 1
);

SET @cps_consulta_2 := (
    SELECT cps.id
    FROM contratos_paciente_servicios cps
    INNER JOIN contratos_plantillas_items cpi ON cpi.id = cps.plantilla_item_id
    WHERE cps.contrato_paciente_id = @contrato_paciente_id
      AND cpi.servicio_tipo = 'consulta'
      AND cps.id <> @cps_consulta_1
    ORDER BY cpi.orden_programado, cpi.id
    LIMIT 1
);

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
)
VALUES
(@cotizacion_id, 'consulta', 88, 'CARDIOLOGIA', 1, 250.00, 250.00, 'activo', 1, @consulta_id, @contrato_paciente_id, @cps_consulta_1, 'contrato', 250.00, @medico_id, 0),
(@cotizacion_id, 'ecografia', 221, 'ECOGRAFIA ABDOMINAL COMPLETA', 1, 200.00, 200.00, 'activo', 1, NULL, @contrato_paciente_id, @cps_eco, 'contrato', 200.00, NULL, 0),
(@cotizacion_id, 'laboratorio', 2, 'Glucosa', 1, 150.00, 150.00, 'activo', 1, NULL, @contrato_paciente_id, @cps_lab, 'contrato', 150.00, NULL, 0),
(@cotizacion_id, 'consulta', 88, 'CARDIOLOGIA (Control)', 1, 250.00, 250.00, 'activo', 1, NULL, @contrato_paciente_id, @cps_consulta_2, 'contrato', 250.00, @medico_id, 0);

SET @detalle_consulta_1 := (
    SELECT id
    FROM cotizaciones_detalle
    WHERE cotizacion_id = @cotizacion_id
      AND contrato_paciente_servicio_id = @cps_consulta_1
    ORDER BY id
    LIMIT 1
);

-- Registrar cobro parcial (abono)
INSERT INTO cobros (
    paciente_id,
    usuario_id,
    fecha_cobro,
    total,
    tipo_pago,
    estado,
    observaciones,
    turno
)
VALUES (
    @paciente_id,
    @usuario_id,
    NOW(),
    350.00,
    'efectivo',
    'pagado',
    @seed_tag,
    COALESCE(@turno, 'mañana')
);

SET @cobro_id := LAST_INSERT_ID();

INSERT INTO cobros_detalle (
    cobro_id,
    servicio_tipo,
    servicio_id,
    descripcion,
    cantidad,
    precio_unitario,
    subtotal
)
VALUES (
    @cobro_id,
    'otros',
    NULL,
    'Abono contrato - Seed Celeste',
    1,
    350.00,
    350.00
);

INSERT INTO paciente_seguimiento_pagos (
    contrato_paciente_id,
    nro_cuota,
    fecha_programada,
    monto_programado,
    monto_pagado,
    fecha_pago,
    estado,
    metodo_pago,
    cobro_id,
    observaciones,
    created_by
)
VALUES (
    @contrato_paciente_id,
    0,
    @fecha_inicio,
    350.00,
    350.00,
    NOW(),
    'pagado',
    'efectivo',
    @cobro_id,
    @seed_tag,
    @usuario_id
);

SET @seguimiento_pago_id := LAST_INSERT_ID();

INSERT INTO cotizacion_movimientos (
    cotizacion_id,
    cobro_id,
    tipo_movimiento,
    monto,
    saldo_anterior,
    saldo_nuevo,
    descripcion,
    usuario_id
)
VALUES (
    @cotizacion_id,
    @cobro_id,
    'abono',
    350.00,
    850.00,
    500.00,
    'Abono inicial de contrato (seed)',
    @usuario_id
);

UPDATE cotizaciones
SET
    total_pagado = 350.00,
    saldo_pendiente = 500.00,
    estado = 'pendiente',
    updated_at = NOW()
WHERE id = @cotizacion_id;

INSERT INTO cotizacion_eventos (
    cotizacion_id,
    version,
    evento_tipo,
    usuario_id,
    motivo,
    payload_json,
    ip_origen
)
VALUES
(
    @cotizacion_id,
    1,
    'creada',
    @usuario_id,
    'Creacion seed de flujo contratos',
    JSON_OBJECT('seed_tag', @seed_tag, 'paciente_id', @paciente_id, 'contrato_paciente_id', @contrato_paciente_id),
    '127.0.0.1'
),
(
    @cotizacion_id,
    1,
    'cobro_registrado',
    @usuario_id,
    'Abono parcial seed',
    JSON_OBJECT('cobro_id', @cobro_id, 'monto', 350.00, 'saldo', 500.00),
    '127.0.0.1'
);

-- Registrar ingreso diario en caja (contabilidad)
INSERT INTO ingresos_diarios (
    caja_id,
    tipo_ingreso,
    area,
    descripcion,
    monto,
    metodo_pago,
    referencia_id,
    referencia_tabla,
    paciente_id,
    paciente_nombre,
    fecha_hora,
    usuario_id,
    turno,
    cobrado_por
)
SELECT
    @caja_id,
    'contrato_abono',
    'contratos',
    CONCAT('Abono contrato seed - ', @seed_tag),
    350.00,
    'efectivo',
    @seguimiento_pago_id,
    'paciente_seguimiento_pagos',
    p.id,
    CONCAT(p.nombre, ' ', p.apellido),
    NOW(),
    @usuario_id,
    COALESCE(@turno, 'mañana'),
    @usuario_id
FROM pacientes p
WHERE p.id = @paciente_id;

-- Registrar consumo de 1 servicio del contrato (consulta ya atendida)
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
)
VALUES (
    @contrato_paciente_id,
    @cps_consulta_1,
    @paciente_id,
    @cotizacion_id,
    @detalle_consulta_1,
    @consulta_id,
    NOW(),
    1,
    'contrato',
    250.00,
    0.00,
    @usuario_id,
    @seed_tag
);

UPDATE contratos_paciente_servicios
SET
    cantidad_consumida = 1,
    estado = CASE WHEN cantidad_total <= 1 THEN 'agotado' ELSE 'en_uso' END,
    updated_at = NOW()
WHERE id = @cps_consulta_1;

UPDATE consultas
SET cobro_id = @cobro_id
WHERE id = @consulta_id;

UPDATE agenda_contrato
SET cotizacion_id_ejecucion = @cotizacion_id
WHERE id = @agenda_consulta_1;

COMMIT;

-- Resumen seed
SELECT
  @seed_tag AS seed_tag,
  @paciente_id AS paciente_id,
  @contrato_paciente_id AS contrato_paciente_id,
  @cotizacion_id AS cotizacion_id,
  @cobro_id AS cobro_id,
  @seguimiento_pago_id AS seguimiento_pago_id,
  @consulta_id AS consulta_id;
