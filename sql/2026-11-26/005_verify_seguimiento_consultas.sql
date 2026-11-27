-- 2026-11-26 | Verificación (SOLO LECTURA): tabla de consultas generadas desde Seguimiento clínico. Debe devolver 11 filas (una por columna).
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'seguimiento_clinico_consultas'
ORDER BY ORDINAL_POSITION;
