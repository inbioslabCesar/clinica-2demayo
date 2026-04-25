-- 20_migracion_ordenes_hc_id.sql
-- Fase 3: vincular ordenes_laboratorio y ordenes_imagen al nodo exacto de HC.
-- Prerequisito: script 18 (columnas de cadena en historia_clinica) ya ejecutado.
--
-- Efecto:
--   • Agrega historia_clinica_id INT NULL en ambas tablas de ordenes.
--   • Backfill: resuelve el id de HC via consulta_id (join directo).
--   • Crea indice para queries de timeline por HC.

-- ============================================================
-- ordenes_laboratorio
-- ============================================================

ALTER TABLE ordenes_laboratorio
  ADD COLUMN historia_clinica_id INT NULL
    COMMENT 'Nodo HC al que pertenece esta orden (FK a historia_clinica.id)',
  ADD INDEX idx_ol_hc_id (historia_clinica_id);

-- Backfill: resolver por consulta_id
UPDATE ordenes_laboratorio ol
INNER JOIN historia_clinica h ON h.consulta_id = ol.consulta_id
SET ol.historia_clinica_id = h.id
WHERE ol.historia_clinica_id IS NULL
  AND ol.consulta_id IS NOT NULL
  AND ol.consulta_id > 0;

-- ============================================================
-- ordenes_imagen
-- ============================================================

ALTER TABLE ordenes_imagen
  ADD COLUMN historia_clinica_id INT NULL
    COMMENT 'Nodo HC al que pertenece esta orden (FK a historia_clinica.id)',
  ADD INDEX idx_oi_hc_id (historia_clinica_id);

-- Backfill: resolver por consulta_id
UPDATE ordenes_imagen oi
INNER JOIN historia_clinica h ON h.consulta_id = oi.consulta_id
SET oi.historia_clinica_id = h.id
WHERE oi.historia_clinica_id IS NULL
  AND oi.consulta_id IS NOT NULL
  AND oi.consulta_id > 0;

-- ============================================================
-- Verificacion rapida
-- ============================================================

SELECT
  'ordenes_laboratorio' AS tabla,
  COUNT(*) AS total,
  SUM(historia_clinica_id IS NOT NULL) AS con_hc_id,
  SUM(historia_clinica_id IS NULL)     AS sin_hc_id
FROM ordenes_laboratorio

UNION ALL

SELECT
  'ordenes_imagen' AS tabla,
  COUNT(*) AS total,
  SUM(historia_clinica_id IS NOT NULL) AS con_hc_id,
  SUM(historia_clinica_id IS NULL)     AS sin_hc_id
FROM ordenes_imagen;
