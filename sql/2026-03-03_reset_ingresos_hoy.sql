-- Script: Reset de ingresos/cobros/cotizaciones del día actual
-- Fecha: 2026-03-03
-- Objetivo: dejar el sistema como "sin ingresos hoy"
--
-- IMPORTANTE:
-- 1) Ejecutar backup antes de correr.
-- 2) Probar primero en entorno de desarrollo.
-- 3) Si deseas validar sin persistir cambios, reemplaza COMMIT por ROLLBACK.

SET @hoy = CURDATE();

START TRANSACTION;

-- =========================================================
-- 1) IDs BASE DEL DÍA
-- =========================================================
DROP TEMPORARY TABLE IF EXISTS tmp_cobros_hoy;
CREATE TEMPORARY TABLE tmp_cobros_hoy AS
SELECT id
FROM cobros
WHERE DATE(fecha_cobro) = @hoy;

DROP TEMPORARY TABLE IF EXISTS tmp_cotizaciones_hoy;
CREATE TEMPORARY TABLE tmp_cotizaciones_hoy AS
SELECT id
FROM cotizaciones
WHERE DATE(fecha) = @hoy;

-- =========================================================
-- 2) REVERTIR STOCK DE FARMACIA POR VENTAS DE HOY
-- =========================================================
UPDATE medicamentos m
JOIN (
  SELECT mm.medicamento_id, SUM(mm.cantidad) AS qty
  FROM movimientos_medicamento mm
  WHERE DATE(mm.fecha_hora) = @hoy
    AND mm.tipo_movimiento IN ('venta_caja', 'venta_unidad')
  GROUP BY mm.medicamento_id
) x ON x.medicamento_id = m.id
SET m.stock = m.stock + x.qty;

-- =========================================================
-- 3) SOLTAR REFERENCIAS DE CONSULTAS A COBROS DE HOY
-- =========================================================
UPDATE consultas
SET cobro_id = NULL
WHERE cobro_id IN (SELECT id FROM tmp_cobros_hoy);

-- =========================================================
-- 4) BORRAR DEPENDENCIAS DE COBROS
-- =========================================================
DELETE FROM descuentos_aplicados
WHERE cobro_id IN (SELECT id FROM tmp_cobros_hoy);

DELETE FROM ordenes_laboratorio
WHERE cobro_id IN (SELECT id FROM tmp_cobros_hoy);

DELETE FROM laboratorio_referencia_movimientos
WHERE cobro_id IN (SELECT id FROM tmp_cobros_hoy)
   OR DATE(created_at) = @hoy;

DELETE FROM honorarios_medicos_movimientos
WHERE cobro_id IN (SELECT id FROM tmp_cobros_hoy)
   OR fecha = @hoy;

DELETE FROM ingresos_diarios
WHERE (referencia_tabla = 'cobros' AND referencia_id IN (SELECT id FROM tmp_cobros_hoy))
   OR DATE(fecha_hora) = @hoy;

DELETE FROM ingresos
WHERE DATE(fecha_hora) = @hoy;

DELETE FROM cobros_detalle
WHERE cobro_id IN (SELECT id FROM tmp_cobros_hoy);

DELETE FROM cobros
WHERE id IN (SELECT id FROM tmp_cobros_hoy);

-- =========================================================
-- 5) BORRAR COTIZACIONES DE HOY Y SU TRAZABILIDAD
-- =========================================================
DELETE FROM cotizacion_item_ajustes
WHERE cotizacion_id IN (SELECT id FROM tmp_cotizaciones_hoy);

DELETE FROM cotizacion_movimientos
WHERE cotizacion_id IN (SELECT id FROM tmp_cotizaciones_hoy);

DELETE FROM cotizacion_eventos
WHERE cotizacion_id IN (SELECT id FROM tmp_cotizaciones_hoy);

DELETE FROM cotizaciones_detalle
WHERE cotizacion_id IN (SELECT id FROM tmp_cotizaciones_hoy);

DELETE FROM cotizaciones
WHERE id IN (SELECT id FROM tmp_cotizaciones_hoy);

-- =========================================================
-- 6) LIMPIAR MOVIMIENTOS DE FARMACIA DE VENTA DEL DÍA
-- =========================================================
DELETE FROM movimientos_medicamento
WHERE DATE(fecha_hora) = @hoy
  AND tipo_movimiento IN ('venta_caja', 'venta_unidad');

-- =========================================================
-- 7) OPCIONAL: BORRAR ATENCIONES CREADAS HOY
-- (descomentar solo si realmente deseas quitarlas)
-- =========================================================
-- DELETE FROM atenciones WHERE DATE(fecha) = @hoy;

-- =========================================================
-- 8) VERIFICACIÓN RÁPIDA
-- =========================================================
SELECT 'cobros_hoy' AS tabla, COUNT(*) AS total FROM cobros WHERE DATE(fecha_cobro)=@hoy
UNION ALL
SELECT 'ingresos_hoy', COUNT(*) FROM ingresos WHERE DATE(fecha_hora)=@hoy
UNION ALL
SELECT 'ingresos_diarios_hoy', COUNT(*) FROM ingresos_diarios WHERE DATE(fecha_hora)=@hoy
UNION ALL
SELECT 'cotizaciones_hoy', COUNT(*) FROM cotizaciones WHERE DATE(fecha)=@hoy;

COMMIT;
-- Para validar primero sin guardar: reemplazar COMMIT por ROLLBACK;
