-- Migración: Firma profesional por usuario para reportes
-- Fecha: 2026-03-03
-- Objetivo:
-- 1) Permitir que personal clínico (laboratorio/farmacia/enfermería, etc.) registre firma y colegiatura.
-- 2) Vincular resultados de laboratorio con el usuario firmante.

START TRANSACTION;

-- =========================================================
-- 1) PERFIL PROFESIONAL EN USUARIOS
-- =========================================================
SET @exists_firma_reportes := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'usuarios'
    AND COLUMN_NAME = 'firma_reportes'
);
SET @sql_firma_reportes := IF(
  @exists_firma_reportes = 0,
  'ALTER TABLE usuarios ADD COLUMN firma_reportes LONGTEXT NULL AFTER profesion',
  'SELECT "firma_reportes ya existe"'
);
PREPARE stmt_firma_reportes FROM @sql_firma_reportes;
EXECUTE stmt_firma_reportes;
DEALLOCATE PREPARE stmt_firma_reportes;

SET @exists_colegiatura_tipo := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'usuarios'
    AND COLUMN_NAME = 'colegiatura_tipo'
);
SET @sql_colegiatura_tipo := IF(
  @exists_colegiatura_tipo = 0,
  'ALTER TABLE usuarios ADD COLUMN colegiatura_tipo VARCHAR(80) NULL AFTER firma_reportes',
  'SELECT "colegiatura_tipo ya existe"'
);
PREPARE stmt_colegiatura_tipo FROM @sql_colegiatura_tipo;
EXECUTE stmt_colegiatura_tipo;
DEALLOCATE PREPARE stmt_colegiatura_tipo;

SET @exists_colegiatura_numero := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'usuarios'
    AND COLUMN_NAME = 'colegiatura_numero'
);
SET @sql_colegiatura_numero := IF(
  @exists_colegiatura_numero = 0,
  'ALTER TABLE usuarios ADD COLUMN colegiatura_numero VARCHAR(60) NULL AFTER colegiatura_tipo',
  'SELECT "colegiatura_numero ya existe"'
);
PREPARE stmt_colegiatura_numero FROM @sql_colegiatura_numero;
EXECUTE stmt_colegiatura_numero;
DEALLOCATE PREPARE stmt_colegiatura_numero;

SET @exists_cargo_firma := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'usuarios'
    AND COLUMN_NAME = 'cargo_firma'
);
SET @sql_cargo_firma := IF(
  @exists_cargo_firma = 0,
  'ALTER TABLE usuarios ADD COLUMN cargo_firma VARCHAR(120) NULL AFTER colegiatura_numero',
  'SELECT "cargo_firma ya existe"'
);
PREPARE stmt_cargo_firma FROM @sql_cargo_firma;
EXECUTE stmt_cargo_firma;
DEALLOCATE PREPARE stmt_cargo_firma;

-- =========================================================
-- 2) TRAZABILIDAD DE FIRMANTE EN RESULTADOS LABORATORIO
-- =========================================================
SET @exists_firmado_por := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'resultados_laboratorio'
    AND COLUMN_NAME = 'firmado_por_usuario_id'
);
SET @sql_firmado_por := IF(
  @exists_firmado_por = 0,
  'ALTER TABLE resultados_laboratorio ADD COLUMN firmado_por_usuario_id INT NULL AFTER resultados',
  'SELECT "firmado_por_usuario_id ya existe"'
);
PREPARE stmt_firmado_por FROM @sql_firmado_por;
EXECUTE stmt_firmado_por;
DEALLOCATE PREPARE stmt_firmado_por;

SET @exists_idx_firmado_por := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'resultados_laboratorio'
    AND INDEX_NAME = 'idx_resultados_firmado_por_usuario'
);
SET @sql_idx_firmado_por := IF(
  @exists_idx_firmado_por = 0,
  'ALTER TABLE resultados_laboratorio ADD INDEX idx_resultados_firmado_por_usuario (firmado_por_usuario_id)',
  'SELECT "idx_resultados_firmado_por_usuario ya existe"'
);
PREPARE stmt_idx_firmado_por FROM @sql_idx_firmado_por;
EXECUTE stmt_idx_firmado_por;
DEALLOCATE PREPARE stmt_idx_firmado_por;

COMMIT;

-- Para validar primero sin guardar: reemplazar COMMIT por ROLLBACK;
