-- 91_cleanup_residuos_post_cotizacion.sql
-- Limpieza complementaria post-cotizaciones para entorno de pruebas
--
-- Cubre remanentes comunes que no siempre están ligados por FK directa:
--   1) Consultas huérfanas de origen 'cotizador' sin fila en cotizaciones_detalle
--   2) Ingresos de contratos/abonos que siguen apareciendo en Reporte de Caja
--   3) Produccion medica detalle ligada a consultas huerfanas (si la tabla existe)
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
    DROP TEMPORARY TABLE IF EXISTS tmp_pmd_residuos;
    DROP TEMPORARY TABLE IF EXISTS tmp_te_residuos;
    DROP TEMPORARY TABLE IF EXISTS tmp_tei_residuos;
    DROP TEMPORARY TABLE IF EXISTS tmp_ted_residuos;
    DROP TEMPORARY TABLE IF EXISTS tmp_tedose_residuos;
    DROP TEMPORARY TABLE IF EXISTS tmp_teevt_residuos;
    DROP TEMPORARY TABLE IF EXISTS tmp_hc_sync_residuos;
    DROP TEMPORARY TABLE IF EXISTS tmp_hc_sync_pend_residuos;
    DROP TEMPORARY TABLE IF EXISTS tmp_pacientes_residuos;
    DROP TEMPORARY TABLE IF EXISTS tmp_contratos_residuos;
    DROP TEMPORARY TABLE IF EXISTS tmp_psp_residuos;
    DROP TEMPORARY TABLE IF EXISTS tmp_cps_residuos;
    DROP TEMPORARY TABLE IF EXISTS tmp_pcd_residuos;
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

    CREATE TEMPORARY TABLE tmp_pacientes_residuos (
        id INT PRIMARY KEY
    ) ENGINE=Memory;

    INSERT IGNORE INTO tmp_pacientes_residuos (id)
    SELECT DISTINCT q.paciente_id
    FROM consultas q
    INNER JOIN tmp_cons_orfanas_cotizador t ON t.id = q.id
    WHERE q.paciente_id IS NOT NULL AND q.paciente_id > 0;

    CREATE TEMPORARY TABLE tmp_contratos_residuos (
        id BIGINT UNSIGNED PRIMARY KEY
    ) ENGINE=Memory;

    INSERT IGNORE INTO tmp_contratos_residuos (id)
    SELECT cp.id
    FROM contratos_paciente cp
    INNER JOIN tmp_pacientes_residuos tp ON tp.id = cp.paciente_id;

    CREATE TEMPORARY TABLE tmp_psp_residuos (
        id BIGINT UNSIGNED PRIMARY KEY
    ) ENGINE=Memory;

    INSERT IGNORE INTO tmp_psp_residuos (id)
    SELECT psp.id
    FROM paciente_seguimiento_pagos psp
    INNER JOIN tmp_contratos_residuos tcr ON tcr.id = psp.contrato_paciente_id;

    CREATE TEMPORARY TABLE tmp_cps_residuos (
        id BIGINT UNSIGNED PRIMARY KEY
    ) ENGINE=Memory;

    INSERT IGNORE INTO tmp_cps_residuos (id)
    SELECT cps.id
    FROM contratos_paciente_servicios cps
    INNER JOIN tmp_contratos_residuos tcr ON tcr.id = cps.contrato_paciente_id;

    CREATE TEMPORARY TABLE tmp_pcd_residuos (
        id BIGINT UNSIGNED PRIMARY KEY
    ) ENGINE=Memory;

    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = DATABASE()
          AND table_name = 'produccion_contrato_detalle'
    ) THEN
        INSERT IGNORE INTO tmp_pcd_residuos (id)
        SELECT pcd.id
        FROM produccion_contrato_detalle pcd
        INNER JOIN tmp_contratos_residuos tcr ON tcr.id = pcd.contrato_paciente_id;
    END IF;

    CREATE TEMPORARY TABLE tmp_pmd_residuos (
        id INT PRIMARY KEY
    ) ENGINE=Memory;

    CREATE TEMPORARY TABLE tmp_te_residuos (
        id INT PRIMARY KEY
    ) ENGINE=Memory;

    CREATE TEMPORARY TABLE tmp_tei_residuos (
        id INT PRIMARY KEY
    ) ENGINE=Memory;

    CREATE TEMPORARY TABLE tmp_ted_residuos (
        id INT PRIMARY KEY
    ) ENGINE=Memory;

    CREATE TEMPORARY TABLE tmp_tedose_residuos (
        id BIGINT UNSIGNED PRIMARY KEY
    ) ENGINE=Memory;

    CREATE TEMPORARY TABLE tmp_teevt_residuos (
        id BIGINT UNSIGNED PRIMARY KEY
    ) ENGINE=Memory;

    CREATE TEMPORARY TABLE tmp_hc_sync_residuos (
        id INT PRIMARY KEY
    ) ENGINE=Memory;

    CREATE TEMPORARY TABLE tmp_hc_sync_pend_residuos (
        id INT PRIMARY KEY
    ) ENGINE=Memory;

    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = DATABASE()
          AND table_name = 'produccion_medica_detalle'
    ) THEN
        INSERT IGNORE INTO tmp_pmd_residuos (id)
        SELECT pmd.id
        FROM produccion_medica_detalle pmd
        INNER JOIN tmp_cons_orfanas_cotizador t ON t.id = pmd.consulta_id;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = DATABASE()
          AND table_name = 'tratamientos_enfermeria'
    ) THEN
        INSERT IGNORE INTO tmp_te_residuos (id)
        SELECT te.id
        FROM tratamientos_enfermeria te
        INNER JOIN tmp_cons_orfanas_cotizador t ON t.id = te.consulta_id;

        -- Tambien incluir tratamientos cuyo consulta_id apunta a una consulta inexistente
        -- para poder limpiar toda la cadena (items/diaria/dosis/eventos).
        INSERT IGNORE INTO tmp_te_residuos (id)
        SELECT te.id
        FROM tratamientos_enfermeria te
        LEFT JOIN consultas q ON q.id = te.consulta_id
        WHERE q.id IS NULL;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = DATABASE()
          AND table_name = 'tratamientos_enfermeria_items'
    ) THEN
        INSERT IGNORE INTO tmp_tei_residuos (id)
        SELECT tei.id
        FROM tratamientos_enfermeria_items tei
        INNER JOIN tmp_te_residuos tte ON tte.id = tei.tratamiento_id;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = DATABASE()
          AND table_name = 'tratamientos_ejecucion_diaria'
    ) THEN
        INSERT IGNORE INTO tmp_ted_residuos (id)
        SELECT ted.id
        FROM tratamientos_ejecucion_diaria ted
        INNER JOIN tmp_tei_residuos ttei ON ttei.id = ted.tratamiento_item_id;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = DATABASE()
          AND table_name = 'tratamientos_ejecucion_dosis'
    ) THEN
        INSERT IGNORE INTO tmp_tedose_residuos (id)
        SELECT td.id
        FROM tratamientos_ejecucion_dosis td
        INNER JOIN tmp_ted_residuos tted ON tted.id = td.ejecucion_diaria_id;

        INSERT IGNORE INTO tmp_tedose_residuos (id)
        SELECT td.id
        FROM tratamientos_ejecucion_dosis td
        LEFT JOIN tratamientos_enfermeria te ON te.id = td.tratamiento_id
        LEFT JOIN tratamientos_enfermeria_items tei ON tei.id = td.tratamiento_item_id
        LEFT JOIN tratamientos_ejecucion_diaria ted ON ted.id = td.ejecucion_diaria_id
        WHERE te.id IS NULL OR tei.id IS NULL OR ted.id IS NULL;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = DATABASE()
          AND table_name = 'tratamientos_ejecucion_eventos'
    ) THEN
        INSERT IGNORE INTO tmp_teevt_residuos (id)
        SELECT teev.id
        FROM tratamientos_ejecucion_eventos teev
        INNER JOIN tmp_ted_residuos tted ON tted.id = teev.ejecucion_diaria_id;

        INSERT IGNORE INTO tmp_teevt_residuos (id)
        SELECT teev.id
        FROM tratamientos_ejecucion_eventos teev
        INNER JOIN tmp_tedose_residuos ttdo ON ttdo.id = teev.dosis_programada_id;

        INSERT IGNORE INTO tmp_teevt_residuos (id)
        SELECT teev.id
        FROM tratamientos_ejecucion_eventos teev
        LEFT JOIN tratamientos_enfermeria te ON te.id = teev.tratamiento_id
        LEFT JOIN tratamientos_ejecucion_diaria ted ON ted.id = teev.ejecucion_diaria_id
        LEFT JOIN tratamientos_ejecucion_dosis tdo
               ON tdo.id = teev.dosis_programada_id
        WHERE te.id IS NULL
           OR ted.id IS NULL
           OR (teev.dosis_programada_id IS NOT NULL AND tdo.id IS NULL);
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = DATABASE()
          AND table_name = 'hc_receta_cotizacion_sync'
    ) THEN
        INSERT IGNORE INTO tmp_hc_sync_residuos (id)
        SELECT hs.id
        FROM hc_receta_cotizacion_sync hs
        INNER JOIN tmp_cons_orfanas_cotizador t ON t.id = hs.consulta_id;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = DATABASE()
          AND table_name = 'hc_receta_cotizacion_items_pendientes'
    ) THEN
        INSERT IGNORE INTO tmp_hc_sync_pend_residuos (id)
        SELECT hsp.id
        FROM hc_receta_cotizacion_items_pendientes hsp
        INNER JOIN tmp_cons_orfanas_cotizador t ON t.id = hsp.consulta_id;
    END IF;

    CREATE TEMPORARY TABLE tmp_preview_residuos (
        tabla VARCHAR(80) NOT NULL,
        registros BIGINT NOT NULL
    ) ENGINE=Memory;

    INSERT INTO tmp_preview_residuos (tabla, registros)
    SELECT 'consultas_orfanas_cotizador', COUNT(*)
    FROM tmp_cons_orfanas_cotizador;

    INSERT INTO tmp_preview_residuos (tabla, registros)
    SELECT 'pacientes_residuos', COUNT(*)
    FROM tmp_pacientes_residuos;

    INSERT INTO tmp_preview_residuos (tabla, registros)
    SELECT 'contratos_paciente_residuos', COUNT(*)
    FROM tmp_contratos_residuos;

    INSERT INTO tmp_preview_residuos (tabla, registros)
    SELECT 'paciente_seguimiento_pagos_residuos', COUNT(*)
    FROM tmp_psp_residuos;

    INSERT INTO tmp_preview_residuos (tabla, registros)
    SELECT 'contratos_paciente_servicios_residuos', COUNT(*)
    FROM tmp_cps_residuos;

    INSERT INTO tmp_preview_residuos (tabla, registros)
    SELECT 'produccion_contrato_detalle_residuos', COUNT(*)
    FROM tmp_pcd_residuos;

    INSERT INTO tmp_preview_residuos (tabla, registros)
    SELECT 'ingresos_diarios_contrato_abono', COUNT(*)
    FROM ingresos_diarios
    WHERE tipo_ingreso = 'contrato_abono'
       OR LOWER(COALESCE(referencia_tabla, '')) = 'paciente_seguimiento_pagos';

    INSERT INTO tmp_preview_residuos (tabla, registros)
    SELECT 'produccion_medica_detalle_residuos', COUNT(*)
    FROM tmp_pmd_residuos;

    INSERT INTO tmp_preview_residuos (tabla, registros)
    SELECT 'tratamientos_enfermeria_residuos', COUNT(*)
    FROM tmp_te_residuos;

    INSERT INTO tmp_preview_residuos (tabla, registros)
    SELECT 'tratamientos_enfermeria_items_residuos', COUNT(*)
    FROM tmp_tei_residuos;

    INSERT INTO tmp_preview_residuos (tabla, registros)
    SELECT 'tratamientos_ejecucion_diaria_residuos', COUNT(*)
    FROM tmp_ted_residuos;

    INSERT INTO tmp_preview_residuos (tabla, registros)
    SELECT 'tratamientos_ejecucion_dosis_residuos', COUNT(*)
    FROM tmp_tedose_residuos;

    INSERT INTO tmp_preview_residuos (tabla, registros)
    SELECT 'tratamientos_ejecucion_eventos_residuos', COUNT(*)
    FROM tmp_teevt_residuos;

    INSERT INTO tmp_preview_residuos (tabla, registros)
    SELECT 'hc_receta_sync_residuos', COUNT(*)
    FROM tmp_hc_sync_residuos;

    INSERT INTO tmp_preview_residuos (tabla, registros)
    SELECT 'hc_receta_sync_items_pend_residuos', COUNT(*)
    FROM tmp_hc_sync_pend_residuos;

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

    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = DATABASE()
          AND table_name = 'tratamientos_ejecucion_diaria'
    ) THEN
        IF EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = DATABASE()
              AND table_name = 'tratamientos_ejecucion_eventos'
        ) THEN
            DELETE teev
            FROM tratamientos_ejecucion_eventos teev
            INNER JOIN tmp_teevt_residuos tteev ON tteev.id = teev.id;
        END IF;

        IF EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = DATABASE()
              AND table_name = 'tratamientos_ejecucion_dosis'
        ) THEN
            DELETE tdo
            FROM tratamientos_ejecucion_dosis tdo
            INNER JOIN tmp_tedose_residuos ttdo ON ttdo.id = tdo.id;
        END IF;

        DELETE ted
        FROM tratamientos_ejecucion_diaria ted
        INNER JOIN tmp_ted_residuos tted ON tted.id = ted.id;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = DATABASE()
          AND table_name = 'tratamientos_enfermeria_items'
    ) THEN
        DELETE tei
        FROM tratamientos_enfermeria_items tei
        INNER JOIN tmp_tei_residuos ttei ON ttei.id = tei.id;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = DATABASE()
          AND table_name = 'tratamientos_enfermeria'
    ) THEN
        DELETE te
        FROM tratamientos_enfermeria te
        INNER JOIN tmp_te_residuos tte ON tte.id = te.id;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = DATABASE()
          AND table_name = 'hc_receta_cotizacion_items_pendientes'
    ) THEN
        DELETE hsp
        FROM hc_receta_cotizacion_items_pendientes hsp
        INNER JOIN tmp_hc_sync_pend_residuos thsp ON thsp.id = hsp.id;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = DATABASE()
          AND table_name = 'hc_receta_cotizacion_sync'
    ) THEN
        DELETE hs
        FROM hc_receta_cotizacion_sync hs
        INNER JOIN tmp_hc_sync_residuos ths ON ths.id = hs.id;
    END IF;

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

    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = DATABASE()
          AND table_name = 'produccion_medica_detalle'
    ) THEN
        DELETE pmd
        FROM produccion_medica_detalle pmd
        INNER JOIN tmp_pmd_residuos tpmd ON tpmd.id = pmd.id;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = DATABASE()
          AND table_name = 'produccion_contrato_detalle'
    ) THEN
        DELETE pcd
        FROM produccion_contrato_detalle pcd
        INNER JOIN tmp_pcd_residuos tpcd ON tpcd.id = pcd.id;
    END IF;

    DELETE cc
    FROM contratos_consumos cc
    LEFT JOIN tmp_cons_orfanas_cotizador tco ON tco.id = cc.consulta_id
    LEFT JOIN tmp_contratos_residuos tcr ON tcr.id = cc.contrato_paciente_id
    WHERE tco.id IS NOT NULL OR tcr.id IS NOT NULL;

    DELETE ac
    FROM agenda_contrato ac
    LEFT JOIN tmp_cons_orfanas_cotizador tco ON tco.id = ac.consulta_id
    LEFT JOIN tmp_contratos_residuos tcr ON tcr.id = ac.contrato_paciente_id
    WHERE tco.id IS NOT NULL OR tcr.id IS NOT NULL;

    DELETE psp
    FROM paciente_seguimiento_pagos psp
    INNER JOIN tmp_psp_residuos tpsp ON tpsp.id = psp.id;

    DELETE cps
    FROM contratos_paciente_servicios cps
    INNER JOIN tmp_cps_residuos tcps ON tcps.id = cps.id;

    DELETE cp
    FROM contratos_paciente cp
    INNER JOIN tmp_contratos_residuos tcr ON tcr.id = cp.id;

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
        IF EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = DATABASE()
              AND table_name = 'produccion_medica_detalle'
        ) THEN
            IF (SELECT COUNT(*) FROM produccion_medica_detalle) = 0 THEN ALTER TABLE produccion_medica_detalle AUTO_INCREMENT = 1; END IF;
        END IF;
        IF EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = DATABASE()
              AND table_name = 'tratamientos_enfermeria'
        ) THEN
            IF (SELECT COUNT(*) FROM tratamientos_enfermeria) = 0 THEN ALTER TABLE tratamientos_enfermeria AUTO_INCREMENT = 1; END IF;
        END IF;
        IF EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = DATABASE()
              AND table_name = 'tratamientos_enfermeria_items'
        ) THEN
            IF (SELECT COUNT(*) FROM tratamientos_enfermeria_items) = 0 THEN ALTER TABLE tratamientos_enfermeria_items AUTO_INCREMENT = 1; END IF;
        END IF;
        IF EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = DATABASE()
              AND table_name = 'tratamientos_ejecucion_diaria'
        ) THEN
            IF (SELECT COUNT(*) FROM tratamientos_ejecucion_diaria) = 0 THEN ALTER TABLE tratamientos_ejecucion_diaria AUTO_INCREMENT = 1; END IF;
        END IF;
        IF EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = DATABASE()
              AND table_name = 'tratamientos_ejecucion_dosis'
        ) THEN
            IF (SELECT COUNT(*) FROM tratamientos_ejecucion_dosis) = 0 THEN ALTER TABLE tratamientos_ejecucion_dosis AUTO_INCREMENT = 1; END IF;
        END IF;
        IF EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = DATABASE()
              AND table_name = 'tratamientos_ejecucion_eventos'
        ) THEN
            IF (SELECT COUNT(*) FROM tratamientos_ejecucion_eventos) = 0 THEN ALTER TABLE tratamientos_ejecucion_eventos AUTO_INCREMENT = 1; END IF;
        END IF;
        IF EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = DATABASE()
              AND table_name = 'hc_receta_cotizacion_sync'
        ) THEN
            IF (SELECT COUNT(*) FROM hc_receta_cotizacion_sync) = 0 THEN ALTER TABLE hc_receta_cotizacion_sync AUTO_INCREMENT = 1; END IF;
        END IF;
        IF EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = DATABASE()
              AND table_name = 'hc_receta_cotizacion_items_pendientes'
        ) THEN
            IF (SELECT COUNT(*) FROM hc_receta_cotizacion_items_pendientes) = 0 THEN ALTER TABLE hc_receta_cotizacion_items_pendientes AUTO_INCREMENT = 1; END IF;
        END IF;
        IF (SELECT COUNT(*) FROM contratos_consumos) = 0 THEN ALTER TABLE contratos_consumos AUTO_INCREMENT = 1; END IF;
        IF (SELECT COUNT(*) FROM agenda_contrato) = 0 THEN ALTER TABLE agenda_contrato AUTO_INCREMENT = 1; END IF;
        IF (SELECT COUNT(*) FROM paciente_seguimiento_pagos) = 0 THEN ALTER TABLE paciente_seguimiento_pagos AUTO_INCREMENT = 1; END IF;
        IF (SELECT COUNT(*) FROM contratos_paciente_servicios) = 0 THEN ALTER TABLE contratos_paciente_servicios AUTO_INCREMENT = 1; END IF;
        IF (SELECT COUNT(*) FROM contratos_paciente) = 0 THEN ALTER TABLE contratos_paciente AUTO_INCREMENT = 1; END IF;
        IF EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = DATABASE()
              AND table_name = 'produccion_contrato_detalle'
        ) THEN
            IF (SELECT COUNT(*) FROM produccion_contrato_detalle) = 0 THEN ALTER TABLE produccion_contrato_detalle AUTO_INCREMENT = 1; END IF;
        END IF;

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
