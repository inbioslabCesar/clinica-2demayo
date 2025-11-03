-- Script para igualar la base de datos de desarrollo a la estructura de producción
-- Ejecutar en la base de datos de desarrollo

-- 1. Agregar campos faltantes en tarifas
ALTER TABLE tarifas
  ADD COLUMN porcentaje_medico DECIMAL(5,2) DEFAULT NULL,
  ADD COLUMN porcentaje_clinica DECIMAL(5,2) DEFAULT NULL,
  ADD COLUMN monto_medico DECIMAL(10,2) DEFAULT NULL,
  ADD COLUMN monto_clinica DECIMAL(10,2) DEFAULT NULL;

-- 2. Modificar tipo_consulta en consultas a ENUM
ALTER TABLE consultas
  MODIFY COLUMN tipo_consulta ENUM('programada','espontanea') DEFAULT 'programada';

-- 3. Agregar campos faltantes en egresos si no existen
ALTER TABLE egresos
  ADD COLUMN caja_id INT DEFAULT NULL,
  ADD COLUMN honorario_movimiento_id INT DEFAULT NULL,
  ADD COLUMN updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- 4. Revisar y agregar campos en honorarios_medicos_movimientos si faltan
-- (Ya existen en la mayoría de los casos, pero puedes verificar con DESCRIBE)

-- 5. Revisar y agregar campos en configuracion_honorarios_medicos si faltan
-- (Ya existen en la mayoría de los casos, pero puedes verificar con DESCRIBE)

-- 6. Revisar tipo de campo descripcion en cobros_detalle
-- Si usas MySQL 8+, puedes dejarlo como JSON. Si usas MariaDB, usa LONGTEXT con CHECK JSON.
-- Ejemplo para MariaDB:
-- ALTER TABLE cobros_detalle MODIFY COLUMN descripcion LONGTEXT CHECK (json_valid(descripcion));

-- 7. Crear vistas si faltan
-- Vista: vista_honorarios_pendientes
CREATE OR REPLACE VIEW vista_honorarios_pendientes AS
SELECT h.medico_id AS medico_id,
       CONCAT(m.nombre, ' ', m.apellido) AS medico_nombre,
       m.especialidad AS especialidad,
       COUNT(0) AS consultas_pendientes,
       SUM(h.monto_medico) AS total_pendiente,
       MIN(h.fecha) AS fecha_mas_antigua,
       MAX(h.fecha) AS fecha_mas_reciente
FROM honorarios_medicos_movimientos h
JOIN medicos m ON h.medico_id = m.id
WHERE h.estado_pago_medico = 'pendiente'
GROUP BY h.medico_id, m.nombre, m.apellido, m.especialidad;

-- Vista: vista_ingresos_por_area_hoy
CREATE OR REPLACE VIEW vista_ingresos_por_area_hoy AS
SELECT i.tipo_ingreso AS tipo_ingreso,
       i.area AS area,
       COUNT(0) AS cantidad_transacciones,
       SUM(i.monto) AS total_monto,
       SUM(CASE WHEN i.metodo_pago = 'efectivo' THEN i.monto ELSE 0 END) AS total_efectivo,
       SUM(CASE WHEN i.metodo_pago IN ('tarjeta_debito','tarjeta_credito') THEN i.monto ELSE 0 END) AS total_tarjetas,
       SUM(CASE WHEN i.metodo_pago IN ('transferencia','yape','plin') THEN i.monto ELSE 0 END) AS total_transferencias
FROM ingresos_diarios i
JOIN cajas c ON i.caja_id = c.id
WHERE c.fecha = CURDATE()
GROUP BY i.tipo_ingreso, i.area
ORDER BY i.tipo_ingreso ASC, total_monto DESC;

-- Vista: vista_resumen_liquidaciones
CREATE OR REPLACE VIEW vista_resumen_liquidaciones AS
SELECT l.id AS id,
       l.medico_id AS medico_id,
       CONCAT(m.nombre, ' ', m.apellido) AS medico_nombre,
       l.periodo_tipo AS periodo_tipo,
       l.fecha_inicio AS fecha_inicio,
       l.fecha_fin AS fecha_fin,
       l.total_consultas AS total_consultas,
       l.total_honorarios_medico AS total_honorarios_medico,
       l.estado AS estado,
       l.fecha_pago AS fecha_pago,
       (TO_DAYS(CURDATE()) - TO_DAYS(l.fecha_fin)) AS dias_vencimiento
FROM liquidaciones_medicos l
JOIN medicos m ON l.medico_id = m.id
ORDER BY l.fecha_fin DESC;

-- Revisa los índices y claves foráneas manualmente si tienes diferencias en los scripts.
-- Si tienes dudas, ejecuta DESCRIBE en cada tabla y compara con producción.
