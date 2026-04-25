-- 27_setup_seed_local_contrato_1015_3dias.sql
-- Setup local para pruebas del flujo de contrato 3 dias en paciente 1015.
-- Crea contrato_paciente, contratos_paciente_servicios y agenda_contrato.
-- No crea consultas ni HC: eso lo hacen los scripts de simulacion por dia.

START TRANSACTION;

SET @seed_tag := 'SEED_LOCAL_CONTRATO_1015_3DIAS_V1';
SET @paciente_id := 1015;
SET @historia_clinica := 'HC00939';
SET @plantilla_codigo := 'CTR-1-PRUEBA-1';
SET @fecha_dia1 := DATE('2026-04-20');
SET @fecha_dia2 := DATE('2026-04-21');
SET @fecha_dia3 := DATE('2026-04-22');

SET @paciente_ok := (
  SELECT id
  FROM pacientes
  WHERE id = @paciente_id
    AND BINARY historia_clinica = BINARY @historia_clinica
  LIMIT 1
);

SET @plantilla_id := (
  SELECT id
  FROM contratos_plantillas
  WHERE BINARY codigo = BINARY @plantilla_codigo
  ORDER BY id DESC
  LIMIT 1
);

DELETE acm
FROM agenda_contrato_medicos acm
INNER JOIN agenda_contrato ac ON ac.id = acm.agenda_contrato_id
INNER JOIN contratos_paciente cp ON cp.id = ac.contrato_paciente_id
WHERE BINARY cp.observaciones = BINARY @seed_tag;

DELETE acss
FROM agenda_contrato_subservicios_snapshot acss
INNER JOIN agenda_contrato ac ON ac.id = acss.agenda_evento_id
INNER JOIN contratos_paciente cp ON cp.id = ac.contrato_paciente_id
WHERE BINARY cp.observaciones = BINARY @seed_tag;

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

INSERT INTO contratos_paciente (
    paciente_id,
    plantilla_id,
    fecha_inicio,
    fecha_fin,
    monto_total,
    saldo_pendiente,
    estado,
    anchor_tipo,
    anchor_fecha,
    observaciones,
    created_at,
    updated_at
) VALUES (
    @paciente_id,
    @plantilla_id,
    @fecha_dia1,
    @fecha_dia3,
    100.00,
    100.00,
    'activo',
    'fecha_inicio_tratamiento',
    @fecha_dia1,
    @seed_tag,
    NOW(),
    NOW()
);

SET @contrato_id := LAST_INSERT_ID();

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
    @contrato_id,
    cpi.id,
    cpi.servicio_tipo,
    cpi.servicio_id,
    COALESCE(cpi.cantidad_incluida, 1),
    0,
    'pendiente'
FROM contratos_plantillas_items cpi
WHERE cpi.plantilla_id = @plantilla_id
  AND COALESCE(cpi.activo, 1) = 1
ORDER BY COALESCE(cpi.offset_valor, 0), cpi.id;

INSERT INTO agenda_contrato (
    contrato_paciente_id,
    plantilla_hito_id,
    plantilla_item_id,
    servicio_tipo,
    servicio_id,
    titulo_evento,
    fecha_programada,
    estado_evento,
    ejecucion_estado,
    observaciones,
    created_at,
    updated_at
)
SELECT
    @contrato_id,
    NULL,
    cpi.id,
    cpi.servicio_tipo,
    cpi.servicio_id,
    CONCAT('Seed Local 1015 - ', cpi.descripcion_snapshot),
    CONCAT(
      DATE_FORMAT(
        DATE_ADD(@fecha_dia1, INTERVAL COALESCE(cpi.offset_valor, 0) DAY),
        '%Y-%m-%d'
      ),
      CASE
        WHEN LOWER(TRIM(cpi.servicio_tipo)) = 'consulta' THEN ' 09:00:00'
        WHEN LOWER(TRIM(cpi.servicio_tipo)) = 'ecografia' THEN ' 10:00:00'
        ELSE ' 09:00:00'
      END
    ),
    'pendiente',
    'pendiente',
    @seed_tag,
    NOW(),
    NOW()
FROM contratos_plantillas_items cpi
WHERE cpi.plantilla_id = @plantilla_id
  AND COALESCE(cpi.activo, 1) = 1
ORDER BY COALESCE(cpi.offset_valor, 0), cpi.id;

SELECT
  DATABASE() AS bd_actual,
  @seed_tag AS seed_tag,
  @paciente_ok AS paciente_validado,
  @plantilla_id AS plantilla_id,
  @contrato_id AS contrato_paciente_id,
  (SELECT COUNT(*) FROM contratos_paciente_servicios WHERE contrato_paciente_id = @contrato_id) AS servicios_creados,
  (SELECT COUNT(*) FROM agenda_contrato WHERE contrato_paciente_id = @contrato_id) AS agenda_creada;

SELECT
  ac.id AS agenda_id,
  ac.plantilla_item_id,
  ac.servicio_tipo,
  ac.servicio_id,
  ac.fecha_programada,
  ac.estado_evento,
  ac.ejecucion_estado
FROM agenda_contrato ac
WHERE ac.contrato_paciente_id = @contrato_id
ORDER BY ac.fecha_programada ASC, ac.id ASC;

COMMIT;
