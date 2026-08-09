-- Pegar en la pestaña SQL de phpMyAdmin. No modifica datos.
-- Diagnostica la consulta mostrada en la URL: /historia-clinica-lectura/2/6

SELECT
    c.id AS consulta_id,
    c.paciente_id,
    CONCAT_WS(' ', p.nombre, p.apellido) AS paciente,
    c.medico_id AS medico_asignado_id,
    CONCAT_WS(' ', m.nombre, m.apellido) AS medico_resuelto,
    m.especialidad AS especialidad_medico,
    c.fecha,
    c.hora,
    c.estado AS estado_consulta,
    hc.id AS historia_clinica_id,
    hc.fecha_registro AS fecha_hc,
    ag.eventos_contrato,
    ag.estados_contrato,
    cd.detalles_consulta,
    cd.medicos_en_detalle,
    CASE
        WHEN c.medico_id IS NULL OR c.medico_id = 0 THEN 'SIN_MEDICO_ASIGNADO'
        WHEN m.id IS NULL THEN 'MEDICO_ID_NO_EXISTE_EN_CATALOGO'
        WHEN ag.eventos_contrato > 0 AND ag.eventos_visibles_medico = 0 THEN 'BLOQUEADA_POR_EVENTO_CONTRATO'
        ELSE 'VINCULO_MEDICO_VALIDO'
    END AS diagnostico
FROM `u330560936_nutrimed_bd`.consultas AS c
LEFT JOIN `u330560936_nutrimed_bd`.pacientes AS p
    ON p.id = c.paciente_id
LEFT JOIN `u330560936_nutrimed_bd`.medicos AS m
    ON m.id = c.medico_id
LEFT JOIN (
    SELECT
        consulta_id,
        MIN(id) AS id,
        MAX(fecha_registro) AS fecha_registro
    FROM `u330560936_nutrimed_bd`.historia_clinica
    WHERE consulta_id = 6
    GROUP BY consulta_id
) AS hc
    ON hc.consulta_id = c.id
LEFT JOIN (
    SELECT
        consulta_id,
        COUNT(*) AS eventos_contrato,
        SUM(LOWER(TRIM(COALESCE(estado_evento, ''))) IN ('atendido', 'espontaneo')) AS eventos_visibles_medico,
        GROUP_CONCAT(CONCAT(id, ':', COALESCE(estado_evento, 'NULL')) ORDER BY id SEPARATOR ', ') AS estados_contrato
    FROM `u330560936_nutrimed_bd`.agenda_contrato
    WHERE consulta_id = 6
    GROUP BY consulta_id
) AS ag
    ON ag.consulta_id = c.id
LEFT JOIN (
    SELECT
        consulta_id,
        COUNT(*) AS detalles_consulta,
        GROUP_CONCAT(DISTINCT COALESCE(medico_id, 0) ORDER BY medico_id SEPARATOR ', ') AS medicos_en_detalle
    FROM `u330560936_nutrimed_bd`.cotizaciones_detalle
    WHERE consulta_id = 6
    GROUP BY consulta_id
) AS cd
    ON cd.consulta_id = c.id
WHERE c.id = 6;

SELECT
    id AS medico_id,
    CONCAT_WS(' ', nombre, apellido) AS medico,
    email,
    especialidad
FROM `u330560936_nutrimed_bd`.medicos
ORDER BY id;