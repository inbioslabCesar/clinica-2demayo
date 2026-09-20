-- Performance indexes for Atenciones, HC and Login
-- Safe to run multiple times (idempotent by index-name checks).

SET @db := DATABASE();

-- ---------------------------------------------------------------------------
-- cotizacion_movimientos
-- Query pattern: WHERE cotizacion_id = ? AND tipo_movimiento = 'abono' ORDER BY created_at DESC
-- ---------------------------------------------------------------------------
SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = @db
    AND table_name = 'cotizacion_movimientos'
    AND index_name = 'idx_cmov_cot_tipo_created'
);
SET @sql := IF(
  @idx_exists = 0,
  'ALTER TABLE cotizacion_movimientos ADD INDEX idx_cmov_cot_tipo_created (cotizacion_id, tipo_movimiento, created_at)',
  'SELECT "idx_cmov_cot_tipo_created exists"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- cotizaciones_detalle
-- Query pattern: explicit consulta resolution/grouping by cotizacion and consulta
-- ---------------------------------------------------------------------------
SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = @db
    AND table_name = 'cotizaciones_detalle'
    AND index_name = 'idx_cd_cot_consulta_estado'
);
SET @sql := IF(
  @idx_exists = 0,
  'ALTER TABLE cotizaciones_detalle ADD INDEX idx_cd_cot_consulta_estado (cotizacion_id, consulta_id, estado_item)',
  'SELECT "idx_cd_cot_consulta_estado exists"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Query pattern: medico/vinculo operativo por cotizacion + servicio + estado
SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = @db
    AND table_name = 'cotizaciones_detalle'
    AND index_name = 'idx_cd_cot_serv_estado_med'
);
SET @sql := IF(
  @idx_exists = 0,
  'ALTER TABLE cotizaciones_detalle ADD INDEX idx_cd_cot_serv_estado_med (cotizacion_id, servicio_tipo, estado_item, medico_id)',
  'SELECT "idx_cd_cot_serv_estado_med exists"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- consultas_habilitaciones_anticipadas
-- Query pattern: regularization by cotizacion, estado='activo', consulta_id <= 0
-- ---------------------------------------------------------------------------
SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = @db
    AND table_name = 'consultas_habilitaciones_anticipadas'
    AND index_name = 'idx_cha_cot_estado_consulta'
);
SET @sql := IF(
  @idx_exists = 0,
  'ALTER TABLE consultas_habilitaciones_anticipadas ADD INDEX idx_cha_cot_estado_consulta (cotizacion_id, estado, consulta_id)',
  'SELECT "idx_cha_cot_estado_consulta exists"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- agenda_servicios_cotizacion
-- Query pattern: cotizacion + detalle + estado_evento for correlativos/agenda hydration
-- ---------------------------------------------------------------------------
SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = @db
    AND table_name = 'agenda_servicios_cotizacion'
    AND index_name = 'idx_asc_cot_det_estado'
);
SET @sql := IF(
  @idx_exists = 0,
  'ALTER TABLE agenda_servicios_cotizacion ADD INDEX idx_asc_cot_det_estado (cotizacion_id, cotizacion_detalle_id, estado_evento)',
  'SELECT "idx_asc_cot_det_estado exists"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- medicos
-- Query pattern: login fallback by nro_colegiatura (if column exists)
-- ---------------------------------------------------------------------------
SET @has_col := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = @db
    AND table_name = 'medicos'
    AND column_name = 'nro_colegiatura'
);
SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = @db
    AND table_name = 'medicos'
    AND index_name = 'idx_nro_colegiatura'
);
SET @sql := IF(
  @has_col = 1 AND @idx_exists = 0,
  'ALTER TABLE medicos ADD INDEX idx_nro_colegiatura (nro_colegiatura)',
  'SELECT "idx_nro_colegiatura skipped"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
