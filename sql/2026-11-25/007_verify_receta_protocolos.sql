-- 2026-11-25 | Verificación (SOLO LECTURA): columnas nuevas de receta_protocolos. Debe devolver 3 filas.
-- Ejecutar SOLO esta consulta (phpMyAdmin: pestaña SQL). Si faltan filas, aplicar 006_schema_receta_protocolos.sql.
-- El conteo por alcance está aparte en 008: phpMyAdmin falla al mostrar dos consultas juntas si una lee information_schema.
SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'receta_protocolos'
  AND COLUMN_NAME IN ('autor_medico_id', 'creado_por_nombre', 'actualizado_por_nombre')
ORDER BY COLUMN_NAME;
