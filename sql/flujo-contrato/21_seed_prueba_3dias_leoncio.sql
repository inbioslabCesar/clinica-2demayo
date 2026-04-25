-- 21_seed_prueba_3dias_leoncio.sql
-- Seed de prueba: simulacion de contrato 3 dias para LEONCIO PAUCARA OCSA (id=983)
-- Plantilla: CTR-1-PRUEBA-1 / CAMPAÑA 3 DIAS DE PRUEBA (id=2)
--
-- Flujo simulado:
--   Dia 1 (hace 2 dias): Consulta cardiologia (completada) + Ecografia abdominal
--                         HC guardada → cadena iniciada
--   Dia 2 (ayer):        Laboratorio glucosa (completada)
--                         HC guardada → hc_parent_id = HC dia 1
--   Dia 3 (hoy):         Consulta cardiologia (pendiente de atender)
--
-- Para limpiar y repetir: ejecutar 21_cleanup_prueba_3dias.sql
--
-- Prerequisito: scripts 18 y 20 ya ejecutados.

START TRANSACTION;

-- ============================================================
-- 1. CONTRATO PACIENTE
-- ============================================================

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
    983,                            -- LEONCIO PAUCARA OCSA
    2,                              -- CTR-1-PRUEBA-1
    DATE_SUB(CURDATE(), INTERVAL 2 DAY),
    CURDATE(),
    272.00,                         -- 80 + 100 + 12 + 80
    272.00,
    'activo',
    'fecha_inicio_tratamiento',
    DATE_SUB(CURDATE(), INTERVAL 2 DAY),
    'Seed de prueba 3 dias - generado automaticamente',
    NOW(),
    NOW()
);

SET @cp_id = LAST_INSERT_ID();

-- ============================================================
-- 2. AGENDA (4 items del contrato)
-- ============================================================

-- Item 18: Consulta cardiologia dia 1 (offset 0)
INSERT INTO agenda_contrato (
    contrato_paciente_id, plantilla_item_id, servicio_tipo, servicio_id,
    titulo_evento, fecha_programada, estado_evento, ejecucion_estado,
    created_at, updated_at
) VALUES (
    @cp_id, 18, 'consulta', 88,
    'CONSULTA CARDIOLOGIA - DIA 1',
    DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 2 DAY), '%Y-%m-%d 09:00:00'),
    'atendido', 'ejecutado',
    NOW(), NOW()
);
SET @ag1_id = LAST_INSERT_ID();

-- Item 19: Ecografia dia 1 (offset 0, mismo dia)
INSERT INTO agenda_contrato (
    contrato_paciente_id, plantilla_item_id, servicio_tipo, servicio_id,
    titulo_evento, fecha_programada, estado_evento, ejecucion_estado,
    created_at, updated_at
) VALUES (
    @cp_id, 19, 'ecografia', 221,
    'ECOGRAFIA ABDOMINAL COMPLETA - DIA 1',
    DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 2 DAY), '%Y-%m-%d 10:00:00'),
    'atendido', 'ejecutado',
    NOW(), NOW()
);
SET @ag2_id = LAST_INSERT_ID();

-- Item 20: Laboratorio glucosa dia 2 (offset 1)
INSERT INTO agenda_contrato (
    contrato_paciente_id, plantilla_item_id, servicio_tipo, servicio_id,
    titulo_evento, fecha_programada, estado_evento, ejecucion_estado,
    created_at, updated_at
) VALUES (
    @cp_id, 20, 'laboratorio', 2,
    'GLUCOSA - DIA 2',
    DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 DAY), '%Y-%m-%d 09:00:00'),
    'atendido', 'ejecutado',
    NOW(), NOW()
);
SET @ag3_id = LAST_INSERT_ID();

-- Item 21: Consulta cardiologia dia 3 (offset 2, hoy, pendiente)
INSERT INTO agenda_contrato (
    contrato_paciente_id, plantilla_item_id, servicio_tipo, servicio_id,
    titulo_evento, fecha_programada, estado_evento, ejecucion_estado,
    created_at, updated_at
) VALUES (
    @cp_id, 21, 'consulta', 88,
    'CONSULTA CARDIOLOGIA - DIA 3 (HOY)',
    DATE_FORMAT(CURDATE(), '%Y-%m-%d 09:00:00'),
    'pendiente', 'pendiente',
    NOW(), NOW()
);
SET @ag4_id = LAST_INSERT_ID();

-- ============================================================
-- 3. CONSULTA DIA 1 (completada - cardiologia)
-- ============================================================

INSERT INTO consultas (
    paciente_id, medico_id, fecha, hora,
    estado, tipo_consulta, origen_creacion, es_control
) VALUES (
    983, 19,
    DATE_SUB(CURDATE(), INTERVAL 2 DAY), '09:00:00',
    'completada', 'programada', 'agendada', 0
);
SET @c1_id = LAST_INSERT_ID();

-- Vincular agenda item consulta y ecografia a esta misma consulta
UPDATE agenda_contrato SET consulta_id = @c1_id, ejecutado_en = DATE_SUB(NOW(), INTERVAL 2 DAY)
WHERE id IN (@ag1_id, @ag2_id);

-- ============================================================
-- 4. HC DIA 1 (nodo raiz de la cadena)
-- ============================================================

INSERT INTO historia_clinica (
    consulta_id,
    datos,
    chain_status,
    contrato_paciente_id,
    agenda_contrato_id,
    updated_seq,
    fecha_registro
) VALUES (
    @c1_id,
    JSON_OBJECT(
        'anamnesis', 'Paciente refiere dolor precordial leve de 3 dias de evolucion. Niega disnea.',
        'diagnosticos', JSON_ARRAY(
            JSON_OBJECT('codigo','I25.1','nombre','Enfermedad aterosclerosa del corazon','tipo','presuntivo','observaciones','')
        ),
        'tratamiento', 'Reposo relativo. Dieta hiposodica. Control en 24h con resultados de glucosa.',
        'proxima_cita', JSON_OBJECT(
            'programar', true,
            'fecha', DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 DAY), '%Y-%m-%d'),
            'hora', '09:00',
            'tipo_consulta', 'programada',
            'origen', 'historia_clinica'
        )
    ),
    'activa',
    @cp_id,
    @ag1_id,
    1,
    DATE_SUB(NOW(), INTERVAL 2 DAY)
);
SET @hc1_id = LAST_INSERT_ID();

-- HC1 es raiz: hc_root_id = hc1_id, chain_depth = 0
UPDATE historia_clinica
SET hc_root_id = @hc1_id, chain_depth = 0, hc_parent_id = NULL
WHERE id = @hc1_id;

-- ============================================================
-- 5. ORDEN ECOGRAFIA DIA 1
-- ============================================================

INSERT INTO ordenes_imagen (
    consulta_id, paciente_id, tipo, indicaciones,
    estado, solicitado_por, historia_clinica_id,
    fecha
) VALUES (
    @c1_id, 983, 'ecografia',
    'Ecografia abdominal completa. Evaluar higado, vesicula y pancreas.',
    'pendiente', 19, @hc1_id,
    DATE_SUB(NOW(), INTERVAL 2 DAY)
);

-- ============================================================
-- 6. CONSULTA DIA 2 (completada - seguimiento laboratorio)
-- ============================================================

INSERT INTO consultas (
    paciente_id, medico_id, fecha, hora,
    estado, tipo_consulta, hc_origen_id, origen_creacion, es_control
) VALUES (
    983, 19,
    DATE_SUB(CURDATE(), INTERVAL 1 DAY), '09:00:00',
    'completada', 'programada', @hc1_id, 'hc_proxima', 0
);
SET @c2_id = LAST_INSERT_ID();

UPDATE agenda_contrato SET consulta_id = @c2_id, ejecutado_en = DATE_SUB(NOW(), INTERVAL 1 DAY)
WHERE id = @ag3_id;

-- ============================================================
-- 7. HC DIA 2 (nodo hijo, chain_depth=1)
-- ============================================================

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
    @c2_id,
    @hc1_id,
    @hc1_id,
    1,
    JSON_OBJECT(
        'anamnesis', 'Paciente acude a control. Refiere mejoria del dolor precordial. Trae resultados de glucosa.',
        'diagnosticos', JSON_ARRAY(
            JSON_OBJECT('codigo','I25.1','nombre','Enfermedad aterosclerosa del corazon','tipo','definitivo','observaciones','Glucosa en limite alto 105 mg/dL'),
            JSON_OBJECT('codigo','R73.09','nombre','Otras glucemias anormales','tipo','presuntivo','observaciones','')
        ),
        'tratamiento', 'Atorvastatina 20mg/noche. Dieta diabetica. Control final manana.',
        'proxima_cita', JSON_OBJECT(
            'programar', true,
            'fecha', DATE_FORMAT(CURDATE(), '%Y-%m-%d'),
            'hora', '09:00',
            'tipo_consulta', 'programada',
            'origen', 'historia_clinica'
        )
    ),
    'activa',
    @cp_id,
    @ag3_id,
    1,
    DATE_SUB(NOW(), INTERVAL 1 DAY)
);
SET @hc2_id = LAST_INSERT_ID();

-- ============================================================
-- 8. ORDEN LABORATORIO DIA 2
-- ============================================================

INSERT INTO ordenes_laboratorio (
    consulta_id, paciente_id, examenes,
    historia_clinica_id, fecha, estado
) VALUES (
    @c2_id, 983,
    JSON_ARRAY(2),  -- examen id=2: Glucosa
    @hc2_id,
    DATE_SUB(NOW(), INTERVAL 1 DAY),
    'procesado'
);

-- ============================================================
-- 9. CONSULTA DIA 3 (pendiente - para atender hoy)
-- ============================================================

INSERT INTO consultas (
    paciente_id, medico_id, fecha, hora,
    estado, tipo_consulta, hc_origen_id, origen_creacion, es_control
) VALUES (
    983, 19,
    CURDATE(), '09:00:00',
    'pendiente', 'programada', @hc2_id, 'hc_proxima', 0
);
SET @c3_id = LAST_INSERT_ID();

UPDATE agenda_contrato SET consulta_id = @c3_id
WHERE id = @ag4_id;

COMMIT;

-- ============================================================
-- Verificacion del seed
-- ============================================================

SELECT 'CONTRATO' AS objeto, @cp_id AS id, 'activo' AS estado
UNION ALL SELECT 'CONSULTA DIA 1', @c1_id, 'completada'
UNION ALL SELECT 'HC DIA 1 (raiz)',@hc1_id, 'chain_depth=0'
UNION ALL SELECT 'CONSULTA DIA 2', @c2_id, 'completada'
UNION ALL SELECT 'HC DIA 2 (hijo)', @hc2_id, 'chain_depth=1'
UNION ALL SELECT 'CONSULTA DIA 3 (HOY)', @c3_id, 'pendiente';

-- Cadena completa
SELECT
    h.id AS hc_id,
    h.chain_depth,
    h.hc_parent_id,
    h.hc_root_id,
    h.chain_status,
    h.contrato_paciente_id,
    c.fecha,
    c.estado AS estado_consulta
FROM historia_clinica h
INNER JOIN consultas c ON c.id = h.consulta_id
WHERE h.contrato_paciente_id = @cp_id
ORDER BY h.chain_depth;
