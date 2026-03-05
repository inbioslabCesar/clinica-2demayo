SET NAMES utf8mb4;

START TRANSACTION;

-- ==========================================
-- DEMO: INVENTARIO GENERAL (5 ítems)
-- ==========================================

INSERT IGNORE INTO inventario_items
(codigo, nombre, categoria, marca, presentacion, factor_presentacion, unidad_medida, controla_stock, stock_minimo, stock_critico, activo, created_at)
VALUES
('DEMO-INV-001', 'Reactivo Glucosa Enzimática', 'reactivo', 'BioDemo', 'Frasco 500 ml', 1.0000, 'ml', 1, 100, 50, 1, NOW()),
('DEMO-INV-002', 'Reactivo Colesterol Total', 'reactivo', 'BioDemo', 'Kit 250 pruebas', 1.0000, 'prueba', 1, 50, 25, 1, NOW()),
('DEMO-INV-003', 'Puntas de Micropipeta 200ul', 'insumo', 'LabSupply', 'Bolsa x1000', 1.0000, 'unidad', 1, 300, 100, 1, NOW()),
('DEMO-INV-004', 'Tubo Vacutainer Rojo', 'material', 'VacuLab', 'Caja x100', 1.0000, 'unidad', 1, 200, 80, 1, NOW()),
('DEMO-INV-005', 'Guantes Nitrilo M', 'insumo', 'SafeHands', 'Caja x100', 1.0000, 'unidad', 1, 200, 80, 1, NOW());

INSERT INTO inventario_lotes (item_id, lote_codigo, fecha_vencimiento, cantidad_inicial, cantidad_actual, created_at)
SELECT i.id, 'DEMO-L001', DATE_ADD(CURDATE(), INTERVAL 180 DAY), 500, 500, NOW()
FROM inventario_items i
WHERE i.codigo = 'DEMO-INV-001'
  AND NOT EXISTS (
    SELECT 1 FROM inventario_lotes l WHERE l.item_id = i.id AND l.lote_codigo = 'DEMO-L001'
  );

INSERT INTO inventario_lotes (item_id, lote_codigo, fecha_vencimiento, cantidad_inicial, cantidad_actual, created_at)
SELECT i.id, 'DEMO-L002', DATE_ADD(CURDATE(), INTERVAL 150 DAY), 250, 250, NOW()
FROM inventario_items i
WHERE i.codigo = 'DEMO-INV-002'
  AND NOT EXISTS (
    SELECT 1 FROM inventario_lotes l WHERE l.item_id = i.id AND l.lote_codigo = 'DEMO-L002'
  );

INSERT INTO inventario_lotes (item_id, lote_codigo, fecha_vencimiento, cantidad_inicial, cantidad_actual, created_at)
SELECT i.id, 'DEMO-L003', DATE_ADD(CURDATE(), INTERVAL 365 DAY), 1000, 1000, NOW()
FROM inventario_items i
WHERE i.codigo = 'DEMO-INV-003'
  AND NOT EXISTS (
    SELECT 1 FROM inventario_lotes l WHERE l.item_id = i.id AND l.lote_codigo = 'DEMO-L003'
  );

INSERT INTO inventario_lotes (item_id, lote_codigo, fecha_vencimiento, cantidad_inicial, cantidad_actual, created_at)
SELECT i.id, 'DEMO-L004', DATE_ADD(CURDATE(), INTERVAL 365 DAY), 100, 100, NOW()
FROM inventario_items i
WHERE i.codigo = 'DEMO-INV-004'
  AND NOT EXISTS (
    SELECT 1 FROM inventario_lotes l WHERE l.item_id = i.id AND l.lote_codigo = 'DEMO-L004'
  );

INSERT INTO inventario_lotes (item_id, lote_codigo, fecha_vencimiento, cantidad_inicial, cantidad_actual, created_at)
SELECT i.id, 'DEMO-L005', DATE_ADD(CURDATE(), INTERVAL 365 DAY), 100, 100, NOW()
FROM inventario_items i
WHERE i.codigo = 'DEMO-INV-005'
  AND NOT EXISTS (
    SELECT 1 FROM inventario_lotes l WHERE l.item_id = i.id AND l.lote_codigo = 'DEMO-L005'
  );

INSERT INTO inventario_movimientos (item_id, lote_id, tipo, cantidad, observacion, origen, usuario_id, fecha_hora)
SELECT i.id, l.id, 'entrada', l.cantidad_inicial, 'Carga demo inicial', 'inventario', NULL, NOW()
FROM inventario_items i
JOIN inventario_lotes l ON l.item_id = i.id
WHERE i.codigo LIKE 'DEMO-INV-%'
  AND l.lote_codigo LIKE 'DEMO-L00_'
  AND NOT EXISTS (
    SELECT 1
    FROM inventario_movimientos m
    WHERE m.item_id = i.id
      AND m.lote_id = l.id
      AND m.tipo = 'entrada'
      AND m.observacion = 'Carga demo inicial'
      AND m.origen = 'inventario'
  );

-- ==========================================
-- DEMO: INVENTARIO INTERNO (5 recetas + 5 consumos)
-- ==========================================

SET @r1 := (SELECT id FROM inventario_items WHERE codigo = 'DEMO-INV-001' LIMIT 1);
SET @r2 := (SELECT id FROM inventario_items WHERE codigo = 'DEMO-INV-002' LIMIT 1);
SET @r3 := (SELECT id FROM inventario_items WHERE codigo = 'DEMO-INV-003' LIMIT 1);
SET @r4 := (SELECT id FROM inventario_items WHERE codigo = 'DEMO-INV-004' LIMIT 1);
SET @r5 := (SELECT id FROM inventario_items WHERE codigo = 'DEMO-INV-005' LIMIT 1);

SET @e1 := (SELECT id FROM examenes_laboratorio ORDER BY id LIMIT 0,1);
SET @e2 := (SELECT id FROM examenes_laboratorio ORDER BY id LIMIT 1,1);
SET @e3 := (SELECT id FROM examenes_laboratorio ORDER BY id LIMIT 2,1);
SET @e4 := (SELECT id FROM examenes_laboratorio ORDER BY id LIMIT 3,1);
SET @e5 := (SELECT id FROM examenes_laboratorio ORDER BY id LIMIT 4,1);

INSERT INTO inventario_examen_recetas (id_examen, item_id, cantidad_por_prueba, activo, observacion, created_at, updated_at)
SELECT @e1, @r1, 2.0000, 1, 'Receta demo', NOW(), NOW()
WHERE @e1 IS NOT NULL AND @r1 IS NOT NULL
ON DUPLICATE KEY UPDATE cantidad_por_prueba = VALUES(cantidad_por_prueba), activo = VALUES(activo), observacion = VALUES(observacion), updated_at = NOW();

INSERT INTO inventario_examen_recetas (id_examen, item_id, cantidad_por_prueba, activo, observacion, created_at, updated_at)
SELECT @e2, @r2, 1.0000, 1, 'Receta demo', NOW(), NOW()
WHERE @e2 IS NOT NULL AND @r2 IS NOT NULL
ON DUPLICATE KEY UPDATE cantidad_por_prueba = VALUES(cantidad_por_prueba), activo = VALUES(activo), observacion = VALUES(observacion), updated_at = NOW();

INSERT INTO inventario_examen_recetas (id_examen, item_id, cantidad_por_prueba, activo, observacion, created_at, updated_at)
SELECT @e3, @r3, 3.0000, 1, 'Receta demo', NOW(), NOW()
WHERE @e3 IS NOT NULL AND @r3 IS NOT NULL
ON DUPLICATE KEY UPDATE cantidad_por_prueba = VALUES(cantidad_por_prueba), activo = VALUES(activo), observacion = VALUES(observacion), updated_at = NOW();

INSERT INTO inventario_examen_recetas (id_examen, item_id, cantidad_por_prueba, activo, observacion, created_at, updated_at)
SELECT @e4, @r4, 1.0000, 1, 'Receta demo', NOW(), NOW()
WHERE @e4 IS NOT NULL AND @r4 IS NOT NULL
ON DUPLICATE KEY UPDATE cantidad_por_prueba = VALUES(cantidad_por_prueba), activo = VALUES(activo), observacion = VALUES(observacion), updated_at = NOW();

INSERT INTO inventario_examen_recetas (id_examen, item_id, cantidad_por_prueba, activo, observacion, created_at, updated_at)
SELECT @e5, @r5, 1.0000, 1, 'Receta demo', NOW(), NOW()
WHERE @e5 IS NOT NULL AND @r5 IS NOT NULL
ON DUPLICATE KEY UPDATE cantidad_por_prueba = VALUES(cantidad_por_prueba), activo = VALUES(activo), observacion = VALUES(observacion), updated_at = NOW();

INSERT INTO inventario_transferencias (origen, destino, usuario_id, observacion, fecha_hora)
VALUES ('almacen_principal', 'laboratorio', NULL, 'Transferencia demo inicial', NOW());
SET @transfer_demo := LAST_INSERT_ID();

INSERT INTO inventario_transferencias_detalle (transferencia_id, item_id, cantidad, created_at)
SELECT @transfer_demo, @r1, 100.0000, NOW() WHERE @r1 IS NOT NULL;
INSERT INTO inventario_transferencias_detalle (transferencia_id, item_id, cantidad, created_at)
SELECT @transfer_demo, @r2, 80.0000, NOW() WHERE @r2 IS NOT NULL;
INSERT INTO inventario_transferencias_detalle (transferencia_id, item_id, cantidad, created_at)
SELECT @transfer_demo, @r3, 200.0000, NOW() WHERE @r3 IS NOT NULL;
INSERT INTO inventario_transferencias_detalle (transferencia_id, item_id, cantidad, created_at)
SELECT @transfer_demo, @r4, 60.0000, NOW() WHERE @r4 IS NOT NULL;
INSERT INTO inventario_transferencias_detalle (transferencia_id, item_id, cantidad, created_at)
SELECT @transfer_demo, @r5, 60.0000, NOW() WHERE @r5 IS NOT NULL;

INSERT INTO inventario_consumos_examen
(orden_id, cobro_id, consulta_id, paciente_id, id_examen, item_id, cantidad_consumida, origen_evento, estado, usuario_id, observacion, fecha_hora)
SELECT NULL, NULL, NULL, NULL, @e1, @r1, 2.0000, 'demo_carga', 'aplicado', NULL, 'Consumo demo', NOW()
WHERE @e1 IS NOT NULL AND @r1 IS NOT NULL;

INSERT INTO inventario_consumos_examen
(orden_id, cobro_id, consulta_id, paciente_id, id_examen, item_id, cantidad_consumida, origen_evento, estado, usuario_id, observacion, fecha_hora)
SELECT NULL, NULL, NULL, NULL, @e2, @r2, 1.0000, 'demo_carga', 'aplicado', NULL, 'Consumo demo', NOW()
WHERE @e2 IS NOT NULL AND @r2 IS NOT NULL;

INSERT INTO inventario_consumos_examen
(orden_id, cobro_id, consulta_id, paciente_id, id_examen, item_id, cantidad_consumida, origen_evento, estado, usuario_id, observacion, fecha_hora)
SELECT NULL, NULL, NULL, NULL, @e3, @r3, 3.0000, 'demo_carga', 'aplicado', NULL, 'Consumo demo', NOW()
WHERE @e3 IS NOT NULL AND @r3 IS NOT NULL;

INSERT INTO inventario_consumos_examen
(orden_id, cobro_id, consulta_id, paciente_id, id_examen, item_id, cantidad_consumida, origen_evento, estado, usuario_id, observacion, fecha_hora)
SELECT NULL, NULL, NULL, NULL, @e4, @r4, 1.0000, 'demo_carga', 'aplicado', NULL, 'Consumo demo', NOW()
WHERE @e4 IS NOT NULL AND @r4 IS NOT NULL;

INSERT INTO inventario_consumos_examen
(orden_id, cobro_id, consulta_id, paciente_id, id_examen, item_id, cantidad_consumida, origen_evento, estado, usuario_id, observacion, fecha_hora)
SELECT NULL, NULL, NULL, NULL, @e5, @r5, 1.0000, 'demo_carga', 'aplicado', NULL, 'Consumo demo', NOW()
WHERE @e5 IS NOT NULL AND @r5 IS NOT NULL;

COMMIT;

SELECT 'OK - Datos demo de inventario cargados.' AS resultado;
