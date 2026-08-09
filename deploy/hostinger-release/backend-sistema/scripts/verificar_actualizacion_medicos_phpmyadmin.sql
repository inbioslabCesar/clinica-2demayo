-- Pegar en la pestaña SQL de phpMyAdmin. No modifica datos.

SELECT
    m.id AS medico_id,
    CONCAT_WS(' ', m.nombre, m.apellido) AS medico,
    m.email,
    c.id AS condicion_id,
    c.modalidad_pago,
    c.monto_hora,
    c.frecuencia_pago,
    c.permite_adelanto,
    c.tope_adelanto_periodo,
    c.vigencia_desde,
    c.vigencia_hasta,
    c.activo
FROM `u330560936_nutrimed_bd`.medicos AS m
LEFT JOIN `u330560936_nutrimed_bd`.medico_condiciones_pago AS c
    ON c.medico_id = m.id
WHERE m.id IN (1, 2)
ORDER BY m.id, c.id;

SELECT
    table_name,
    index_name,
    non_unique,
    seq_in_index,
    column_name
FROM information_schema.statistics
WHERE table_schema = 'u330560936_nutrimed_bd'
  AND table_name IN ('medicos', 'medico_condiciones_pago')
ORDER BY table_name, index_name, seq_in_index;

SELECT
    CONSTRAINT_NAME,
    TABLE_NAME,
    COLUMN_NAME,
    REFERENCED_TABLE_NAME,
    REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'u330560936_nutrimed_bd'
  AND TABLE_NAME IN ('medicos', 'medico_condiciones_pago')
  AND REFERENCED_TABLE_NAME IS NOT NULL;