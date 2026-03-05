SET NAMES utf8mb4;

START TRANSACTION;

-- ==========================================
-- CLEANUP DEMO INVENTARIO (solo datos DEMO)
-- ==========================================

-- 1) Consumos demo internos
DELETE FROM inventario_consumos_examen
WHERE origen_evento = 'demo_carga'
  AND observacion = 'Consumo demo';

-- 2) Transferencia demo interna y detalle
DELETE td
FROM inventario_transferencias_detalle td
JOIN inventario_transferencias t ON t.id = td.transferencia_id
WHERE t.observacion = 'Transferencia demo inicial'
  AND t.origen = 'almacen_principal'
  AND t.destino = 'laboratorio';

DELETE FROM inventario_transferencias
WHERE observacion = 'Transferencia demo inicial'
  AND origen = 'almacen_principal'
  AND destino = 'laboratorio';

-- 3) Recetas demo (ligadas a ítems DEMO)
DELETE r
FROM inventario_examen_recetas r
JOIN inventario_items i ON i.id = r.item_id
WHERE i.codigo LIKE 'DEMO-INV-%'
  AND r.observacion = 'Receta demo';

-- 4) Movimientos demo de carga inicial en inventario general
DELETE m
FROM inventario_movimientos m
JOIN inventario_items i ON i.id = m.item_id
WHERE i.codigo LIKE 'DEMO-INV-%'
  AND m.observacion = 'Carga demo inicial'
  AND m.origen = 'inventario';

-- 5) Lotes demo
DELETE l
FROM inventario_lotes l
JOIN inventario_items i ON i.id = l.item_id
WHERE i.codigo LIKE 'DEMO-INV-%'
  AND l.lote_codigo LIKE 'DEMO-L00_';

-- 6) Ítems demo
DELETE FROM inventario_items
WHERE codigo LIKE 'DEMO-INV-%';

COMMIT;

SELECT 'OK - Cleanup demo inventario ejecutado.' AS resultado;
