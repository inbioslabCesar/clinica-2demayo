-- Pegar este contenido en la pestaña SQL de phpMyAdmin.
-- No usar la pestaña Importar. Es de solo lectura.

SELECT VERSION() AS version_mysql, DATABASE() AS base_seleccionada;

SELECT
    table_name,
    engine,
    table_collation
FROM information_schema.tables
WHERE table_schema = 'u330560936_nutrimed_bd'
  AND table_name IN ('medicos', 'medico_condiciones_pago');

SELECT
    table_name,
    column_name,
    column_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'u330560936_nutrimed_bd'
  AND table_name IN ('medicos', 'medico_condiciones_pago')
ORDER BY table_name, ordinal_position;

SELECT
    id,
    nombre,
    apellido,
    email,
    HEX(email) AS email_hex
FROM `u330560936_nutrimed_bd`.medicos
WHERE email LIKE '%xn--%'
   OR email LIKE '%nutrimed%'
ORDER BY id;