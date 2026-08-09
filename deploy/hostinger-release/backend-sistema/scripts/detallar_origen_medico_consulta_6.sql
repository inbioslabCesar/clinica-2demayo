-- Pegar en la pestaña SQL de phpMyAdmin. No modifica datos.
-- Determina qué detalle de cotización originó medico_id=80 en la consulta 6.

SELECT
    cd.id AS detalle_id,
    cd.cotizacion_id,
    cd.consulta_id,
    cd.servicio_tipo,
    cd.servicio_id,
    cd.descripcion,
    cd.medico_id AS medico_en_detalle,
    CONCAT_WS(' ', m.nombre, m.apellido) AS medico_resuelto,
    ct.estado AS estado_cotizacion,
    ct.fecha AS fecha_cotizacion
FROM `u330560936_nutrimed_bd`.cotizaciones_detalle AS cd
LEFT JOIN `u330560936_nutrimed_bd`.medicos AS m
    ON m.id = cd.medico_id
LEFT JOIN `u330560936_nutrimed_bd`.cotizaciones AS ct
    ON ct.id = cd.cotizacion_id
WHERE cd.consulta_id = 6
ORDER BY cd.id;

SELECT
    id AS consulta_id,
    paciente_id,
    medico_id,
    fecha,
    hora,
    estado,
    tipo_consulta
FROM `u330560936_nutrimed_bd`.consultas
WHERE id = 6;