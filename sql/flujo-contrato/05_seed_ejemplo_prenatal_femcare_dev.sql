-- 05_seed_ejemplo_prenatal_femcare_dev.sql
-- Seed idempotente para DEV basado en contrato prenatal FEMCARE.

START TRANSACTION;

SET @seed_marker := 'SEED_DEV_FEMCARE_2026';
SET @codigo_plantilla := 'CTR-PRENATAL-FEMCARE-DEV';
SET @hoy := CURDATE();
SET @fecha_inicio := @hoy;
SET @fecha_fin := DATE_ADD(@fecha_inicio, INTERVAL 270 DAY);

SET @paciente_id := COALESCE(
  (SELECT id FROM pacientes WHERE id = 1015 LIMIT 1),
  (SELECT id FROM pacientes ORDER BY id DESC LIMIT 1),
  1
);

-- Limpiar ejecuciones previas del seed.
DELETE FROM contratos_paciente
WHERE observaciones LIKE CONCAT('%', @seed_marker, '%');

DELETE FROM contratos_plantillas
WHERE codigo = @codigo_plantilla;

-- Crear plantilla principal.
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
  'Plan de Controles Prenatales - FEMCARE Salud Integral Femenina',
  CONCAT('Seed de desarrollo basado en contrato escaneado. ', @seed_marker),
  'activo',
  270,
  1500.00,
  1,
  7,
  1,
  1
);

SET @plantilla_id := LAST_INSERT_ID();

-- Resolver servicios reales desde catalogos de la BD dev.
SET @srv_consulta_prenatal := COALESCE(
  (SELECT t.id
   FROM tarifas t
   LEFT JOIN medicos m ON m.id = t.medico_id
   WHERE t.activo = 1
     AND LOWER(t.servicio_tipo) = 'consulta'
     AND (t.descripcion LIKE '%GINECO%' OR t.descripcion LIKE '%OBSTET%' OR m.especialidad LIKE '%GINECO%')
   ORDER BY t.id ASC
   LIMIT 1),
  (SELECT t.id FROM tarifas t WHERE t.activo = 1 AND LOWER(t.servicio_tipo) = 'consulta' ORDER BY t.id ASC LIMIT 1),
  1
);

SET @srv_ecografia_transvaginal := COALESCE(
  (SELECT t.id
   FROM tarifas t
   WHERE t.activo = 1
     AND LOWER(t.servicio_tipo) = 'ecografia'
     AND (t.descripcion LIKE '%transvag%' OR t.descripcion LIKE '%vaginal%')
   ORDER BY t.id ASC
   LIMIT 1),
  (SELECT t.id FROM tarifas t WHERE t.activo = 1 AND LOWER(t.servicio_tipo) = 'ecografia' ORDER BY t.id ASC LIMIT 1),
  1
);

SET @srv_ecografia_obstetrica := COALESCE(
  (SELECT t.id
   FROM tarifas t
   WHERE t.activo = 1
     AND LOWER(t.servicio_tipo) = 'ecografia'
     AND (t.descripcion LIKE '%obst%' OR t.descripcion LIKE '%2D%')
   ORDER BY t.id ASC
   LIMIT 1),
  (SELECT t.id FROM tarifas t WHERE t.activo = 1 AND LOWER(t.servicio_tipo) = 'ecografia' ORDER BY t.id ASC LIMIT 1),
  1
);

SET @srv_ecografia_especial := COALESCE(
  (SELECT t.id
   FROM tarifas t
   WHERE t.activo = 1
     AND LOWER(t.servicio_tipo) = 'ecografia'
     AND (t.descripcion LIKE '%doppler%' OR t.descripcion LIKE '%morf%' OR t.descripcion LIKE '%genet%')
   ORDER BY t.id ASC
   LIMIT 1),
  @srv_ecografia_obstetrica,
  1
);

SET @srv_procedimiento := COALESCE(
  (SELECT t.id FROM tarifas t WHERE t.activo = 1 AND LOWER(t.servicio_tipo) = 'procedimiento' ORDER BY t.id ASC LIMIT 1),
  @srv_consulta_prenatal,
  1
);

SET @srv_lab_perfil := COALESCE(
  (SELECT e.id FROM examenes_laboratorio e WHERE e.activo = 1 AND (e.nombre LIKE '%Perfil%' OR e.nombre LIKE '%Prenatal%') ORDER BY e.id ASC LIMIT 1),
  (SELECT e.id FROM examenes_laboratorio e WHERE e.activo = 1 ORDER BY e.id ASC LIMIT 1),
  1
);

SET @srv_lab_hepatitis := COALESCE(
  (SELECT e.id FROM examenes_laboratorio e WHERE e.activo = 1 AND (e.nombre LIKE '%Hepat%' OR e.nombre LIKE '%HBs%') ORDER BY e.id ASC LIMIT 1),
  @srv_lab_perfil,
  1
);

-- I. Ecografias
INSERT INTO contratos_plantillas_items (plantilla_id, servicio_tipo, servicio_id, descripcion_snapshot, cantidad_incluida, orden_programado, regla_uso, activo)
VALUES (@plantilla_id, 'ecografia', @srv_ecografia_transvaginal, '01 ecografia transvaginal (visibilidad fetal)', 1.00, 1, 'programado', 1);
SET @it_eco_trans := LAST_INSERT_ID();

INSERT INTO contratos_plantillas_items (plantilla_id, servicio_tipo, servicio_id, descripcion_snapshot, cantidad_incluida, orden_programado, regla_uso, activo)
VALUES (@plantilla_id, 'ecografia', @srv_ecografia_obstetrica, '05 ecografias obstetricas (2D)', 5.00, 2, 'programado', 1);
SET @it_eco_obst := LAST_INSERT_ID();

INSERT INTO contratos_plantillas_items (plantilla_id, servicio_tipo, servicio_id, descripcion_snapshot, cantidad_incluida, orden_programado, regla_uso, activo)
VALUES (@plantilla_id, 'ecografia', @srv_ecografia_especial, '03 ecografias especializadas (6D/Doppler)', 3.00, 3, 'programado', 1);
SET @it_eco_esp := LAST_INSERT_ID();

-- Perfil prenatal + Hepatitis B
INSERT INTO contratos_plantillas_items (plantilla_id, servicio_tipo, servicio_id, descripcion_snapshot, cantidad_incluida, orden_programado, regla_uso, activo)
VALUES (@plantilla_id, 'laboratorio', @srv_lab_perfil, '01 Perfil prenatal', 1.00, 4, 'programado', 1);
SET @it_lab_perfil := LAST_INSERT_ID();

INSERT INTO contratos_plantillas_items (plantilla_id, servicio_tipo, servicio_id, descripcion_snapshot, cantidad_incluida, orden_programado, regla_uso, activo)
VALUES (@plantilla_id, 'laboratorio', @srv_lab_hepatitis, '01 Hepatitis B (1er trimestre)', 1.00, 5, 'programado', 1);
SET @it_lab_hepb := LAST_INSERT_ID();

-- Consulta odontologica
INSERT INTO contratos_plantillas_items (plantilla_id, servicio_tipo, servicio_id, descripcion_snapshot, cantidad_incluida, orden_programado, regla_uso, activo)
VALUES (@plantilla_id, 'procedimiento', @srv_procedimiento, '01 Consulta odontologica', 1.00, 6, 'flexible', 1);
SET @it_odonto := LAST_INSERT_ID();

-- II. Controles prenatales
INSERT INTO contratos_plantillas_items (plantilla_id, servicio_tipo, servicio_id, descripcion_snapshot, cantidad_incluida, orden_programado, regla_uso, activo)
VALUES (@plantilla_id, 'consulta', @srv_consulta_prenatal, '10 consultas prenatales', 10.00, 7, 'programado', 1);
SET @it_ctrl_prenatal := LAST_INSERT_ID();

-- V. Programacion de controles (hitos gestacionales referenciales).
INSERT INTO contratos_plantillas_hitos (plantilla_item_id, nombre_hito, tipo_programacion, semana_min, semana_max, dia_relativo_inicio, obligatorio, orden, activo)
VALUES
(@it_eco_trans, 'Ecografia transvaginal (< 11 semanas)', 'rango_gestacional', 10, 11, NULL, 1, 1, 1),
(@it_eco_esp, 'Ecografia morfogenetica + doppler + 6D', 'rango_gestacional', 12, 13, NULL, 1, 2, 1),
(@it_eco_obst, 'Ecografia obstetrica control', 'rango_gestacional', 16, 16, NULL, 1, 3, 1),
(@it_eco_esp, 'Ecografia morfologica + doppler + 6D', 'rango_gestacional', 20, 20, NULL, 1, 4, 1),
(@it_eco_obst, 'Ecografia obstetrica control', 'rango_gestacional', 24, 24, NULL, 1, 5, 1),
(@it_eco_esp, 'Ecografia doppler fetal y materno + 6D', 'rango_gestacional', 28, 28, NULL, 1, 6, 1),
(@it_eco_obst, 'Ecografia obstetrica control', 'rango_gestacional', 32, 32, NULL, 1, 7, 1),
(@it_eco_obst, 'Ecografia obstetrica control', 'rango_gestacional', 35, 35, NULL, 1, 8, 1),
(@it_eco_obst, 'Ecografia obstetrica control', 'rango_gestacional', 37, 37, NULL, 1, 9, 1),
(@it_eco_obst, 'Ecografia obstetrica + evaluacion de pelvis', 'rango_gestacional', 38, 38, NULL, 1, 10, 1);

-- Crear contrato paciente de ejemplo en DEV.
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
  created_by,
  updated_by
)
VALUES (
  @paciente_id,
  @plantilla_id,
  @fecha_inicio,
  @fecha_fin,
  1500.00,
  1500.00,
  'activo',
  DATE_SUB(@fecha_fin, INTERVAL 7 DAY),
  CONCAT('Contrato de ejemplo cargado automaticamente. ', @seed_marker),
  1,
  1
);

SET @contrato_id := LAST_INSERT_ID();

-- Clonar cobertura de servicios al contrato.
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

-- Generar agenda segun hitos (semanas gestacionales convertidas en fecha objetivo).
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
  CONCAT('Agenda seed DEV. ', @seed_marker),
  1,
  1
FROM contratos_plantillas_hitos h
INNER JOIN contratos_plantillas_items i ON i.id = h.plantilla_item_id
WHERE i.plantilla_id = @plantilla_id
  AND h.activo = 1
ORDER BY h.orden ASC, h.id ASC;

-- Programar pago unico referencial.
INSERT INTO paciente_seguimiento_pagos (
  contrato_paciente_id,
  nro_cuota,
  fecha_programada,
  monto_programado,
  monto_pagado,
  fecha_pago,
  estado,
  metodo_pago,
  observaciones,
  created_by
)
VALUES (
  @contrato_id,
  1,
  DATE_SUB(@fecha_fin, INTERVAL 7 DAY),
  1500.00,
  0.00,
  NULL,
  'pendiente',
  'efectivo',
  CONCAT('Pago unico pendiente. ', @seed_marker),
  1
);

SELECT
  @plantilla_id AS plantilla_id_seed,
  @contrato_id AS contrato_id_seed,
  @paciente_id AS paciente_id_seed,
  @srv_consulta_prenatal AS servicio_consulta_id,
  @srv_ecografia_obstetrica AS servicio_ecografia_id,
  @srv_lab_perfil AS servicio_laboratorio_id;

COMMIT;
