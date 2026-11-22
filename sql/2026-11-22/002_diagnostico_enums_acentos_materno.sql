-- 2026-11-22 | DIAGNOSTICO (SOLO LECTURA, sin cambios de BD) | BD: u330560936_materno_bd
-- Los ENUM turno / dia_semana / edad_unidad tienen valores con caracteres danados
-- (p. ej. 'maÃ±ana'), por lo que el codigo que guarda 'mañana', 'miércoles', 'sábado',
-- 'días' o 'años' termina grabando '' (cadena vacia).
-- Ejecutar en phpMyAdmin (BD seleccionada), una consulta a la vez. HEX permite ver los bytes reales:
--   'ñ' correcto = C3B1 | 'Ã±' danado = C383C2B1 | '' vacio = (sin bytes)

-- Consulta 1: valores reales por columna
SELECT 'cajas.turno' AS columna, HEX(turno) AS hex_valor, COUNT(*) AS filas FROM cajas GROUP BY turno
UNION ALL SELECT 'egresos.turno', HEX(turno), COUNT(*) FROM egresos GROUP BY turno
UNION ALL SELECT 'ingresos_diarios.turno', HEX(turno), COUNT(*) FROM ingresos_diarios GROUP BY turno
UNION ALL SELECT 'honorarios_medicos_movimientos.turno', HEX(turno), COUNT(*) FROM honorarios_medicos_movimientos GROUP BY turno
UNION ALL SELECT 'disponibilidad_medicos.dia_semana', HEX(dia_semana), COUNT(*) FROM disponibilidad_medicos GROUP BY dia_semana
UNION ALL SELECT 'pacientes.edad_unidad', HEX(edad_unidad), COUNT(*) FROM pacientes GROUP BY edad_unidad;

-- Consulta 2: pacientes con edad_unidad vacia o danada, segun su edad real (por fecha de nacimiento)
SELECT HEX(edad_unidad) AS hex_unidad,
       CASE WHEN fecha_nacimiento IS NULL THEN 'sin_fecha_nacimiento'
            WHEN TIMESTAMPDIFF(DAY, fecha_nacimiento, CURDATE()) <= 28 THEN 'hasta_28_dias'
            WHEN TIMESTAMPDIFF(MONTH, fecha_nacimiento, CURDATE()) < 12 THEN 'menos_de_12_meses'
            ELSE '12_meses_o_mas' END AS edad_real,
       COUNT(*) AS filas
FROM pacientes
GROUP BY HEX(edad_unidad), edad_real
ORDER BY hex_unidad, edad_real;

-- Consulta 3: disponibilidad de medicos con dia vacio (¿se puede deducir por fecha?)
SELECT HEX(dia_semana) AS hex_dia,
       CASE WHEN fecha IS NULL THEN 'sin_fecha' ELSE DAYOFWEEK(fecha) END AS dayofweek_1dom_7sab,
       COUNT(*) AS filas
FROM disponibilidad_medicos
GROUP BY HEX(dia_semana), dayofweek_1dom_7sab
ORDER BY hex_dia;
