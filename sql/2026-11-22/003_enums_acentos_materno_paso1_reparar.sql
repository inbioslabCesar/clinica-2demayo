-- 2026-11-22 | PASO 1 de 2 | BD: u330560936_materno_bd | CAMBIA DATOS Y ESTRUCTURA (hacer respaldo antes)
-- Problema: los ENUM turno / edad_unidad se crearon con caracteres danados ('maÃ±ana', 'dÃ­as', 'aÃ±os').
-- Como el sistema guarda 'mañana'/'años', la BD grababa '' (vacio) o usaba el 1er valor ('dÃ­as').
-- Este paso: convierte las columnas a VARCHAR (el sistema sigue funcionando) y repara los valores.
-- Es repetible: si se ejecuta otra vez no rompe nada.
-- Despues de este paso, ejecutar 004_enums_acentos_materno_paso2_restaurar_enum.sql.
--
-- Reglas de reparacion:
--  * turno: cualquier valor distinto de 'tarde'/'noche' era 'mañana' (es el unico valor con tilde).
--  * pacientes.edad_unidad vacia o 'días' danada: 'años' si tiene 12+ meses (por fecha_nacimiento);
--    sin fecha_nacimiento, solo si edad >= 29 (no puede ser dias ni meses). El resto queda para revision.
--  * Se conserva updated_at (no se altera la fecha de ultima modificacion).

-- cajas
ALTER TABLE `cajas` MODIFY COLUMN `turno` varchar(20) COLLATE utf8mb4_general_ci NOT NULL;
UPDATE `cajas` SET `turno` = 'mañana', `updated_at` = `updated_at` WHERE `turno` NOT IN ('tarde', 'noche');

-- egresos
ALTER TABLE `egresos` MODIFY COLUMN `turno` varchar(20) COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'mañana';
UPDATE `egresos` SET `turno` = 'mañana', `updated_at` = `updated_at` WHERE `turno` NOT IN ('tarde', 'noche');

-- ingresos_diarios
ALTER TABLE `ingresos_diarios` MODIFY COLUMN `turno` varchar(20) COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'mañana';
UPDATE `ingresos_diarios` SET `turno` = 'mañana' WHERE `turno` NOT IN ('tarde', 'noche');

-- honorarios_medicos_movimientos
ALTER TABLE `honorarios_medicos_movimientos` MODIFY COLUMN `turno` varchar(20) COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'mañana';
UPDATE `honorarios_medicos_movimientos` SET `turno` = 'mañana' WHERE `turno` NOT IN ('tarde', 'noche');

-- pacientes.edad_unidad
ALTER TABLE `pacientes` MODIFY COLUMN `edad_unidad` varchar(20) COLLATE utf8mb4_general_ci NULL DEFAULT NULL;

UPDATE `pacientes` SET `edad_unidad` = 'años'
WHERE (`edad_unidad` = '' OR `edad_unidad` LIKE 'd%')
  AND `fecha_nacimiento` IS NOT NULL
  AND TIMESTAMPDIFF(MONTH, `fecha_nacimiento`, CURDATE()) >= 12;

UPDATE `pacientes` SET `edad_unidad` = 'años'
WHERE (`edad_unidad` = '' OR `edad_unidad` LIKE 'd%')
  AND `fecha_nacimiento` IS NULL
  AND CASE WHEN `edad` REGEXP '^[0-9]+$' THEN CAST(`edad` AS UNSIGNED) ELSE 0 END >= 29;

-- Revision (solo lectura): pacientes que NO se pudieron deducir. En el paso 2 quedaran en NULL.
SELECT id, edad, fecha_nacimiento, HEX(edad_unidad) AS hex_unidad
FROM `pacientes`
WHERE `edad_unidad` IS NOT NULL AND `edad_unidad` NOT IN ('años', 'meses');
