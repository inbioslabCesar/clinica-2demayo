-- 91_cleanup_residuos_post_cotizacion.sql
-- Limpieza complementaria post-cotizaciones para entorno de pruebas
--
-- Cubre remanentes comunes que no siempre están ligados por FK directa:
--   1) Consultas huérfanas de origen 'cotizador' sin fila en cotizaciones_detalle
--   2) Ingresos de contratos/abonos que siguen apareciendo en Reporte de Caja
--
-- Modo seguro:
--   - p_apply = 0 -> ROLLBACK (solo preview)
--   - p_apply = 1 -> COMMIT

DELIMITER $$

DROP PROCEDURE IF EXISTS sp_cleanup_residuos_post_cotizacion $$
CREATE PROCEDURE sp_cleanup_residuos_post_cotizacion(IN p_apply TINYINT)
BEGIN
    DECLARE v_old_fk INT DEFAULT 1;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SET FOREIGN_KEY_CHECKS = v_old_fk;
        RESIGNAL;
    END;

    START TRANSACTION;

    SET v_old_fk = @@FOREIGN_KEY_CHECKS;
    SET FOREIGN_KEY_CHECKS = 0;

    DROP TEMPORARY TABLE IF EXISTS tmp_cons_orfanas_cotizador;
    DROP TEMPORARY TABLE IF EXISTS tmp_preview_residuos;

    CREATE TEMPORARY TABLE tmp_cons_orfanas_cotizador (
        id INT PRIMARY KEY
    ) ENGINE=Memory;

    INSERT INTO tmp_cons_orfanas_cotizador (id)
    SELECT q.id
    FROM consultas q
    WHERE q.origen_creacion = 'cotizador'
      AND NOT EXISTS (
          SELECT 1
          FROM cotizaciones_detalle cd
          WHERE cd.consulta_id = q.id
      );

    CREATE TEMPORARY TABLE tmp_preview_residuos (
        tabla VARCHAR(80) NOT NULL,
        registros BIGINT NOT NULL
    ) ENGINE=Memory;

    INSERT INTO tmp_preview_residuos (tabla, registros)
    SELECT 'consultas_orfanas_cotizador', COUNT(*)
    FROM tmp_cons_orfanas_cotizador;

    INSERT INTO tmp_preview_residuos (tabla, registros)
    SELECT 'ingresos_diarios_contrato_abono', COUNT(*)
    FROM ingresos_diarios
    WHERE tipo_ingreso = 'contrato_abono'
       OR LOWER(COALESCE(referencia_tabla, '')) = 'paciente_seguimiento_pagos';

    SELECT tabla, registros
    FROM tmp_preview_residuos
    ORDER BY tabla;

    -- Borrar trazas ligadas a las consultas huérfanas
    DELETE tr
    FROM triaje tr
    INNER JOIN tmp_cons_orfanas_cotizador t ON t.id = tr.consulta_id;

    DELETE rc
    FROM recordatorios_consultas rc
    INNER JOIN tmp_cons_orfanas_cotizador t ON t.id = rc.consulta_id;

    DELETE hc
    FROM historia_clinica hc
    INNER JOIN tmp_cons_orfanas_cotizador t ON t.id = hc.consulta_id;

    -- Archivos de documentos externos enlazados a ordenes de lab de estas consultas
    DELETE dea
    FROM documentos_externos_archivos dea
    INNER JOIN documentos_externos_paciente dep ON dep.id = dea.documento_id
    INNER JOIN ordenes_laboratorio ol ON ol.id = dep.orden_id
    INNER JOIN tmp_cons_orfanas_cotizador t ON t.id = ol.consulta_id;

    DELETE dep
    FROM documentos_externos_paciente dep
    INNER JOIN ordenes_laboratorio ol ON ol.id = dep.orden_id
    INNER JOIN tmp_cons_orfanas_cotizador t ON t.id = ol.consulta_id;

    -- Resultados e imágenes de las consultas huérfanas
    DELETE rl
    FROM resultados_laboratorio rl
    INNER JOIN tmp_cons_orfanas_cotizador t ON t.id = rl.consulta_id;

    DELETE oia
    FROM ordenes_imagen_archivos oia
    INNER JOIN ordenes_imagen oi ON oi.id = oia.orden_id
    INNER JOIN tmp_cons_orfanas_cotizador t ON t.id = oi.consulta_id;

    DELETE ol
    FROM ordenes_laboratorio ol
    INNER JOIN tmp_cons_orfanas_cotizador t ON t.id = ol.consulta_id;

    DELETE oi
    FROM ordenes_imagen oi
    INNER JOIN tmp_cons_orfanas_cotizador t ON t.id = oi.consulta_id;

    DELETE q
    FROM consultas q
    INNER JOIN tmp_cons_orfanas_cotizador t ON t.id = q.id;

    -- Borrar ingresos de abonos de contrato del reporte de caja
    DELETE FROM ingresos_diarios
    WHERE tipo_ingreso = 'contrato_abono'
       OR LOWER(COALESCE(referencia_tabla, '')) = 'paciente_seguimiento_pagos';

    IF p_apply = 1 THEN
        COMMIT;
        SET FOREIGN_KEY_CHECKS = v_old_fk;

        -- Reiniciar AUTO_INCREMENT solo si la tabla quedo vacia
        IF (SELECT COUNT(*) FROM triaje) = 0 THEN ALTER TABLE triaje AUTO_INCREMENT = 1; END IF;
        IF (SELECT COUNT(*) FROM recordatorios_consultas) = 0 THEN ALTER TABLE recordatorios_consultas AUTO_INCREMENT = 1; END IF;
        IF (SELECT COUNT(*) FROM historia_clinica) = 0 THEN ALTER TABLE historia_clinica AUTO_INCREMENT = 1; END IF;
        IF (SELECT COUNT(*) FROM documentos_externos_archivos) = 0 THEN ALTER TABLE documentos_externos_archivos AUTO_INCREMENT = 1; END IF;
        IF (SELECT COUNT(*) FROM documentos_externos_paciente) = 0 THEN ALTER TABLE documentos_externos_paciente AUTO_INCREMENT = 1; END IF;
        IF (SELECT COUNT(*) FROM resultados_laboratorio) = 0 THEN ALTER TABLE resultados_laboratorio AUTO_INCREMENT = 1; END IF;
        IF (SELECT COUNT(*) FROM ordenes_imagen_archivos) = 0 THEN ALTER TABLE ordenes_imagen_archivos AUTO_INCREMENT = 1; END IF;
        IF (SELECT COUNT(*) FROM ordenes_laboratorio) = 0 THEN ALTER TABLE ordenes_laboratorio AUTO_INCREMENT = 1; END IF;
        IF (SELECT COUNT(*) FROM ordenes_imagen) = 0 THEN ALTER TABLE ordenes_imagen AUTO_INCREMENT = 1; END IF;
        IF (SELECT COUNT(*) FROM consultas) = 0 THEN ALTER TABLE consultas AUTO_INCREMENT = 1; END IF;
        IF (SELECT COUNT(*) FROM ingresos_diarios) = 0 THEN ALTER TABLE ingresos_diarios AUTO_INCREMENT = 1; END IF;

        SELECT 'COMMIT aplicado' AS resultado;
    ELSE
        ROLLBACK;
        SET FOREIGN_KEY_CHECKS = v_old_fk;
        SELECT 'ROLLBACK aplicado (solo simulacion)' AS resultado;
    END IF;
END $$

DELIMITER ;

-- Ejemplos:
-- CALL sp_cleanup_residuos_post_cotizacion(0);
-- CALL sp_cleanup_residuos_post_cotizacion(1);
