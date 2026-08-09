-- Ejecutar únicamente después de revisar diagnostico_medicos_produccion.sql.
-- Corrige el dominio IDN/Punycode de correos generados de Nutrimend Perú.
-- La transacción permite revisar el resultado antes de confirmar.
USE `u330560936_nutrimed_bd`;

START TRANSACTION;

UPDATE medicos
SET email = REPLACE(
    email,
    'xn--clnicanutrimedper-evb6x.com',
    'clinicanutrimedperu.com'
)
WHERE email LIKE '%@xn--clnicanutrimedper-evb6x.com';

SELECT id, nombre, apellido, email
FROM medicos
WHERE email LIKE '%@clinicanutrimedperu.com'
ORDER BY id;

COMMIT;