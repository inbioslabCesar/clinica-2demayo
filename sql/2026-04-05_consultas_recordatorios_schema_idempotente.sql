-- Migracion idempotente: columnas de consultas/medicos + tabla de recordatorios
-- Fecha: 2026-04-05

SET @db := DATABASE();

-- =========================================================
-- 1) Columnas en medicos
-- =========================================================
SET @q := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'medicos' AND COLUMN_NAME = 'tipo_profesional'
    ),
    'SELECT 1',
    'ALTER TABLE medicos ADD COLUMN tipo_profesional VARCHAR(30) NOT NULL DEFAULT ''medico''' 
  )
);
PREPARE stmt FROM @q; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @q := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'medicos' AND COLUMN_NAME = 'abreviatura_profesional'
    ),
    'SELECT 1',
    'ALTER TABLE medicos ADD COLUMN abreviatura_profesional VARCHAR(20) NOT NULL DEFAULT ''Dr(a).''' 
  )
);
PREPARE stmt FROM @q; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @q := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'medicos' AND COLUMN_NAME = 'colegio_sigla'
    ),
    'SELECT 1',
    'ALTER TABLE medicos ADD COLUMN colegio_sigla VARCHAR(20) NULL'
  )
);
PREPARE stmt FROM @q; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @q := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'medicos' AND COLUMN_NAME = 'nro_colegiatura'
    ),
    'SELECT 1',
    'ALTER TABLE medicos ADD COLUMN nro_colegiatura VARCHAR(30) NULL'
  )
);
PREPARE stmt FROM @q; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- =========================================================
-- 2) Columnas en consultas
-- =========================================================
SET @q := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'consultas' AND COLUMN_NAME = 'es_reprogramada'
    ),
    'SELECT 1',
    'ALTER TABLE consultas ADD COLUMN es_reprogramada TINYINT(1) NOT NULL DEFAULT 0'
  )
);
PREPARE stmt FROM @q; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @q := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'consultas' AND COLUMN_NAME = 'reprogramada_en'
    ),
    'SELECT 1',
    'ALTER TABLE consultas ADD COLUMN reprogramada_en DATETIME NULL'
  )
);
PREPARE stmt FROM @q; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @q := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'consultas' AND COLUMN_NAME = 'hc_origen_id'
    ),
    'SELECT 1',
    'ALTER TABLE consultas ADD COLUMN hc_origen_id INT NULL COMMENT ''ID de la Historia Clinica origen si vino de proxima cita'''
  )
);
PREPARE stmt FROM @q; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @q := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'consultas' AND COLUMN_NAME = 'origen_creacion'
    ),
    'SELECT 1',
    'ALTER TABLE consultas ADD COLUMN origen_creacion VARCHAR(20) NOT NULL DEFAULT ''agendada'' COMMENT ''Origen del flujo: agendada|cotizador|hc_proxima'''
  )
);
PREPARE stmt FROM @q; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @q := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'consultas' AND COLUMN_NAME = 'es_control'
    ),
    'SELECT 1',
    'ALTER TABLE consultas ADD COLUMN es_control TINYINT(1) NOT NULL DEFAULT 0 COMMENT ''1 = cita de control sin costo'''
  )
);
PREPARE stmt FROM @q; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Indices utiles
SET @q := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'consultas' AND INDEX_NAME = 'idx_hc_origen'
    ),
    'SELECT 1',
    'ALTER TABLE consultas ADD INDEX idx_hc_origen (hc_origen_id)'
  )
);
PREPARE stmt FROM @q; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @q := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'consultas' AND INDEX_NAME = 'idx_origen_creacion'
    ),
    'SELECT 1',
    'ALTER TABLE consultas ADD INDEX idx_origen_creacion (origen_creacion)'
  )
);
PREPARE stmt FROM @q; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @q := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'consultas' AND INDEX_NAME = 'idx_es_control'
    ),
    'SELECT 1',
    'ALTER TABLE consultas ADD INDEX idx_es_control (es_control)'
  )
);
PREPARE stmt FROM @q; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Backfill de origen_creacion
UPDATE consultas c
SET c.origen_creacion = CASE
  WHEN c.hc_origen_id IS NOT NULL AND c.hc_origen_id > 0 THEN 'hc_proxima'
  WHEN EXISTS (
    SELECT 1
    FROM cotizaciones_detalle cd
    INNER JOIN cotizaciones ct ON ct.id = cd.cotizacion_id
    WHERE cd.consulta_id = c.id
      AND ct.estado <> 'anulado'
    LIMIT 1
  ) THEN 'cotizador'
  ELSE 'agendada'
END
WHERE c.origen_creacion IS NULL
   OR TRIM(c.origen_creacion) = ''
   OR c.origen_creacion NOT IN ('agendada', 'cotizador', 'hc_proxima');

-- =========================================================
-- 3) Tabla recordatorios_consultas
-- =========================================================
CREATE TABLE IF NOT EXISTS recordatorios_consultas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  consulta_id INT NOT NULL,
  estado VARCHAR(30) NOT NULL DEFAULT 'pendiente',
  observacion TEXT NULL,
  fecha_proximo_contacto DATETIME NULL,
  fecha_ultimo_contacto DATETIME NULL,
  intentos INT NOT NULL DEFAULT 0,
  actualizado_por INT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_recordatorios_consulta (consulta_id),
  KEY idx_recordatorios_estado (estado),
  KEY idx_recordatorios_proximo_contacto (fecha_proximo_contacto)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
