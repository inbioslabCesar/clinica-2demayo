-- 2026-11-22 | PASO 2 de 2 | BD: u330560936_materno_bd | CAMBIA ESTRUCTURA (ejecutar tras el paso 1)
-- Restaura los ENUM con los valores correctos (los de desarrollo / referencia del esquema).
-- Los pacientes sin unidad deducible quedan en NULL (la columna lo permite).

UPDATE `pacientes` SET `edad_unidad` = NULL
WHERE `edad_unidad` IS NOT NULL AND `edad_unidad` NOT IN ('días', 'meses', 'años');

ALTER TABLE `cajas` MODIFY COLUMN `turno` enum('mañana','tarde','noche') COLLATE utf8mb4_general_ci NOT NULL;
ALTER TABLE `egresos` MODIFY COLUMN `turno` enum('mañana','tarde','noche') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'mañana';
ALTER TABLE `ingresos_diarios` MODIFY COLUMN `turno` enum('mañana','tarde','noche') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'mañana';
ALTER TABLE `honorarios_medicos_movimientos` MODIFY COLUMN `turno` enum('mañana','tarde','noche') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'mañana';
ALTER TABLE `pacientes` MODIFY COLUMN `edad_unidad` enum('días','meses','años') COLLATE utf8mb4_general_ci NULL DEFAULT NULL;

-- dia_semana: todas las filas son 'lunes' (el sistema no escribe esta columna); solo se corrige la definicion.
ALTER TABLE `disponibilidad_medicos` MODIFY COLUMN `dia_semana` enum('lunes','martes','miércoles','jueves','viernes','sábado','domingo') COLLATE utf8mb4_general_ci NOT NULL;

-- Verificacion (solo lectura): no debe quedar ningun valor vacio.
SELECT 'cajas.turno' AS columna, HEX(turno) AS hex_valor, COUNT(*) AS filas FROM cajas GROUP BY turno
UNION ALL SELECT 'egresos.turno', HEX(turno), COUNT(*) FROM egresos GROUP BY turno
UNION ALL SELECT 'ingresos_diarios.turno', HEX(turno), COUNT(*) FROM ingresos_diarios GROUP BY turno
UNION ALL SELECT 'honorarios_medicos_movimientos.turno', HEX(turno), COUNT(*) FROM honorarios_medicos_movimientos GROUP BY turno
UNION ALL SELECT 'pacientes.edad_unidad', HEX(edad_unidad), COUNT(*) FROM pacientes GROUP BY edad_unidad;
