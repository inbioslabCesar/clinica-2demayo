-- 95_run_cleanup_flujo_cotizaciones_once.sql
-- EJECUCION UNICA DEL FLUJO COMPLETO DE LIMPIEZA
--
-- Este archivo se ejecuta UNA sola vez y dispara todo el proceso completo.
-- Requiere que exista el procedure orquestador:
--   sp_cleanup_flujo_cotizaciones_full
-- (definido en 94_cleanup_flujo_cotizaciones_full.sql)
--
-- MODO:
--   @p_apply = 0  -> PREVIEW (simulacion)
--   @p_apply = 1  -> APPLY   (aplicar)

SELECT DATABASE() AS base_activa;

-- =====================================
-- CONFIGURACION DE EJECUCION
-- =====================================
SET @p_apply = 0;      -- 0 = preview, 1 = apply
SET @p_fecha_desde = NULL;
SET @p_fecha_hasta = NULL;

-- Ejemplo por rango:
-- SET @p_fecha_desde = '2026-04-01 00:00:00';
-- SET @p_fecha_hasta = '2026-04-30 23:59:59';

-- =====================================
-- EJECUCION UNICA
-- =====================================
SET @p_proc_existe = (
	SELECT COUNT(*)
	FROM information_schema.ROUTINES
	WHERE ROUTINE_SCHEMA = DATABASE()
		AND ROUTINE_TYPE = 'PROCEDURE'
		AND ROUTINE_NAME = 'sp_cleanup_flujo_cotizaciones_full'
);

SELECT
	CASE
		WHEN @p_proc_existe = 1 THEN 'OK: Procedure sp_cleanup_flujo_cotizaciones_full encontrado. Ejecutando...'
		ELSE 'ERROR: Falta crear sp_cleanup_flujo_cotizaciones_full. Ejecuta primero 94_cleanup_flujo_cotizaciones_full.sql'
	END AS estado_orquestador;

SET @p_sql_exec = IF(
	@p_proc_existe = 1,
	'CALL sp_cleanup_flujo_cotizaciones_full(@p_apply, @p_fecha_desde, @p_fecha_hasta)',
	'SELECT ''SKIP: no se ejecuto limpieza porque falta el procedure orquestador'' AS resultado'
);

PREPARE stmt_cleanup FROM @p_sql_exec;
EXECUTE stmt_cleanup;
DEALLOCATE PREPARE stmt_cleanup;
