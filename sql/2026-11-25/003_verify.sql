-- 2026-11-25 · Verificación de Reevaluación (Fase 1). Solo lectura.

-- Debe devolver 2 filas.
SELECT table_name
FROM information_schema.tables
WHERE table_schema = DATABASE()
  AND table_name IN ('hc_reevaluaciones', 'hc_reevaluaciones_eventos');

-- Debe incluir uq_hcr_abierta (UNIQUE consulta_origen_id, abierta) y los 5 índices idx_hcr_*.
SELECT index_name, non_unique, GROUP_CONCAT(column_name ORDER BY seq_in_index) AS columnas
FROM information_schema.statistics
WHERE table_schema = DATABASE() AND table_name = 'hc_reevaluaciones'
GROUP BY index_name, non_unique;

-- Conteos (0 en una instalación nueva).
SELECT
  (SELECT COUNT(*) FROM hc_reevaluaciones) AS reevaluaciones,
  (SELECT COUNT(*) FROM hc_reevaluaciones_eventos) AS eventos;
