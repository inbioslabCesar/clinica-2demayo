-- 90_cleanup_flujo_cotizaciones_selectivo.sql
-- Limpieza selectiva del flujo transaccional generado por cotizaciones
-- Seguro para DEV/PROD: no toca catalogos base (tarifas, examenes_laboratorio, medicos, usuarios, plantillas)
--
-- USO:
--   1) PREVIEW (simula y revierte):
--      CALL sp_cleanup_flujo_cotizaciones(0, NULL, NULL);
--   2) APPLY (aplica y confirma):
--      CALL sp_cleanup_flujo_cotizaciones(1, NULL, NULL);
--
-- PARAMETROS:
--   p_apply = 0 => ROLLBACK (previsualizacion)
--   p_apply = 1 => COMMIT   (aplicar)
--   p_fecha_desde / p_fecha_hasta (NULL = sin filtro)
--
-- REGLA DE ORO:
--   Solo elimina registros de transaccion vinculados a cotizaciones.

DELIMITER $$

DROP PROCEDURE IF EXISTS sp_cleanup_flujo_cotizaciones $$
CREATE PROCEDURE sp_cleanup_flujo_cotizaciones(
    IN p_apply TINYINT,
    IN p_fecha_desde DATETIME,
    IN p_fecha_hasta DATETIME
)
BEGIN
    DECLARE v_old_fk INT DEFAULT 1;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SET FOREIGN_KEY_CHECKS = 1;
        RESIGNAL;
    END;

    START TRANSACTION;

    SET v_old_fk = @@FOREIGN_KEY_CHECKS;
    SET FOREIGN_KEY_CHECKS = 0;

    DROP TEMPORARY TABLE IF EXISTS tmp_cotizaciones_obj;
    DROP TEMPORARY TABLE IF EXISTS tmp_detalles_obj;
    DROP TEMPORARY TABLE IF EXISTS tmp_consultas_obj;
    DROP TEMPORARY TABLE IF EXISTS tmp_hc_obj;
    DROP TEMPORARY TABLE IF EXISTS tmp_cobros_obj;
    DROP TEMPORARY TABLE IF EXISTS tmp_orden_lab_obj;
    DROP TEMPORARY TABLE IF EXISTS tmp_orden_img_obj;
    DROP TEMPORARY TABLE IF EXISTS tmp_docs_ext_obj;
    DROP TEMPORARY TABLE IF EXISTS tmp_triaje_obj;
    DROP TEMPORARY TABLE IF EXISTS tmp_honorarios_mov_obj;
    DROP TEMPORARY TABLE IF EXISTS tmp_ingresos_diarios_obj;
    DROP TEMPORARY TABLE IF EXISTS tmp_liq_med_obj;

    CREATE TEMPORARY TABLE tmp_cotizaciones_obj (
        id INT PRIMARY KEY
    ) ENGINE=Memory;

    INSERT INTO tmp_cotizaciones_obj (id)
    SELECT c.id
    FROM cotizaciones c
    WHERE (p_fecha_desde IS NULL OR c.fecha >= p_fecha_desde)
      AND (p_fecha_hasta IS NULL OR c.fecha < DATE_ADD(p_fecha_hasta, INTERVAL 1 DAY));

    CREATE TEMPORARY TABLE tmp_detalles_obj (
        id INT PRIMARY KEY
    ) ENGINE=Memory;

    INSERT INTO tmp_detalles_obj (id)
    SELECT cd.id
    FROM cotizaciones_detalle cd
    INNER JOIN tmp_cotizaciones_obj tco ON tco.id = cd.cotizacion_id;

    CREATE TEMPORARY TABLE tmp_consultas_obj (
        id INT PRIMARY KEY
    ) ENGINE=Memory;

    INSERT IGNORE INTO tmp_consultas_obj (id)
    SELECT DISTINCT cd.consulta_id
    FROM cotizaciones_detalle cd
    INNER JOIN tmp_cotizaciones_obj tco ON tco.id = cd.cotizacion_id
    WHERE cd.consulta_id IS NOT NULL AND cd.consulta_id > 0;

    -- Consultas tambien vinculadas por contratos_consumos
    INSERT IGNORE INTO tmp_consultas_obj (id)
    SELECT DISTINCT cc.consulta_id
    FROM contratos_consumos cc
    INNER JOIN tmp_cotizaciones_obj tco ON tco.id = cc.cotizacion_id
    WHERE cc.consulta_id IS NOT NULL AND cc.consulta_id > 0;

    -- Consultas tambien vinculadas por honorarios_por_cobrar
    INSERT IGNORE INTO tmp_consultas_obj (id)
    SELECT DISTINCT hpc.consulta_id
    FROM honorarios_por_cobrar hpc
    INNER JOIN tmp_cotizaciones_obj tco ON tco.id = hpc.cotizacion_id
    WHERE hpc.consulta_id IS NOT NULL AND hpc.consulta_id > 0;

    CREATE TEMPORARY TABLE tmp_hc_obj (
        id INT PRIMARY KEY
    ) ENGINE=Memory;

    INSERT INTO tmp_hc_obj (id)
    SELECT hc.id
    FROM historia_clinica hc
    INNER JOIN tmp_consultas_obj tc ON tc.id = hc.consulta_id;

    CREATE TEMPORARY TABLE tmp_cobros_obj (
        id INT PRIMARY KEY
    ) ENGINE=Memory;

    INSERT IGNORE INTO tmp_cobros_obj (id)
    SELECT DISTINCT cm.cobro_id
    FROM cotizacion_movimientos cm
    INNER JOIN tmp_cotizaciones_obj tco ON tco.id = cm.cotizacion_id
    WHERE cm.cobro_id IS NOT NULL AND cm.cobro_id > 0;

    INSERT IGNORE INTO tmp_cobros_obj (id)
    SELECT DISTINCT hpc.cobro_id
    FROM honorarios_por_cobrar hpc
    INNER JOIN tmp_cotizaciones_obj tco ON tco.id = hpc.cotizacion_id
    WHERE hpc.cobro_id IS NOT NULL AND hpc.cobro_id > 0;

    INSERT IGNORE INTO tmp_cobros_obj (id)
    SELECT DISTINCT ol.cobro_id
    FROM ordenes_laboratorio ol
    INNER JOIN tmp_cotizaciones_obj tco ON tco.id = ol.cotizacion_id
    WHERE ol.cobro_id IS NOT NULL AND ol.cobro_id > 0;

    CREATE TEMPORARY TABLE tmp_orden_lab_obj (
        id INT PRIMARY KEY
    ) ENGINE=Memory;

    INSERT IGNORE INTO tmp_orden_lab_obj (id)
    SELECT ol.id
    FROM ordenes_laboratorio ol
    LEFT JOIN tmp_cotizaciones_obj tco ON tco.id = ol.cotizacion_id
    LEFT JOIN tmp_consultas_obj tcu ON tcu.id = ol.consulta_id
    WHERE tco.id IS NOT NULL OR tcu.id IS NOT NULL;

    CREATE TEMPORARY TABLE tmp_orden_img_obj (
        id INT PRIMARY KEY
    ) ENGINE=Memory;

    INSERT IGNORE INTO tmp_orden_img_obj (id)
    SELECT oi.id
    FROM ordenes_imagen oi
    LEFT JOIN tmp_cotizaciones_obj tco ON tco.id = oi.cotizacion_id
    LEFT JOIN tmp_consultas_obj tcu ON tcu.id = oi.consulta_id
    WHERE tco.id IS NOT NULL OR tcu.id IS NOT NULL;

    CREATE TEMPORARY TABLE tmp_docs_ext_obj (
        id INT PRIMARY KEY
    ) ENGINE=Memory;

    INSERT IGNORE INTO tmp_docs_ext_obj (id)
    SELECT dep.id
    FROM documentos_externos_paciente dep
    LEFT JOIN tmp_cotizaciones_obj tco ON tco.id = dep.cotizacion_id
    LEFT JOIN tmp_orden_lab_obj tol ON tol.id = dep.orden_id
    WHERE tco.id IS NOT NULL OR tol.id IS NOT NULL;

        CREATE TEMPORARY TABLE tmp_honorarios_mov_obj (
                id INT PRIMARY KEY
        ) ENGINE=Memory;

        INSERT IGNORE INTO tmp_honorarios_mov_obj (id)
        SELECT hm.id
        FROM honorarios_medicos_movimientos hm
        LEFT JOIN tmp_consultas_obj tcu ON tcu.id = hm.consulta_id
        LEFT JOIN tmp_cobros_obj tcb ON tcb.id = hm.cobro_id
        WHERE tcu.id IS NOT NULL OR tcb.id IS NOT NULL;

        CREATE TEMPORARY TABLE tmp_liq_med_obj (
        id INT PRIMARY KEY
    ) ENGINE=Memory;

    INSERT IGNORE INTO tmp_liq_med_obj (id)
        SELECT DISTINCT hm.liquidacion_id
    FROM honorarios_medicos_movimientos hm
        INNER JOIN tmp_honorarios_mov_obj thm ON thm.id = hm.id
    WHERE hm.liquidacion_id IS NOT NULL
            AND hm.liquidacion_id > 0;

        CREATE TEMPORARY TABLE tmp_triaje_obj (
                id INT PRIMARY KEY
        ) ENGINE=Memory;

        INSERT IGNORE INTO tmp_triaje_obj (id)
        SELECT tr.id
        FROM triaje tr
        INNER JOIN tmp_consultas_obj tcu ON tcu.id = tr.consulta_id;

        CREATE TEMPORARY TABLE tmp_ingresos_diarios_obj (
                id INT PRIMARY KEY
        ) ENGINE=Memory;

        INSERT IGNORE INTO tmp_ingresos_diarios_obj (id)
        SELECT idg.id
        FROM ingresos_diarios idg
        LEFT JOIN tmp_cobros_obj tcb ON tcb.id = idg.referencia_id
        LEFT JOIN tmp_consultas_obj tcu ON tcu.id = idg.referencia_id
        LEFT JOIN tmp_cotizaciones_obj tco ON tco.id = idg.referencia_id
        LEFT JOIN tmp_honorarios_mov_obj thm ON thm.id = idg.honorario_movimiento_id
        WHERE (
                        LOWER(COALESCE(idg.referencia_tabla, '')) IN ('cobro', 'cobros')
                        AND tcb.id IS NOT NULL
                    )
             OR (
                        LOWER(COALESCE(idg.referencia_tabla, '')) IN ('consulta', 'consultas')
                        AND tcu.id IS NOT NULL
                    )
             OR (
                        LOWER(COALESCE(idg.referencia_tabla, '')) IN ('cotizacion', 'cotizaciones')
                        AND tco.id IS NOT NULL
                    )
             OR thm.id IS NOT NULL;

    -- ============================================================
    -- PREVIEW DE IMPACTO
    -- ============================================================
    DROP TEMPORARY TABLE IF EXISTS tmp_preview_cleanup;
    CREATE TEMPORARY TABLE tmp_preview_cleanup (
        tabla VARCHAR(80) NOT NULL,
        registros BIGINT NOT NULL
    ) ENGINE=Memory;

    INSERT INTO tmp_preview_cleanup (tabla, registros) SELECT 'cotizaciones', COUNT(*) FROM tmp_cotizaciones_obj;
    INSERT INTO tmp_preview_cleanup (tabla, registros) SELECT 'cotizaciones_detalle', COUNT(*) FROM tmp_detalles_obj;
    INSERT INTO tmp_preview_cleanup (tabla, registros) SELECT 'consultas', COUNT(*) FROM tmp_consultas_obj;
    INSERT INTO tmp_preview_cleanup (tabla, registros) SELECT 'historia_clinica', COUNT(*) FROM tmp_hc_obj;
    INSERT INTO tmp_preview_cleanup (tabla, registros) SELECT 'triaje', COUNT(*) FROM tmp_triaje_obj;
    INSERT INTO tmp_preview_cleanup (tabla, registros) SELECT 'cobros', COUNT(*) FROM tmp_cobros_obj;
    INSERT INTO tmp_preview_cleanup (tabla, registros) SELECT 'ingresos_diarios', COUNT(*) FROM tmp_ingresos_diarios_obj;
    INSERT INTO tmp_preview_cleanup (tabla, registros) SELECT 'honorarios_medicos_movimientos', COUNT(*) FROM tmp_honorarios_mov_obj;
    INSERT INTO tmp_preview_cleanup (tabla, registros) SELECT 'ordenes_laboratorio', COUNT(*) FROM tmp_orden_lab_obj;
    INSERT INTO tmp_preview_cleanup (tabla, registros) SELECT 'ordenes_imagen', COUNT(*) FROM tmp_orden_img_obj;
    INSERT INTO tmp_preview_cleanup (tabla, registros) SELECT 'documentos_externos_paciente', COUNT(*) FROM tmp_docs_ext_obj;

    INSERT INTO tmp_preview_cleanup (tabla, registros)
    SELECT 'cotizacion_item_ajustes', COUNT(*)
    FROM cotizacion_item_ajustes cia
    LEFT JOIN tmp_cotizaciones_obj tco ON tco.id = cia.cotizacion_id
    LEFT JOIN tmp_detalles_obj tdo ON tdo.id = cia.cotizacion_detalle_id
    WHERE tco.id IS NOT NULL OR tdo.id IS NOT NULL;

    INSERT INTO tmp_preview_cleanup (tabla, registros)
    SELECT 'cotizacion_eventos', COUNT(*)
    FROM cotizacion_eventos ce
    INNER JOIN tmp_cotizaciones_obj tco ON tco.id = ce.cotizacion_id;

    INSERT INTO tmp_preview_cleanup (tabla, registros)
    SELECT 'cotizacion_movimientos', COUNT(*)
    FROM cotizacion_movimientos cm
    INNER JOIN tmp_cotizaciones_obj tco ON tco.id = cm.cotizacion_id;

    INSERT INTO tmp_preview_cleanup (tabla, registros) SELECT 'liquidaciones_medicos_obj', COUNT(*) FROM tmp_liq_med_obj;

    SELECT tabla, registros
    FROM tmp_preview_cleanup
    ORDER BY tabla;
    -- Triaje vinculado a consultas afectadas
    DELETE tr
    FROM triaje tr
    INNER JOIN tmp_triaje_obj ttr ON ttr.id = tr.id;


    -- ============================================================
    -- BORRADO (orden hijo -> padre)
    -- ============================================================

    -- Archivos de documentos externos de laboratorio
    DELETE dea
    FROM documentos_externos_archivos dea
    INNER JOIN tmp_docs_ext_obj tdo ON tdo.id = dea.documento_id;

    -- Documentos externos de paciente ligados a cotizacion/orden lab
    DELETE dep
    FROM documentos_externos_paciente dep
    INNER JOIN tmp_docs_ext_obj tdo ON tdo.id = dep.id;

    -- Archivos de ordenes de imagen
    DELETE oia
    FROM ordenes_imagen_archivos oia
    INNER JOIN tmp_orden_img_obj toi ON toi.id = oia.orden_id;

    -- Resultados de laboratorio por orden o consulta
    DELETE rl
    FROM resultados_laboratorio rl
    LEFT JOIN tmp_orden_lab_obj tol ON tol.id = rl.orden_id
    LEFT JOIN tmp_consultas_obj tcu ON tcu.id = rl.consulta_id
    WHERE tol.id IS NOT NULL OR tcu.id IS NOT NULL;

    -- Recordatorios de consultas
    DELETE rc
    FROM recordatorios_consultas rc
    INNER JOIN tmp_consultas_obj tcu ON tcu.id = rc.consulta_id;

    -- Honorarios por cobrar vinculados a cotizaciones objetivo
    DELETE hpc
    FROM honorarios_por_cobrar hpc
    INNER JOIN tmp_cotizaciones_obj tco ON tco.id = hpc.cotizacion_id;

    -- Movimientos de honorarios vinculados por consulta o cobro
    DELETE hm
    FROM honorarios_medicos_movimientos hm
    INNER JOIN tmp_honorarios_mov_obj thm ON thm.id = hm.id;

    -- Liquidaciones de medicos que quedaron sin movimientos
    DELETE lm
    FROM liquidaciones_medicos lm
    INNER JOIN tmp_liq_med_obj tlm ON tlm.id = lm.id
    LEFT JOIN honorarios_medicos_movimientos hm ON hm.liquidacion_id = lm.id
    WHERE hm.id IS NULL;

    -- Movimientos de laboratorio referencia
    DELETE lrm
    FROM laboratorio_referencia_movimientos lrm
    LEFT JOIN tmp_cotizaciones_obj tco ON tco.id = lrm.cotizacion_id
    LEFT JOIN tmp_cobros_obj tcb ON tcb.id = lrm.cobro_id
    WHERE tco.id IS NOT NULL OR tcb.id IS NOT NULL;

    -- Consumos de contrato vinculados a cotizaciones
    DELETE cc
    FROM contratos_consumos cc
    INNER JOIN tmp_cotizaciones_obj tco ON tco.id = cc.cotizacion_id;

    -- Agenda de contrato vinculada a consultas afectadas
    DELETE ac
    FROM agenda_contrato ac
    INNER JOIN tmp_consultas_obj tcu ON tcu.id = ac.consulta_id;

    -- Ordenes de imagen/laboratorio
    DELETE oi
    FROM ordenes_imagen oi
    INNER JOIN tmp_orden_img_obj toi ON toi.id = oi.id;

    DELETE ol
    FROM ordenes_laboratorio ol
    INNER JOIN tmp_orden_lab_obj tol ON tol.id = ol.id;

    -- Ajustes / eventos / movimientos / vinculos de cotizacion
    DELETE cia
    FROM cotizacion_item_ajustes cia
    LEFT JOIN tmp_cotizaciones_obj tco ON tco.id = cia.cotizacion_id
    LEFT JOIN tmp_detalles_obj tdo ON tdo.id = cia.cotizacion_detalle_id
    WHERE tco.id IS NOT NULL OR tdo.id IS NOT NULL;

    DELETE ce
    FROM cotizacion_eventos ce
    INNER JOIN tmp_cotizaciones_obj tco ON tco.id = ce.cotizacion_id;

    DELETE cm
    FROM cotizacion_movimientos cm
    INNER JOIN tmp_cotizaciones_obj tco ON tco.id = cm.cotizacion_id;

    DELETE cfv
    FROM cotizacion_farmacia_vinculos cfv
    INNER JOIN tmp_cotizaciones_obj tco ON tco.id = cfv.cotizacion_id;

    -- Historia clinica / consultas
    DELETE hc
    FROM historia_clinica hc
    INNER JOIN tmp_hc_obj thc ON thc.id = hc.id;

    DELETE c
    FROM consultas c
    INNER JOIN tmp_consultas_obj tcu ON tcu.id = c.id;

    -- Cobros y detalle
    DELETE cd
    FROM cobros_detalle cd
    INNER JOIN tmp_cobros_obj tcb ON tcb.id = cd.cobro_id;

    -- Ingresos diarios enlazados por referencia a cobro/consulta/cotizacion/honorario
    DELETE idg
    FROM ingresos_diarios idg
    INNER JOIN tmp_ingresos_diarios_obj tig ON tig.id = idg.id;

    DELETE cb
    FROM cobros cb
    INNER JOIN tmp_cobros_obj tcb ON tcb.id = cb.id;

    -- Detalle y cabecera de cotizaciones
    DELETE cd
    FROM cotizaciones_detalle cd
    INNER JOIN tmp_cotizaciones_obj tco ON tco.id = cd.cotizacion_id;

    DELETE c
    FROM cotizaciones c
    INNER JOIN tmp_cotizaciones_obj tco ON tco.id = c.id;

    -- Nota: tabla ingresos no tiene FK/columna directa a cotizacion/cobro.
    -- Si necesitas limpiar ingresos legacy, hacerlo con filtro de fecha + descripcion en script aparte.

    IF p_apply = 1 THEN
        COMMIT;
        SET FOREIGN_KEY_CHECKS = v_old_fk;

        -- Reiniciar AUTO_INCREMENT solo en tablas que quedaron vacias
        IF (SELECT COUNT(*) FROM cotizaciones) = 0 THEN ALTER TABLE cotizaciones AUTO_INCREMENT = 1; END IF;
        IF (SELECT COUNT(*) FROM cotizaciones_detalle) = 0 THEN ALTER TABLE cotizaciones_detalle AUTO_INCREMENT = 1; END IF;
        IF (SELECT COUNT(*) FROM consultas) = 0 THEN ALTER TABLE consultas AUTO_INCREMENT = 1; END IF;
        IF (SELECT COUNT(*) FROM historia_clinica) = 0 THEN ALTER TABLE historia_clinica AUTO_INCREMENT = 1; END IF;
        IF (SELECT COUNT(*) FROM triaje) = 0 THEN ALTER TABLE triaje AUTO_INCREMENT = 1; END IF;
        IF (SELECT COUNT(*) FROM recordatorios_consultas) = 0 THEN ALTER TABLE recordatorios_consultas AUTO_INCREMENT = 1; END IF;
        IF (SELECT COUNT(*) FROM cobros) = 0 THEN ALTER TABLE cobros AUTO_INCREMENT = 1; END IF;
        IF (SELECT COUNT(*) FROM cobros_detalle) = 0 THEN ALTER TABLE cobros_detalle AUTO_INCREMENT = 1; END IF;
        IF (SELECT COUNT(*) FROM ingresos_diarios) = 0 THEN ALTER TABLE ingresos_diarios AUTO_INCREMENT = 1; END IF;
        IF (SELECT COUNT(*) FROM ordenes_laboratorio) = 0 THEN ALTER TABLE ordenes_laboratorio AUTO_INCREMENT = 1; END IF;
        IF (SELECT COUNT(*) FROM resultados_laboratorio) = 0 THEN ALTER TABLE resultados_laboratorio AUTO_INCREMENT = 1; END IF;
        IF (SELECT COUNT(*) FROM ordenes_imagen) = 0 THEN ALTER TABLE ordenes_imagen AUTO_INCREMENT = 1; END IF;
        IF (SELECT COUNT(*) FROM ordenes_imagen_archivos) = 0 THEN ALTER TABLE ordenes_imagen_archivos AUTO_INCREMENT = 1; END IF;
        IF (SELECT COUNT(*) FROM documentos_externos_paciente) = 0 THEN ALTER TABLE documentos_externos_paciente AUTO_INCREMENT = 1; END IF;
        IF (SELECT COUNT(*) FROM documentos_externos_archivos) = 0 THEN ALTER TABLE documentos_externos_archivos AUTO_INCREMENT = 1; END IF;
        IF (SELECT COUNT(*) FROM honorarios_por_cobrar) = 0 THEN ALTER TABLE honorarios_por_cobrar AUTO_INCREMENT = 1; END IF;
        IF (SELECT COUNT(*) FROM honorarios_medicos_movimientos) = 0 THEN ALTER TABLE honorarios_medicos_movimientos AUTO_INCREMENT = 1; END IF;
        IF (SELECT COUNT(*) FROM liquidaciones_medicos) = 0 THEN ALTER TABLE liquidaciones_medicos AUTO_INCREMENT = 1; END IF;
        IF (SELECT COUNT(*) FROM laboratorio_referencia_movimientos) = 0 THEN ALTER TABLE laboratorio_referencia_movimientos AUTO_INCREMENT = 1; END IF;
        IF (SELECT COUNT(*) FROM contratos_consumos) = 0 THEN ALTER TABLE contratos_consumos AUTO_INCREMENT = 1; END IF;
        IF (SELECT COUNT(*) FROM agenda_contrato) = 0 THEN ALTER TABLE agenda_contrato AUTO_INCREMENT = 1; END IF;
        IF (SELECT COUNT(*) FROM cotizacion_item_ajustes) = 0 THEN ALTER TABLE cotizacion_item_ajustes AUTO_INCREMENT = 1; END IF;
        IF (SELECT COUNT(*) FROM cotizacion_eventos) = 0 THEN ALTER TABLE cotizacion_eventos AUTO_INCREMENT = 1; END IF;
        IF (SELECT COUNT(*) FROM cotizacion_movimientos) = 0 THEN ALTER TABLE cotizacion_movimientos AUTO_INCREMENT = 1; END IF;
        IF (SELECT COUNT(*) FROM cotizacion_farmacia_vinculos) = 0 THEN ALTER TABLE cotizacion_farmacia_vinculos AUTO_INCREMENT = 1; END IF;

        SELECT 'COMMIT aplicado' AS resultado;
    ELSE
        ROLLBACK;
        SET FOREIGN_KEY_CHECKS = v_old_fk;
        SELECT 'ROLLBACK aplicado (solo simulacion)' AS resultado;
    END IF;
END $$

DELIMITER ;

-- =========================
-- EJEMPLOS DE EJECUCION
-- =========================
-- 1) Simulacion global (recomendado primero):
-- CALL sp_cleanup_flujo_cotizaciones(0, NULL, NULL);

-- 2) Aplicar global:
-- CALL sp_cleanup_flujo_cotizaciones(1, NULL, NULL);

-- 3) Solo por rango de fechas:
-- CALL sp_cleanup_flujo_cotizaciones(0, '2026-04-01', '2026-04-30');
-- CALL sp_cleanup_flujo_cotizaciones(1, '2026-04-01', '2026-04-30');
