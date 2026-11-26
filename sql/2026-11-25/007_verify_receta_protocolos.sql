-- 2026-11-25 | Verificación (SOLO LECTURA): columnas nuevas de receta_protocolos. Debe devolver 3 filas.
SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'receta_protocolos'
  AND COLUMN_NAME IN ('autor_medico_id', 'creado_por_nombre', 'actualizado_por_nombre')
ORDER BY COLUMN_NAME;
-- Protocolos activos por alcance (medico = personal; especialidad; general = todos los médicos).
SELECT CASE WHEN medico_id IS NOT NULL THEN 'medico'
            WHEN TRIM(COALESCE(especialidad, '')) <> '' THEN 'especialidad'
            ELSE 'general' END AS alcance,
       COUNT(*) AS total
FROM receta_protocolos WHERE activo = 1 GROUP BY 1;
