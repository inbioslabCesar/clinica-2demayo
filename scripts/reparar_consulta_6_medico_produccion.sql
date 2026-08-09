-- Ejecutar en la pestaña SQL de phpMyAdmin.
-- Corrige exclusivamente la consulta 6, vinculada a la cotización pagada 9.
-- El médico válido es id=1: Luis Hildemaro Tecco Davila.

USE `u330560936_nutrimed_bd`;
START TRANSACTION;

-- La cotización anulada 8 guardó el ID inexistente 80.
UPDATE cotizaciones_detalle
SET medico_id = 1
WHERE id = 8
  AND cotizacion_id = 8
  AND consulta_id = 6
  AND medico_id = 80;

-- La consulta debe coincidir con la cotización 9 ya pagada y quedar visible al médico.
UPDATE consultas
SET medico_id = 1,
    estado = 'pendiente'
WHERE id = 6
  AND paciente_id = 2
  AND medico_id = 80
  AND LOWER(TRIM(COALESCE(estado, ''))) = 'cancelada';

SELECT
    c.id AS consulta_id,
    c.medico_id,
    CONCAT_WS(' ', m.nombre, m.apellido) AS medico,
    c.estado,
    cd.id AS detalle_anulado_id,
    cd.medico_id AS medico_detalle_anulado,
    ct.estado AS estado_cotizacion_anulada
FROM consultas AS c
LEFT JOIN medicos AS m ON m.id = c.medico_id
LEFT JOIN cotizaciones_detalle AS cd ON cd.id = 8
LEFT JOIN cotizaciones AS ct ON ct.id = cd.cotizacion_id
WHERE c.id = 6;

COMMIT;