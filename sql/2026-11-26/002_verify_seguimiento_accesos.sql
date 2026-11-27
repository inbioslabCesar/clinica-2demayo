-- 2026-11-26 | Verificación (SOLO LECTURA): tabla del registro de accesos de Seguimiento clínico. Debe devolver 10 filas (una por columna).
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'seguimiento_clinico_accesos'
ORDER BY ORDINAL_POSITION;
