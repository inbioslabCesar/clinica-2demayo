-- 2026-11-25 | Portal del paciente: publicar archivos subidos (PDF/imagen) | SOLO ADITIVO (4 columnas, sin borrar ni modificar datos)
-- Qué hace:
--   ordenes_imagen_archivos.publicar_paciente    -> 1 = el archivo se muestra en el portal del paciente (por defecto 0: nada se publica retroactivamente)
--   ordenes_imagen_archivos.titulo               -> título legible del archivo para el paciente (opcional)
--   documentos_externos_archivos.publicar_paciente -> igual, para resultados externos / de laboratorios de referencia
--   documentos_externos_paciente.laboratorio_origen -> laboratorio que emitió el resultado (opcional)
-- Es seguro repetirlo: cada columna se agrega solo si falta.
-- Equivale a lo que hace el actualizador de esquema (las columnas están en db/esquema_referencia/esquema_referencia.json).
-- IMPORTANTE (no viaja en el build): se aplica a la BD de cada clínica. Si la tabla aún no existe (se crea al primer uso), no hace nada.

DROP PROCEDURE IF EXISTS tmp_agregar_columna_portal;
DELIMITER //
CREATE PROCEDURE tmp_agregar_columna_portal(IN p_tabla VARCHAR(64), IN p_columna VARCHAR(64), IN p_definicion VARCHAR(255))
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_tabla)
     AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_tabla AND COLUMN_NAME = p_columna) THEN
    SET @sql_tmp = CONCAT('ALTER TABLE `', p_tabla, '` ADD COLUMN `', p_columna, '` ', p_definicion);
    PREPARE stmt_tmp FROM @sql_tmp;
    EXECUTE stmt_tmp;
    DEALLOCATE PREPARE stmt_tmp;
  END IF;
END//
DELIMITER ;

CALL tmp_agregar_columna_portal('ordenes_imagen_archivos', 'publicar_paciente', 'TINYINT(1) NOT NULL DEFAULT 0');
CALL tmp_agregar_columna_portal('ordenes_imagen_archivos', 'titulo', 'VARCHAR(200) NULL');
CALL tmp_agregar_columna_portal('documentos_externos_archivos', 'publicar_paciente', 'TINYINT(1) NOT NULL DEFAULT 0');
CALL tmp_agregar_columna_portal('documentos_externos_paciente', 'laboratorio_origen', 'VARCHAR(120) NULL');

DROP PROCEDURE tmp_agregar_columna_portal;
