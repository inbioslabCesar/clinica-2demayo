-- 14_seed_contratos_inteligentes_prenatal_dev.sql
-- Seed idempotente DEV para probar contratos inteligentes (sub-servicios + snapshot agenda).

START TRANSACTION;

SET @seed_marker := 'SEED_INTELIGENTE_DEV_2026';
SET @codigo_plantilla := 'CTR-INTEL-PRENATAL-DEV';
SET @hoy := CURDATE();
SET @fecha_inicio := @hoy;
SET @fecha_fin := DATE_ADD(@fecha_inicio, INTERVAL 120 DAY);

SET @paciente_id := COALESCE(
  (SELECT id FROM pacientes WHERE id = 1015 LIMIT 1),
  (SELECT id FROM pacientes ORDER BY id DESC LIMIT 1),
  1
);

-- Resolver servicios en catalogo dev.
SET @srv_consulta := COALESCE(
  (SELECT t.id FROM tarifas t WHERE t.activo = 1 AND LOWER(t.servicio_tipo) = 'consulta' ORDER BY t.id ASC LIMIT 1),
  1
);

SET @srv_ecografia := COALESCE(
  (SELECT t.id FROM tarifas t WHERE t.activo = 1 AND LOWER(t.servicio_tipo) = 'ecografia' ORDER BY t.id ASC LIMIT 1),
  @srv_consulta,
  1
);

SET @srv_laboratorio := COALESCE(
  (SELECT e.id FROM examenes_laboratorio e WHERE e.activo = 1 ORDER BY e.id ASC LIMIT 1),
  1
);

SET @srv_procedimiento := COALESCE(
  (SELECT t.id FROM tarifas t WHERE t.activo = 1 AND LOWER(t.servicio_tipo) = 'procedimiento' ORDER BY t.id ASC LIMIT 1),
  @srv_consulta,
  1
);

-- Limpiar seed previo: primero contratos dependientes y luego plantilla por codigo.
DELETE FROM contratos_paciente
WHERE observaciones LIKE CONCAT('%', @seed_marker, '%');

DELETE FROM contratos_plantillas
WHERE codigo = @codigo_plantilla;

-- Plantilla.
INSERT INTO contratos_plantillas (
  codigo,
  nombre,
  descripcion,
  estado,
  duracion_dias,
  pago_unico_monto,
  requiere_liquidacion_anticipada,
  dias_anticipacion_liquidacion,
  created_by,
  updated_by
)
VALUES (
  @codigo_plantilla,
  'Plan Inteligente Prenatal DEV',
  CONCAT('Seed de contratos inteligentes para pruebas. ', @seed_marker),
  'activo',
  120,
  850.00,
  1,
  7,
  1,
  1
);

SET @plantilla_id := LAST_INSERT_ID();

-- Item principal 1: consulta de control (con sub-servicios).
INSERT INTO contratos_plantillas_items (
  plantilla_id,
  servicio_tipo,
  servicio_id,
  descripcion_snapshot,
  cantidad_incluida,
  orden_programado,
  regla_uso,
  offset_tipo,
  offset_valor,
  offset_unidad,
  activo
)
VALUES (
  @plantilla_id,
  'consulta',
  @srv_consulta,
  'Consulta control prenatal inteligente #1',
  1.00,
  1,
  'programado',
  'relativo_anchor',
  8,
  'semanas',
  1
);

SET @it_consulta_1 := LAST_INSERT_ID();

-- Item principal 2: consulta de control 2.
INSERT INTO contratos_plantillas_items (
  plantilla_id,
  servicio_tipo,
  servicio_id,
  descripcion_snapshot,
  cantidad_incluida,
  orden_programado,
  regla_uso,
  offset_tipo,
  offset_valor,
  offset_unidad,
  activo
)
VALUES (
  @plantilla_id,
  'consulta',
  @srv_consulta,
  'Consulta control prenatal inteligente #2',
  1.00,
  2,
  'programado',
  'relativo_anchor',
  16,
  'semanas',
  1
);

SET @it_consulta_2 := LAST_INSERT_ID();

-- Cobertura principal en contrato_paciente_servicios se basa en items de plantilla.
-- Los sub-servicios se definen aparte y se inyectan al ejecutar agenda.

-- Sub-servicios para consulta #1.
INSERT INTO contratos_plantillas_evento_subservicios (
  plantilla_item_id,
  servicio_tipo,
  servicio_id,
  descripcion_snapshot,
  cantidad,
  orden_inyeccion,
  origen_cobro_default,
  requiere_orden,
  laboratorio_referencia,
  estado
)
VALUES
(@it_consulta_1, 'laboratorio', @srv_laboratorio, 'Laboratorio de apoyo consulta #1', 1.00, 1, 'contrato', 1, 1, 'activo'),
(@it_consulta_1, 'ecografia', @srv_ecografia, 'Ecografia de apoyo consulta #1', 1.00, 2, 'contrato', 1, 0, 'activo');

-- Sub-servicios para consulta #2 (incluye extra potencial).
INSERT INTO contratos_plantillas_evento_subservicios (
  plantilla_item_id,
  servicio_tipo,
  servicio_id,
  descripcion_snapshot,
  cantidad,
  orden_inyeccion,
  origen_cobro_default,
  requiere_orden,
  laboratorio_referencia,
  estado
)
VALUES
(@it_consulta_2, 'laboratorio', @srv_laboratorio, 'Laboratorio de apoyo consulta #2', 1.00, 1, 'contrato', 1, 1, 'activo'),
(@it_consulta_2, 'procedimiento', @srv_procedimiento, 'Procedimiento complementario #2', 1.00, 2, 'extra', 0, 0, 'activo');

-- Hitos de agenda para los items principales.
INSERT INTO contratos_plantillas_hitos (
  plantilla_item_id,
  nombre_hito,
  tipo_programacion,
  semana_min,
  semana_max,
  obligatorio,
  orden,
  activo
)
VALUES
(@it_consulta_1, 'Control prenatal inteligente semana 8', 'rango_gestacional', 8, 8, 1, 1, 1),
(@it_consulta_2, 'Control prenatal inteligente semana 16', 'rango_gestacional', 16, 16, 1, 2, 1);

-- Contrato paciente.
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
  DATE_SUB(@fecha_fin, INTERVAL 7 DAY),
  CONCAT('Contrato inteligente seed dev. ', @seed_marker),
  'fur',
  @fecha_inicio,
  1,
  1
);

SET @contrato_id := LAST_INSERT_ID();

-- Cobertura del contrato en base a items principales.
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
  cpi.cantidad_incluida,
  0,
  'pendiente'
FROM contratos_plantillas_items cpi
WHERE cpi.plantilla_id = @plantilla_id
  AND cpi.activo = 1;

-- Generar agenda.
INSERT INTO agenda_contrato (
  contrato_paciente_id,
  plantilla_hito_id,
  plantilla_item_id,
  servicio_tipo,
  servicio_id,
  titulo_evento,
  fecha_programada,
  estado_evento,
  semana_gestacional_objetivo,
  tolerancia_desde,
  tolerancia_hasta,
  observaciones,
  created_by,
  updated_by
)
SELECT
  @contrato_id,
  h.id,
  i.id,
  i.servicio_tipo,
  i.servicio_id,
  h.nombre_hito,
  DATE_ADD(CONCAT(@fecha_inicio, ' 09:00:00'), INTERVAL COALESCE(h.semana_min, 0) * 7 DAY),
  'pendiente',
  h.semana_min,
  DATE_ADD(@fecha_inicio, INTERVAL COALESCE(h.semana_min, 0) * 7 DAY),
  DATE_ADD(@fecha_inicio, INTERVAL COALESCE(h.semana_max, h.semana_min, 0) * 7 DAY),
  CONCAT('Agenda inteligente seed dev. ', @seed_marker),
  1,
  1
FROM contratos_plantillas_hitos h
INNER JOIN contratos_plantillas_items i ON i.id = h.plantilla_item_id
WHERE i.plantilla_id = @plantilla_id
  AND h.activo = 1
ORDER BY h.orden ASC, h.id ASC;

-- Snapshot inicial de sub-servicios por evento (recomendado para evitar drift).
INSERT INTO agenda_contrato_subservicios_snapshot (
  agenda_evento_id,
  plantilla_subservicio_id,
  servicio_tipo,
  servicio_id,
  descripcion_snapshot,
  cantidad,
  orden_inyeccion,
  origen_cobro_default,
  requiere_orden,
  laboratorio_referencia,
  tipo_derivacion,
  valor_derivacion
)
SELECT
  a.id,
  s.id,
  s.servicio_tipo,
  s.servicio_id,
  s.descripcion_snapshot,
  s.cantidad,
  s.orden_inyeccion,
  s.origen_cobro_default,
  s.requiere_orden,
  s.laboratorio_referencia,
  s.tipo_derivacion,
  s.valor_derivacion
FROM agenda_contrato a
INNER JOIN contratos_plantillas_evento_subservicios s ON s.plantilla_item_id = a.plantilla_item_id
WHERE a.contrato_paciente_id = @contrato_id;

SELECT
  @plantilla_id AS plantilla_id_seed,
  @contrato_id AS contrato_id_seed,
  @paciente_id AS paciente_id_seed,
  (SELECT COUNT(*) FROM contratos_plantillas_evento_subservicios WHERE plantilla_item_id IN (@it_consulta_1, @it_consulta_2)) AS total_subservicios,
  (SELECT COUNT(*) FROM agenda_contrato WHERE contrato_paciente_id = @contrato_id) AS total_eventos,
  (SELECT COUNT(*) FROM agenda_contrato_subservicios_snapshot snap INNER JOIN agenda_contrato ag ON ag.id = snap.agenda_evento_id WHERE ag.contrato_paciente_id = @contrato_id) AS total_snapshots;

COMMIT;
