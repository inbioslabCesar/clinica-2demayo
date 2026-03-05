SELECT 'TABLAS INVENTARIO' AS bloque;
SELECT TABLE_NAME
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN (
    'inventario_items',
    'inventario_lotes',
    'inventario_movimientos',
    'inventario_examen_recetas',
    'inventario_transferencias',
    'inventario_transferencias_detalle',
    'inventario_consumos_examen'
  )
ORDER BY TABLE_NAME;

SELECT 'CANTIDAD TABLAS ENCONTRADAS' AS bloque;
SELECT COUNT(*) AS total_tablas_inventario
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN (
    'inventario_items',
    'inventario_lotes',
    'inventario_movimientos',
    'inventario_examen_recetas',
    'inventario_transferencias',
    'inventario_transferencias_detalle',
    'inventario_consumos_examen'
  );

SELECT 'COLUMNAS CLAVE inventario_items' AS bloque;
SELECT COLUMN_NAME, COLUMN_TYPE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'inventario_items'
  AND COLUMN_NAME IN ('marca', 'presentacion', 'factor_presentacion', 'controla_stock', 'created_at', 'updated_at')
ORDER BY COLUMN_NAME;

SELECT 'COLUMNAS CLAVE inventario_movimientos' AS bloque;
SELECT COLUMN_NAME, COLUMN_TYPE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'inventario_movimientos'
  AND COLUMN_NAME IN ('origen')
ORDER BY COLUMN_NAME;

SELECT 'INDICES CLAVE inventario_consumos_examen' AS bloque;
SELECT INDEX_NAME, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS columnas
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'inventario_consumos_examen'
  AND INDEX_NAME IN ('uk_consumo_evento_orden', 'idx_consumo_estado_item', 'idx_consumo_repeticion')
GROUP BY INDEX_NAME;

SELECT 'FKS CLAVE' AS bloque;
SELECT TABLE_NAME, CONSTRAINT_NAME
FROM information_schema.REFERENTIAL_CONSTRAINTS
WHERE CONSTRAINT_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('inventario_lotes', 'inventario_movimientos', 'inventario_examen_recetas', 'inventario_transferencias_detalle', 'inventario_consumos_examen')
ORDER BY TABLE_NAME, CONSTRAINT_NAME;
