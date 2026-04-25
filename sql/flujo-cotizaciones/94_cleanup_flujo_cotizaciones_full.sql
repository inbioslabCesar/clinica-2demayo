-- 94_cleanup_flujo_cotizaciones_full.sql
-- Orquestador del flujo completo de limpieza de cotizaciones.
--
-- OBJETIVO:
--   Ejecutar en un solo CALL los 4 procedures ya validados:
--     1) sp_cleanup_flujo_cotizaciones
--     2) sp_cleanup_residuos_post_cotizacion
--     3) sp_cleanup_residuos_vistas_operativas
--     4) sp_cleanup_contratos_estado_cuenta
--
-- IMPORTANTE:
--   Este script no reemplaza la logica de los archivos 90-93.
--   Solo la orquesta para agilizar la ejecucion operativa.
--
-- PRERREQUISITO:
--   Primero deben estar cargados en la base los procedures de:
--     90_cleanup_flujo_cotizaciones_selectivo.sql
--     91_cleanup_residuos_post_cotizacion.sql
--     92_cleanup_residuos_vistas_operativas.sql
--     93_cleanup_contratos_estado_cuenta.sql
--
-- MODO DE USO:
--   Preview global:
--     CALL sp_cleanup_flujo_cotizaciones_full(0, NULL, NULL);
--
--   Apply global:
--     CALL sp_cleanup_flujo_cotizaciones_full(1, NULL, NULL);
--
--   Preview por rango:
--     CALL sp_cleanup_flujo_cotizaciones_full(0, '2026-04-01', '2026-04-30');
--
--   Apply por rango:
--     CALL sp_cleanup_flujo_cotizaciones_full(1, '2026-04-01', '2026-04-30');

DELIMITER $$

DROP PROCEDURE IF EXISTS sp_cleanup_flujo_cotizaciones_full $$
CREATE PROCEDURE sp_cleanup_flujo_cotizaciones_full(
    IN p_apply TINYINT,
    IN p_fecha_desde DATETIME,
    IN p_fecha_hasta DATETIME
)
BEGIN
    IF p_apply NOT IN (0, 1) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'p_apply debe ser 0 (preview) o 1 (apply)';
    END IF;

    SELECT DATABASE() AS base_activa,
           CASE WHEN p_apply = 1 THEN 'APPLY' ELSE 'PREVIEW' END AS modo,
           p_fecha_desde AS fecha_desde,
           p_fecha_hasta AS fecha_hasta;

    SELECT 'INICIO 1/4 - flujo principal de cotizaciones' AS etapa;
    CALL sp_cleanup_flujo_cotizaciones(p_apply, p_fecha_desde, p_fecha_hasta);

    SELECT 'INICIO 2/4 - residuos post cotizacion' AS etapa;
    CALL sp_cleanup_residuos_post_cotizacion(p_apply);

    SELECT 'INICIO 3/4 - residuos vistas operativas' AS etapa;
    CALL sp_cleanup_residuos_vistas_operativas(p_apply);

    SELECT 'INICIO 4/4 - contratos y estado de cuenta' AS etapa;
    CALL sp_cleanup_contratos_estado_cuenta(p_apply);

    SELECT CASE
        WHEN p_apply = 1 THEN 'FLUJO COMPLETO APLICADO'
        ELSE 'FLUJO COMPLETO SIMULADO (ROLLBACK EN CADA ETAPA)'
    END AS resultado;
END $$

DELIMITER ;

-- =========================================================
-- EJEMPLOS DE EJECUCION
-- =========================================================
-- Verificar base activa:
-- SELECT DATABASE() AS base_activa;
--
-- Preview global:
-- CALL sp_cleanup_flujo_cotizaciones_full(0, NULL, NULL);
--
-- Apply global:
-- CALL sp_cleanup_flujo_cotizaciones_full(1, NULL, NULL);
--
-- Preview por rango:
-- CALL sp_cleanup_flujo_cotizaciones_full(0, '2026-04-01', '2026-04-30');
--
-- Apply por rango:
-- CALL sp_cleanup_flujo_cotizaciones_full(1, '2026-04-01', '2026-04-30');