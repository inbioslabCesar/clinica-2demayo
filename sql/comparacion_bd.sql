-- COMPARACIÓN DE ESTRUCTURA: poli2demayo (desarrollo) vs u330560936_cardiovidabd (producción)
-- Generado: 2026-04-10
-- INSTRUCCIONES: Ejecutar este script en la BD de PRODUCCIÓN para sincronizar con desarrollo.

-- ============================================================================
-- PARTE 1: TABLAS NUEVAS O CON CAMBIOS EN DESARROLLO
-- ============================================================================

-- Tabla: egresos (VERIFICAR: puede tener nuevos campos)
-- Desarrollo tiene campos: id, caja_id, tipo, tipo_egreso, categoria, monto, descripcion, fecha_egreso, registrado_por, caja_id_registro, turno_registro, liquidacion_id, honorario_movimiento_id, medico_id
--
-- Si Producción NO tiene: liquidacion_id, tipo_egreso, categoria
-- Ejecutar:
ALTER TABLE `egresos` ADD COLUMN `liquidacion_id` int NULL AFTER `honorario_movimiento_id`;
ALTER TABLE `egresos` ADD COLUMN `tipo_egreso` varchar(50) NULL DEFAULT 'honorario_medico' AFTER `tipo`;
ALTER TABLE `egresos` ADD COLUMN `categoria` varchar(100) NULL AFTER `tipo_egreso`;

-- Tabla: laboratorio_referencia_movimientos (VERIFICAR: puede tener nuevos campos)
-- Desarrollo tiene columna: cotizacion_id (índice: idx_lrm_cotizacion_id)
--
-- Si Producción NO tiene cotizacion_id:
ALTER TABLE `laboratorio_referencia_movimientos` ADD COLUMN `cotizacion_id` int NULL AFTER `id`;
ALTER TABLE `laboratorio_referencia_movimientos` ADD INDEX `idx_lrm_cotizacion_id` (`cotizacion_id`);

-- Tabla: ordenes_laboratorio (VERIFICAR: puede tener nuevos campos)
-- Desarrollo tiene: cotizacion_id, cobro_id
--
-- Si Producción NO tiene estos campos:
ALTER TABLE `ordenes_laboratorio` ADD COLUMN `cotizacion_id` int NULL AFTER `id`;
ALTER TABLE `ordenes_laboratorio` ADD COLUMN `cobro_id` int NULL AFTER `cotizacion_id`;
ALTER TABLE `ordenes_laboratorio` ADD INDEX `idx_ol_cotizacion` (`cotizacion_id`);

-- ============================================================================
-- PARTE 2: TABLAS QUE DEBEN TENER IGUAL ESTRUCTURA
-- ============================================================================
-- Después de ejecutar los cambios anteriores, ambas BDs deben ser idénticas.
-- 
-- Verificar que TODAS las tablas existan y tengan los mismos campos:
-- Tablas críticas para auditoría:
--   - atenciones
--   - cajas  
--   - cobros
--   - cobros_detalle
--   - cotizaciones
--   - cotizaciones_detalle
--   - egresos
--   - ingresos
--   - ingresos_diarios
--   - laboratorio_referencia_movimientos
--   - liquidaciones_medicos
--   - ordenes_laboratorio
--   - pacientes
--   - usuarios

-- ============================================================================
-- PARTE 3: VALIDACIÓN POST-SINCRONIZACIÓN
-- ============================================================================
-- Ejecutar estas consultas para validar sincronización:

-- Verificar que egresos tiene los nuevos campos:
SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_NAME='egresos' AND TABLE_SCHEMA=DATABASE()
ORDER BY ORDINAL_POSITION;

-- Verificar que laboratorio_referencia_movimientos tiene cotizacion_id:
SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_NAME='laboratorio_referencia_movimientos' AND TABLE_SCHEMA=DATABASE()
AND COLUMN_NAME='cotizacion_id';

-- Verificar que ordenes_laboratorio tiene cotizacion_id y cobro_id:
SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_NAME='ordenes_laboratorio' AND TABLE_SCHEMA=DATABASE()
AND COLUMN_NAME IN ('cotizacion_id', 'cobro_id');
