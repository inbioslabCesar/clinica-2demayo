-- 2026-11-25 | Verificación (SOLO LECTURA): columnas de publicación de archivos del portal del paciente.
-- Debe devolver 4 filas (una por columna). Si una tabla no existe aún en esta clínica, faltará su fila hasta su primer uso.
SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, COLUMN_DEFAULT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND ((TABLE_NAME IN ('ordenes_imagen_archivos', 'documentos_externos_archivos') AND COLUMN_NAME = 'publicar_paciente')
    OR (TABLE_NAME = 'ordenes_imagen_archivos' AND COLUMN_NAME = 'titulo')
    OR (TABLE_NAME = 'documentos_externos_paciente' AND COLUMN_NAME = 'laboratorio_origen'))
ORDER BY TABLE_NAME, COLUMN_NAME;
-- Archivos publicados hoy (0 al principio: nada se publica retroactivamente).
SELECT (SELECT COUNT(*) FROM ordenes_imagen_archivos WHERE publicar_paciente = 1) AS imagen_publicados,
       (SELECT COUNT(*) FROM documentos_externos_archivos WHERE publicar_paciente = 1) AS externos_publicados;
-- Interruptores del Engineer (sin filas = ambos activos).
SELECT clave, valor FROM paciente_portal_config WHERE clave IN ('publicar_laboratorio', 'publicar_imagenologia');
