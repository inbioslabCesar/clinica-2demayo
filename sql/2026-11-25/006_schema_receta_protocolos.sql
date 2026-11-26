-- 2026-11-25 | Protocolos de receta editables y compartidos | SOLO ADITIVO (3 columnas, sin borrar ni modificar datos)
-- Qué hace (tabla receta_protocolos):
--   autor_medico_id        -> médico (medicos.id) que creó el protocolo; permite que el autor lo elimine
--   creado_por_nombre      -> nombre de quien lo creó (para mostrarlo en el tooltip)
--   actualizado_por_nombre -> nombre de quien lo editó por última vez (protocolos compartidos)
-- Los protocolos existentes quedan con NULL: sigue funcionando; solo el administrador (o el médico dueño si es personal) puede eliminarlos.
-- Es seguro repetirlo: cada columna se agrega solo si falta. Si la tabla aún no existe (se crea al primer uso) no hace nada.
-- IMPORTANTE (no viaja en el build): se aplica a la BD de cada clínica. Equivale al actualizador de esquema (columnas en db/esquema_referencia/esquema_referencia.json).

DROP PROCEDURE IF EXISTS tmp_agregar_columna_protocolos;
DELIMITER //
CREATE PROCEDURE tmp_agregar_columna_protocolos(IN p_tabla VARCHAR(64), IN p_columna VARCHAR(64), IN p_definicion VARCHAR(255))
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

CALL tmp_agregar_columna_protocolos('receta_protocolos', 'autor_medico_id', 'INT NULL');
CALL tmp_agregar_columna_protocolos('receta_protocolos', 'creado_por_nombre', 'VARCHAR(150) NULL');
CALL tmp_agregar_columna_protocolos('receta_protocolos', 'actualizado_por_nombre', 'VARCHAR(150) NULL');

DROP PROCEDURE tmp_agregar_columna_protocolos;
