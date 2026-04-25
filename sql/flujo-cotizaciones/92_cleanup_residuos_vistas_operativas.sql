-- 92_cleanup_residuos_vistas_operativas.sql
-- Limpieza complementaria para dejar en cero las vistas operativas:
--   - Lista de Consultas
--   - Recordatorios de Citas
--   - Panel Enfermero (Triaje / Tratamientos)
--
-- Enfocado en remanentes de flujo contratos/hc_proxima/agenda.
--
-- Uso:
--   CALL sp_cleanup_residuos_vistas_operativas(0); -- preview + rollback
--   CALL sp_cleanup_residuos_vistas_operativas(1); -- apply + commit



DELIMITER $$

DROP PROCEDURE IF EXISTS sp_cleanup_residuos_vistas_operativas $$
CREATE PROCEDURE sp_cleanup_residuos_vistas_operativas(IN p_apply TINYINT)
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

    DROP TEMPORARY TABLE IF EXISTS tmp_cons_vistas;
    DROP TEMPORARY TABLE IF EXISTS tmp_trat_obj;
    DROP TEMPORARY TABLE IF EXISTS tmp_preview_vistas;

    CREATE TEMPORARY TABLE tmp_cons_vistas (
        id INT PRIMARY KEY
    ) ENGINE=Memory;

    -- Consultas objetivo:
    --   a) origen contrato_agenda / hc_proxima
    --   b) consultas presentes en agenda_contrato
    --   c) consultas con HC vinculada a contrato
    INSERT INTO tmp_cons_vistas (id)
    SELECT DISTINCT q.id
    FROM consultas q
    LEFT JOIN agenda_contrato ac ON ac.consulta_id = q.id
    LEFT JOIN historia_clinica hc ON hc.consulta_id = q.id
    WHERE q.origen_creacion IN ('contrato_agenda', 'hc_proxima')
       OR ac.consulta_id IS NOT NULL
       OR (hc.contrato_paciente_id IS NOT NULL AND hc.contrato_paciente_id > 0);

    CREATE TEMPORARY TABLE tmp_trat_obj (
        id INT PRIMARY KEY
    ) ENGINE=Memory;

    INSERT INTO tmp_trat_obj (id)
    SELECT te.id
    FROM tratamientos_enfermeria te
    WHERE te.consulta_id IN (SELECT id FROM tmp_cons_vistas);

    CREATE TEMPORARY TABLE tmp_preview_vistas (
        tabla VARCHAR(80) NOT NULL,
        registros BIGINT NOT NULL
    ) ENGINE=Memory;

    INSERT INTO tmp_preview_vistas (tabla, registros)
    SELECT 'consultas_objetivo', COUNT(*) FROM tmp_cons_vistas;

    INSERT INTO tmp_preview_vistas (tabla, registros)
    SELECT 'agenda_contrato', COUNT(*)
    FROM agenda_contrato
    WHERE consulta_id IN (SELECT id FROM tmp_cons_vistas);

    INSERT INTO tmp_preview_vistas (tabla, registros)
    SELECT 'historia_clinica', COUNT(*)
    FROM historia_clinica
    WHERE consulta_id IN (SELECT id FROM tmp_cons_vistas);

    INSERT INTO tmp_preview_vistas (tabla, registros)
    SELECT 'triaje', COUNT(*)
    FROM triaje
    WHERE consulta_id IN (SELECT id FROM tmp_cons_vistas);

    INSERT INTO tmp_preview_vistas (tabla, registros)
    SELECT 'tratamientos_enfermeria', COUNT(*)
    FROM tmp_trat_obj;

    INSERT INTO tmp_preview_vistas (tabla, registros)
    SELECT 'ordenes_laboratorio', COUNT(*)
    FROM ordenes_laboratorio
    WHERE consulta_id IN (SELECT id FROM tmp_cons_vistas);

    INSERT INTO tmp_preview_vistas (tabla, registros)
    SELECT 'ordenes_imagen', COUNT(*)
    FROM ordenes_imagen
    WHERE consulta_id IN (SELECT id FROM tmp_cons_vistas);

    SELECT tabla, registros
    FROM tmp_preview_vistas
    ORDER BY tabla;

    -- Orden de borrado para respetar dependencias
    DELETE ted
    FROM tratamientos_ejecucion_dosis ted
    INNER JOIN tmp_trat_obj t ON t.id = ted.tratamiento_id;

    DELETE tee
    FROM tratamientos_ejecucion_eventos tee
    INNER JOIN tmp_trat_obj t ON t.id = tee.tratamiento_id;

    DELETE tedi
    FROM tratamientos_ejecucion_diaria tedi
    INNER JOIN tmp_trat_obj t ON t.id = tedi.tratamiento_id;

    DELETE tei
    FROM tratamientos_enfermeria_items tei
    INNER JOIN tmp_trat_obj t ON t.id = tei.tratamiento_id;

    DELETE te
    FROM tratamientos_enfermeria te
    INNER JOIN tmp_trat_obj t ON t.id = te.id;

    -- Documentos externos enlazados a ordenes de lab de estas consultas (antes de borrar ordenes)
    DELETE dea
    FROM documentos_externos_archivos dea
    INNER JOIN documentos_externos_paciente dep ON dep.id = dea.documento_id
    INNER JOIN ordenes_laboratorio ol ON ol.id = dep.orden_id
    WHERE ol.consulta_id IN (SELECT id FROM tmp_cons_vistas);

    DELETE dep
    FROM documentos_externos_paciente dep
    INNER JOIN ordenes_laboratorio ol ON ol.id = dep.orden_id
    WHERE ol.consulta_id IN (SELECT id FROM tmp_cons_vistas);

    DELETE oia
    FROM ordenes_imagen_archivos oia
    INNER JOIN ordenes_imagen oi ON oi.id = oia.orden_id
    WHERE oi.consulta_id IN (SELECT id FROM tmp_cons_vistas);

    DELETE rl
    FROM resultados_laboratorio rl
    WHERE rl.consulta_id IN (SELECT id FROM tmp_cons_vistas);

    DELETE ol
    FROM ordenes_laboratorio ol
    WHERE ol.consulta_id IN (SELECT id FROM tmp_cons_vistas);

    DELETE oi
    FROM ordenes_imagen oi
    WHERE oi.consulta_id IN (SELECT id FROM tmp_cons_vistas);

    DELETE tr
    FROM triaje tr
    WHERE tr.consulta_id IN (SELECT id FROM tmp_cons_vistas);

    DELETE rc
    FROM recordatorios_consultas rc
    WHERE rc.consulta_id IN (SELECT id FROM tmp_cons_vistas);

    DELETE hc
    FROM historia_clinica hc
    WHERE hc.consulta_id IN (SELECT id FROM tmp_cons_vistas);

    DELETE ac
    FROM agenda_contrato ac
    WHERE ac.consulta_id IN (SELECT id FROM tmp_cons_vistas);

    DELETE q
    FROM consultas q
    WHERE q.id IN (SELECT id FROM tmp_cons_vistas);

    IF p_apply = 1 THEN
        COMMIT;
        SET FOREIGN_KEY_CHECKS = v_old_fk;

        -- Reiniciar AUTO_INCREMENT solo si la tabla quedo vacia
        IF (SELECT COUNT(*) FROM tratamientos_ejecucion_dosis) = 0 THEN ALTER TABLE tratamientos_ejecucion_dosis AUTO_INCREMENT = 1; END IF;
        IF (SELECT COUNT(*) FROM tratamientos_ejecucion_eventos) = 0 THEN ALTER TABLE tratamientos_ejecucion_eventos AUTO_INCREMENT = 1; END IF;
        IF (SELECT COUNT(*) FROM tratamientos_ejecucion_diaria) = 0 THEN ALTER TABLE tratamientos_ejecucion_diaria AUTO_INCREMENT = 1; END IF;
        IF (SELECT COUNT(*) FROM tratamientos_enfermeria_items) = 0 THEN ALTER TABLE tratamientos_enfermeria_items AUTO_INCREMENT = 1; END IF;
        IF (SELECT COUNT(*) FROM tratamientos_enfermeria) = 0 THEN ALTER TABLE tratamientos_enfermeria AUTO_INCREMENT = 1; END IF;
        IF (SELECT COUNT(*) FROM documentos_externos_archivos) = 0 THEN ALTER TABLE documentos_externos_archivos AUTO_INCREMENT = 1; END IF;
        IF (SELECT COUNT(*) FROM documentos_externos_paciente) = 0 THEN ALTER TABLE documentos_externos_paciente AUTO_INCREMENT = 1; END IF;
        IF (SELECT COUNT(*) FROM ordenes_imagen_archivos) = 0 THEN ALTER TABLE ordenes_imagen_archivos AUTO_INCREMENT = 1; END IF;
        IF (SELECT COUNT(*) FROM resultados_laboratorio) = 0 THEN ALTER TABLE resultados_laboratorio AUTO_INCREMENT = 1; END IF;
        IF (SELECT COUNT(*) FROM ordenes_laboratorio) = 0 THEN ALTER TABLE ordenes_laboratorio AUTO_INCREMENT = 1; END IF;
        IF (SELECT COUNT(*) FROM ordenes_imagen) = 0 THEN ALTER TABLE ordenes_imagen AUTO_INCREMENT = 1; END IF;
        IF (SELECT COUNT(*) FROM triaje) = 0 THEN ALTER TABLE triaje AUTO_INCREMENT = 1; END IF;
        IF (SELECT COUNT(*) FROM recordatorios_consultas) = 0 THEN ALTER TABLE recordatorios_consultas AUTO_INCREMENT = 1; END IF;
        IF (SELECT COUNT(*) FROM historia_clinica) = 0 THEN ALTER TABLE historia_clinica AUTO_INCREMENT = 1; END IF;
        IF (SELECT COUNT(*) FROM agenda_contrato) = 0 THEN ALTER TABLE agenda_contrato AUTO_INCREMENT = 1; END IF;
        IF (SELECT COUNT(*) FROM consultas) = 0 THEN ALTER TABLE consultas AUTO_INCREMENT = 1; END IF;

        SELECT 'COMMIT aplicado' AS resultado;
    ELSE
        ROLLBACK;
        SET FOREIGN_KEY_CHECKS = v_old_fk;
        SELECT 'ROLLBACK aplicado (solo simulacion)' AS resultado;
    END IF;
END $$

DELIMITER ;
