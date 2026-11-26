-- 2026-11-25 | Informativo (SOLO LECTURA): protocolos de receta activos por alcance.
-- medico = personal; especialidad = de esa especialidad; general = todos los médicos.
SELECT CASE WHEN medico_id IS NOT NULL THEN 'medico'
            WHEN TRIM(COALESCE(especialidad, '')) <> '' THEN 'especialidad'
            ELSE 'general' END AS alcance,
       COUNT(*) AS total
FROM receta_protocolos
WHERE activo = 1
GROUP BY alcance;
