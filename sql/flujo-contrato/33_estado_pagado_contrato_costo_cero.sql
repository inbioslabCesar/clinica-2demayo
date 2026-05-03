-- 33_estado_pagado_contrato_costo_cero.sql
-- Objetivo:
-- 1) Eliminar uso operativo del estado CONTROL en cotizaciones.
-- 2) Persistir un flag de negocio explicito para costo cero por contrato.
-- 3) Backfill seguro para registros historicos.

SET @db_name := DATABASE();

-- 1) Columna de negocio: es_costo_cero_contrato
SET @has_flag_col := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'cotizaciones'
    AND COLUMN_NAME = 'es_costo_cero_contrato'
);
SET @sql_add_flag_col := IF(
  @has_flag_col = 0,
  'ALTER TABLE cotizaciones ADD COLUMN es_costo_cero_contrato TINYINT(1) NOT NULL DEFAULT 0 COMMENT "1 = cotizacion costo cero cubierta por contrato" AFTER estado',
  'SELECT "es_costo_cero_contrato ya existe"'
);
PREPARE stmt_add_flag_col FROM @sql_add_flag_col;
EXECUTE stmt_add_flag_col;
DEALLOCATE PREPARE stmt_add_flag_col;

-- 2) Indice para filtros/reportes por origen de estado clinico
SET @has_flag_idx := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'cotizaciones'
    AND INDEX_NAME = 'idx_cotizaciones_costo_cero_contrato'
);
SET @sql_add_flag_idx := IF(
  @has_flag_idx = 0,
  'ALTER TABLE cotizaciones ADD INDEX idx_cotizaciones_costo_cero_contrato (es_costo_cero_contrato, estado)',
  'SELECT "idx_cotizaciones_costo_cero_contrato ya existe"'
);
PREPARE stmt_add_flag_idx FROM @sql_add_flag_idx;
EXECUTE stmt_add_flag_idx;
DEALLOCATE PREPARE stmt_add_flag_idx;

-- 3) Marcar historicos CONTROL como costo cero por contrato y normalizar a PAGADO.
UPDATE cotizaciones
SET
  es_costo_cero_contrato = 1,
  total = 0,
  estado = 'pagado'
WHERE UPPER(TRIM(COALESCE(estado, ''))) = 'CONTROL';

-- 4) Backfill adicional: cotizaciones costo-cero puramente de contrato.
--    Criterio: total ~= 0 y todos los detalles activos tienen origen_cobro='contrato'.
SET @has_det_origen := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'cotizaciones_detalle'
    AND COLUMN_NAME = 'origen_cobro'
);

SET @has_det_estado_item := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'cotizaciones_detalle'
    AND COLUMN_NAME = 'estado_item'
);

SET @sql_backfill_detalle := IF(
  @has_det_origen = 1,
  CONCAT(
    'UPDATE cotizaciones c ',
    'INNER JOIN (',
    '  SELECT cd.cotizacion_id, ',
    '         SUM(CASE WHEN LOWER(TRIM(COALESCE(cd.origen_cobro, ''regular''))) = ''contrato'' THEN 0 ELSE 1 END) AS no_contrato, ',
    '         COUNT(*) AS total_items ',
    '  FROM cotizaciones_detalle cd ',
    IF(@has_det_estado_item = 1, '  WHERE COALESCE(cd.estado_item, ''activo'') <> ''eliminado'' ', '  WHERE 1=1 '),
    '  GROUP BY cd.cotizacion_id',
    ') x ON x.cotizacion_id = c.id ',
    'SET c.es_costo_cero_contrato = 1, c.estado = ''pagado'' ',
    'WHERE c.total <= 0.00001 AND x.total_items > 0 AND x.no_contrato = 0'
  ),
  'SELECT "No existe cotizaciones_detalle.origen_cobro, backfill extendido omitido"'
);
PREPARE stmt_backfill_detalle FROM @sql_backfill_detalle;
EXECUTE stmt_backfill_detalle;
DEALLOCATE PREPARE stmt_backfill_detalle;

-- 5) Alinear saldos en esquemas con saldo_v2, sin fallar en esquemas legacy.
SET @has_total_pagado := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'cotizaciones'
    AND COLUMN_NAME = 'total_pagado'
);
SET @has_saldo_pendiente := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'cotizaciones'
    AND COLUMN_NAME = 'saldo_pendiente'
);

SET @sql_fix_saldo_v2 := IF(
  @has_total_pagado = 1 AND @has_saldo_pendiente = 1,
  'UPDATE cotizaciones SET total_pagado = 0, saldo_pendiente = 0, estado = ''pagado'' WHERE es_costo_cero_contrato = 1',
  'SELECT "Schema legacy sin total_pagado/saldo_pendiente: fix de saldos omitido"'
);
PREPARE stmt_fix_saldo_v2 FROM @sql_fix_saldo_v2;
EXECUTE stmt_fix_saldo_v2;
DEALLOCATE PREPARE stmt_fix_saldo_v2;

-- 6) Verificacion rapida
SELECT
  COUNT(*) AS total_cotizaciones_contrato_costo_cero,
  SUM(CASE WHEN estado = 'pagado' THEN 1 ELSE 0 END) AS pagadas,
  SUM(CASE WHEN UPPER(TRIM(COALESCE(estado, ''))) = 'CONTROL' THEN 1 ELSE 0 END) AS controles_restantes
FROM cotizaciones
WHERE es_costo_cero_contrato = 1;
