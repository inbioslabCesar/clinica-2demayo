-- Migracion idempotente: saldo v2 para cotizaciones
-- Fecha: 2026-04-03
-- Objetivo: habilitar total_pagado/saldo_pendiente y tabla cotizacion_movimientos
-- para que registrar_abono funcione en modo v2 sin warnings.

START TRANSACTION;

SET @db := DATABASE();

-- =========================================================
-- 1) Columnas v2 en cotizaciones
-- =========================================================
SET @q := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE cotizaciones ADD COLUMN numero_comprobante VARCHAR(30) NULL AFTER id',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'cotizaciones' AND COLUMN_NAME = 'numero_comprobante'
);
PREPARE stmt FROM @q; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @q := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE cotizaciones ADD COLUMN total_pagado DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER total',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'cotizaciones' AND COLUMN_NAME = 'total_pagado'
);
PREPARE stmt FROM @q; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @q := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE cotizaciones ADD COLUMN saldo_pendiente DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER total_pagado',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'cotizaciones' AND COLUMN_NAME = 'saldo_pendiente'
);
PREPARE stmt FROM @q; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @q := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE cotizaciones ADD COLUMN version_actual INT NOT NULL DEFAULT 1 AFTER estado',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'cotizaciones' AND COLUMN_NAME = 'version_actual'
);
PREPARE stmt FROM @q; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @q := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE cotizaciones ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER fecha',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'cotizaciones' AND COLUMN_NAME = 'updated_at'
);
PREPARE stmt FROM @q; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Inicializar saldos v2 en filas existentes
UPDATE cotizaciones
SET total_pagado = CASE
      WHEN LOWER(COALESCE(estado, '')) = 'pagado' THEN total
      ELSE COALESCE(total_pagado, 0)
    END,
    saldo_pendiente = CASE
      WHEN LOWER(COALESCE(estado, '')) = 'pagado' THEN 0
      WHEN COALESCE(saldo_pendiente, 0) = 0 THEN total
      ELSE saldo_pendiente
    END
WHERE total IS NOT NULL;

-- Normalizar estados fuera de catalogo operativo
UPDATE cotizaciones
SET estado = CASE
  WHEN LOWER(COALESCE(estado, '')) IN ('anulado', 'cancelado', 'cancelada') THEN 'anulada'
  WHEN LOWER(COALESCE(estado, '')) IN ('pagado', 'cobrado', 'cobrada') THEN 'pagado'
  WHEN LOWER(COALESCE(estado, '')) IN ('parcial') THEN 'parcial'
  ELSE 'pendiente'
END;

-- =========================================================
-- 2) Indices utiles
-- =========================================================
SET @q := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE cotizaciones ADD KEY idx_cotizaciones_estado_fecha (estado, fecha)',
    'SELECT 1'
  )
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'cotizaciones' AND INDEX_NAME = 'idx_cotizaciones_estado_fecha'
);
PREPARE stmt FROM @q; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @q := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE cotizaciones ADD KEY idx_cotizaciones_paciente_fecha (paciente_id, fecha)',
    'SELECT 1'
  )
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'cotizaciones' AND INDEX_NAME = 'idx_cotizaciones_paciente_fecha'
);
PREPARE stmt FROM @q; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- =========================================================
-- 3) Tabla de movimientos para trazabilidad de abonos
-- =========================================================
CREATE TABLE IF NOT EXISTS cotizacion_movimientos (
  id INT(11) NOT NULL AUTO_INCREMENT,
  cotizacion_id INT(11) NOT NULL,
  cobro_id INT(11) DEFAULT NULL,
  tipo_movimiento ENUM('cargo','abono','devolucion','ajuste') NOT NULL,
  monto DECIMAL(10,2) NOT NULL,
  saldo_anterior DECIMAL(10,2) NOT NULL,
  saldo_nuevo DECIMAL(10,2) NOT NULL,
  descripcion VARCHAR(255) DEFAULT NULL,
  usuario_id INT(11) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_cot_mov_cotizacion (cotizacion_id, created_at),
  KEY idx_cot_mov_cobro (cobro_id),
  KEY idx_cot_mov_tipo (tipo_movimiento)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

COMMIT;

-- Verificacion rapida opcional
-- SELECT id, total, total_pagado, saldo_pendiente, estado FROM cotizaciones ORDER BY id DESC LIMIT 20;
