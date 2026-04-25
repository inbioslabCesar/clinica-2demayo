-- 18_migracion_hc_cadena_contrato.sql
-- Objetivo:
-- 1) Crear estructura de encadenamiento clinico en historia_clinica
-- 2) Vincular HC con contexto de contrato/agenda
-- 3) Backfill inicial desde consultas.hc_origen_id y agenda_contrato.consulta_id
-- 4) Crear auditoria estructural de cadena
--
-- Nota:
-- - Script idempotente para desarrollo/produccion.
-- - Mantiene compatibilidad con consultas.hc_origen_id (legado).

START TRANSACTION;

-- ------------------------------------------------------------
-- 1) Extensiones de historia_clinica para cadena y contrato
--    Una columna por ALTER para compatibilidad MySQL/MariaDB.
-- ------------------------------------------------------------
ALTER TABLE historia_clinica ADD COLUMN IF NOT EXISTS hc_parent_id BIGINT UNSIGNED NULL AFTER consulta_id;
ALTER TABLE historia_clinica ADD COLUMN IF NOT EXISTS hc_root_id BIGINT UNSIGNED NULL AFTER hc_parent_id;
ALTER TABLE historia_clinica ADD COLUMN IF NOT EXISTS chain_depth INT NOT NULL DEFAULT 0 AFTER hc_root_id;
ALTER TABLE historia_clinica ADD COLUMN IF NOT EXISTS contrato_paciente_id BIGINT UNSIGNED NULL AFTER chain_depth;
ALTER TABLE historia_clinica ADD COLUMN IF NOT EXISTS agenda_contrato_id BIGINT UNSIGNED NULL AFTER contrato_paciente_id;
ALTER TABLE historia_clinica ADD COLUMN IF NOT EXISTS chain_status ENUM('activa','cerrada','anulada') NOT NULL DEFAULT 'activa' AFTER agenda_contrato_id;
ALTER TABLE historia_clinica ADD COLUMN IF NOT EXISTS updated_seq INT NOT NULL DEFAULT 1 AFTER chain_status;

ALTER TABLE historia_clinica ADD INDEX IF NOT EXISTS idx_hc_parent_id (hc_parent_id);
ALTER TABLE historia_clinica ADD INDEX IF NOT EXISTS idx_hc_root_depth (hc_root_id, chain_depth);
ALTER TABLE historia_clinica ADD INDEX IF NOT EXISTS idx_hc_contrato_evento (contrato_paciente_id, agenda_contrato_id);
ALTER TABLE historia_clinica ADD INDEX IF NOT EXISTS idx_hc_chain_status (chain_status);

-- ------------------------------------------------------------
-- 2) Auditoria estructural de cadena
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hc_chain_auditoria (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  historia_clinica_id BIGINT UNSIGNED NOT NULL,
  accion ENUM('create','relink','status_change','lock_conflict','manual_fix') NOT NULL,
  usuario_id BIGINT UNSIGNED NULL,
  motivo VARCHAR(255) NULL,
  before_json LONGTEXT NULL,
  after_json LONGTEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_hc_chain_aud_hc (historia_clinica_id),
  KEY idx_hc_chain_aud_accion (accion),
  KEY idx_hc_chain_aud_fecha (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- 3) Backfill parent desde consultas.hc_origen_id
--    Compatibilidad: hc_origen_id pudo guardar historia_clinica.id
--    o historia_clinica.consulta_id (legacy).
-- ------------------------------------------------------------
UPDATE historia_clinica h
INNER JOIN consultas c ON c.id = h.consulta_id
LEFT JOIN historia_clinica hp_id ON hp_id.id = c.hc_origen_id
LEFT JOIN historia_clinica hp_consulta ON hp_consulta.consulta_id = c.hc_origen_id
SET h.hc_parent_id = COALESCE(hp_id.id, hp_consulta.id)
WHERE (h.hc_parent_id IS NULL OR h.hc_parent_id = 0)
  AND c.hc_origen_id IS NOT NULL
  AND c.hc_origen_id > 0;

-- Evitar autoreferencia directa
UPDATE historia_clinica
SET hc_parent_id = NULL,
    chain_status = 'anulada'
WHERE hc_parent_id = id;

-- ------------------------------------------------------------
-- 4) Vincular contexto contrato/agenda desde agenda_contrato.consulta_id
-- ------------------------------------------------------------
UPDATE historia_clinica h
INNER JOIN agenda_contrato ag ON ag.consulta_id = h.consulta_id
SET h.agenda_contrato_id = ag.id,
    h.contrato_paciente_id = ag.contrato_paciente_id
WHERE (h.agenda_contrato_id IS NULL OR h.agenda_contrato_id = 0
    OR h.contrato_paciente_id IS NULL OR h.contrato_paciente_id = 0);

-- ------------------------------------------------------------
-- 5) Inicializar root/depth base
-- ------------------------------------------------------------
UPDATE historia_clinica
SET hc_root_id = id,
    chain_depth = 0
WHERE hc_root_id IS NULL OR hc_root_id = 0;

-- ------------------------------------------------------------
-- 6) Propagar root/depth desde parent (12 pasadas)
--    Suficiente para cadenas clinicas usuales (control diario).
--    Si existen cadenas mas largas, re-ejecutar script (idempotente).
-- ------------------------------------------------------------
UPDATE historia_clinica h
INNER JOIN historia_clinica p ON p.id = h.hc_parent_id
SET h.hc_root_id = COALESCE(p.hc_root_id, p.id),
    h.chain_depth = IFNULL(p.chain_depth, 0) + 1;

UPDATE historia_clinica h
INNER JOIN historia_clinica p ON p.id = h.hc_parent_id
SET h.hc_root_id = COALESCE(p.hc_root_id, p.id),
    h.chain_depth = IFNULL(p.chain_depth, 0) + 1;

UPDATE historia_clinica h
INNER JOIN historia_clinica p ON p.id = h.hc_parent_id
SET h.hc_root_id = COALESCE(p.hc_root_id, p.id),
    h.chain_depth = IFNULL(p.chain_depth, 0) + 1;

UPDATE historia_clinica h
INNER JOIN historia_clinica p ON p.id = h.hc_parent_id
SET h.hc_root_id = COALESCE(p.hc_root_id, p.id),
    h.chain_depth = IFNULL(p.chain_depth, 0) + 1;

UPDATE historia_clinica h
INNER JOIN historia_clinica p ON p.id = h.hc_parent_id
SET h.hc_root_id = COALESCE(p.hc_root_id, p.id),
    h.chain_depth = IFNULL(p.chain_depth, 0) + 1;

UPDATE historia_clinica h
INNER JOIN historia_clinica p ON p.id = h.hc_parent_id
SET h.hc_root_id = COALESCE(p.hc_root_id, p.id),
    h.chain_depth = IFNULL(p.chain_depth, 0) + 1;

UPDATE historia_clinica h
INNER JOIN historia_clinica p ON p.id = h.hc_parent_id
SET h.hc_root_id = COALESCE(p.hc_root_id, p.id),
    h.chain_depth = IFNULL(p.chain_depth, 0) + 1;

UPDATE historia_clinica h
INNER JOIN historia_clinica p ON p.id = h.hc_parent_id
SET h.hc_root_id = COALESCE(p.hc_root_id, p.id),
    h.chain_depth = IFNULL(p.chain_depth, 0) + 1;

UPDATE historia_clinica h
INNER JOIN historia_clinica p ON p.id = h.hc_parent_id
SET h.hc_root_id = COALESCE(p.hc_root_id, p.id),
    h.chain_depth = IFNULL(p.chain_depth, 0) + 1;

UPDATE historia_clinica h
INNER JOIN historia_clinica p ON p.id = h.hc_parent_id
SET h.hc_root_id = COALESCE(p.hc_root_id, p.id),
    h.chain_depth = IFNULL(p.chain_depth, 0) + 1;

UPDATE historia_clinica h
INNER JOIN historia_clinica p ON p.id = h.hc_parent_id
SET h.hc_root_id = COALESCE(p.hc_root_id, p.id),
    h.chain_depth = IFNULL(p.chain_depth, 0) + 1;

UPDATE historia_clinica h
INNER JOIN historia_clinica p ON p.id = h.hc_parent_id
SET h.hc_root_id = COALESCE(p.hc_root_id, p.id),
    h.chain_depth = IFNULL(p.chain_depth, 0) + 1;

-- Orfandad: parent inexistente -> anular y resetear a raiz propia
UPDATE historia_clinica h
LEFT JOIN historia_clinica p ON p.id = h.hc_parent_id
SET h.hc_parent_id = NULL,
    h.hc_root_id = h.id,
    h.chain_depth = 0,
    h.chain_status = 'anulada'
WHERE h.hc_parent_id IS NOT NULL
  AND p.id IS NULL;

-- ------------------------------------------------------------
-- 7) Unicidad opcional por evento agenda (solo si aplica regla 1 HC por evento)
-- ------------------------------------------------------------
-- ALTER TABLE historia_clinica
--   ADD UNIQUE INDEX uk_hc_agenda_evento (agenda_contrato_id);

COMMIT;

SELECT 'OK migracion HC cadena contrato' AS estado;
