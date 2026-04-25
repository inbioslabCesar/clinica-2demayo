-- 93_cleanup_contratos_estado_cuenta.sql
-- Limpieza total de contratos por paciente y estado de cuenta.
--
-- Tablas objetivo (si existen):
--   - contratos_paciente
--   - contratos_paciente_servicios
--   - agenda_contrato
--   - agenda_contrato_medicos
--   - agenda_contrato_subservicios_snapshot
--   - paciente_seguimiento_pagos
--   - contratos_consumos
--
-- Modo seguro:
--   CALL sp_cleanup_contratos_estado_cuenta(0); -- preview + rollback
--   CALL sp_cleanup_contratos_estado_cuenta(1); -- apply + commit

DELIMITER $$

DROP PROCEDURE IF EXISTS sp_cleanup_contratos_estado_cuenta $$
CREATE PROCEDURE sp_cleanup_contratos_estado_cuenta(IN p_apply TINYINT)
BEGIN
    DECLARE v_old_fk INT DEFAULT 1;

    DECLARE v_cp BIGINT DEFAULT 0;
    DECLARE v_cps BIGINT DEFAULT 0;
    DECLARE v_ag BIGINT DEFAULT 0;
    DECLARE v_agm BIGINT DEFAULT 0;
    DECLARE v_ags BIGINT DEFAULT 0;
    DECLARE v_psp BIGINT DEFAULT 0;
    DECLARE v_cc BIGINT DEFAULT 0;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SET FOREIGN_KEY_CHECKS = v_old_fk;
        RESIGNAL;
    END;

    START TRANSACTION;

    SET v_old_fk = @@FOREIGN_KEY_CHECKS;
    SET FOREIGN_KEY_CHECKS = 0;

    DROP TEMPORARY TABLE IF EXISTS tmp_preview_contratos;
    CREATE TEMPORARY TABLE tmp_preview_contratos (
        tabla VARCHAR(120) NOT NULL,
        registros BIGINT NOT NULL
    ) ENGINE=Memory;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'contratos_paciente') THEN
        SELECT COUNT(*) INTO v_cp FROM contratos_paciente;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'contratos_paciente_servicios') THEN
        SELECT COUNT(*) INTO v_cps FROM contratos_paciente_servicios;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'agenda_contrato') THEN
        SELECT COUNT(*) INTO v_ag FROM agenda_contrato;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'agenda_contrato_medicos') THEN
        SELECT COUNT(*) INTO v_agm FROM agenda_contrato_medicos;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'agenda_contrato_subservicios_snapshot') THEN
        SELECT COUNT(*) INTO v_ags FROM agenda_contrato_subservicios_snapshot;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'paciente_seguimiento_pagos') THEN
        SELECT COUNT(*) INTO v_psp FROM paciente_seguimiento_pagos;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'contratos_consumos') THEN
        SELECT COUNT(*) INTO v_cc FROM contratos_consumos;
    END IF;

    INSERT INTO tmp_preview_contratos (tabla, registros) VALUES
        ('agenda_contrato', v_ag),
        ('agenda_contrato_medicos', v_agm),
        ('agenda_contrato_subservicios_snapshot', v_ags),
        ('contratos_consumos', v_cc),
        ('contratos_paciente', v_cp),
        ('contratos_paciente_servicios', v_cps),
        ('paciente_seguimiento_pagos', v_psp);

    SELECT tabla, registros
    FROM tmp_preview_contratos
    ORDER BY tabla;

    -- Orden recomendado de borrado
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'agenda_contrato_medicos') THEN
        DELETE FROM agenda_contrato_medicos;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'agenda_contrato_subservicios_snapshot') THEN
        DELETE FROM agenda_contrato_subservicios_snapshot;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'contratos_consumos') THEN
        DELETE FROM contratos_consumos;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'paciente_seguimiento_pagos') THEN
        DELETE FROM paciente_seguimiento_pagos;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'agenda_contrato') THEN
        DELETE FROM agenda_contrato;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'contratos_paciente_servicios') THEN
        DELETE FROM contratos_paciente_servicios;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'contratos_paciente') THEN
        DELETE FROM contratos_paciente;
    END IF;

    IF p_apply = 1 THEN
        COMMIT;
        SET FOREIGN_KEY_CHECKS = v_old_fk;

        -- Reiniciar AUTO_INCREMENT solo en tablas existentes y vacias
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'agenda_contrato_medicos') THEN
            IF (SELECT COUNT(*) FROM agenda_contrato_medicos) = 0 THEN ALTER TABLE agenda_contrato_medicos AUTO_INCREMENT = 1; END IF;
        END IF;

        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'agenda_contrato_subservicios_snapshot') THEN
            IF (SELECT COUNT(*) FROM agenda_contrato_subservicios_snapshot) = 0 THEN ALTER TABLE agenda_contrato_subservicios_snapshot AUTO_INCREMENT = 1; END IF;
        END IF;

        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'contratos_consumos') THEN
            IF (SELECT COUNT(*) FROM contratos_consumos) = 0 THEN ALTER TABLE contratos_consumos AUTO_INCREMENT = 1; END IF;
        END IF;

        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'paciente_seguimiento_pagos') THEN
            IF (SELECT COUNT(*) FROM paciente_seguimiento_pagos) = 0 THEN ALTER TABLE paciente_seguimiento_pagos AUTO_INCREMENT = 1; END IF;
        END IF;

        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'agenda_contrato') THEN
            IF (SELECT COUNT(*) FROM agenda_contrato) = 0 THEN ALTER TABLE agenda_contrato AUTO_INCREMENT = 1; END IF;
        END IF;

        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'contratos_paciente_servicios') THEN
            IF (SELECT COUNT(*) FROM contratos_paciente_servicios) = 0 THEN ALTER TABLE contratos_paciente_servicios AUTO_INCREMENT = 1; END IF;
        END IF;

        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'contratos_paciente') THEN
            IF (SELECT COUNT(*) FROM contratos_paciente) = 0 THEN ALTER TABLE contratos_paciente AUTO_INCREMENT = 1; END IF;
        END IF;

        SELECT 'COMMIT aplicado' AS resultado;
    ELSE
        ROLLBACK;
        SET FOREIGN_KEY_CHECKS = v_old_fk;
        SELECT 'ROLLBACK aplicado (solo simulacion)' AS resultado;
    END IF;
END $$

DELIMITER ;

-- =========================================================
-- ORDEN DE EJECUCION RECOMENDADO (FLUJO COMPLETO)
-- =========================================================
-- 0) Verificar base activa antes de ejecutar (DEV o PROD)
-- SELECT DATABASE() AS base_activa;
--
-- 1) Cargar/actualizar procedures en este orden (ejecutar archivos):
--    90_cleanup_flujo_cotizaciones_selectivo.sql
--    91_cleanup_residuos_post_cotizacion.sql
--    92_cleanup_residuos_vistas_operativas.sql
--    93_cleanup_contratos_estado_cuenta.sql
--
-- 2) PREVIEW (simulacion, no borra: rollback)
-- CALL sp_cleanup_flujo_cotizaciones(0, NULL, NULL);
-- CALL sp_cleanup_residuos_post_cotizacion(0);
-- CALL sp_cleanup_residuos_vistas_operativas(0);
-- CALL sp_cleanup_contratos_estado_cuenta(0);
--
-- 3) APPLY (aplica cambios: commit)
-- CALL sp_cleanup_flujo_cotizaciones(1, NULL, NULL);
-- CALL sp_cleanup_residuos_post_cotizacion(1);
-- CALL sp_cleanup_residuos_vistas_operativas(1);
-- CALL sp_cleanup_contratos_estado_cuenta(1);

