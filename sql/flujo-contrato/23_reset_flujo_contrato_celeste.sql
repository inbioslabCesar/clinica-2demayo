-- 23_reset_flujo_contrato_celeste.sql
-- Limpia exclusivamente el escenario seed de Celeste generado por:
--   22_seed_flujo_contrato_celeste.sql

START TRANSACTION;

SET @seed_tag := 'SEED_FLUJO_CONTRATO_CELESTE_V1';
SET @paciente_id := (
    SELECT id
    FROM pacientes
    WHERE historia_clinica = 'HC00939'
    ORDER BY id DESC
    LIMIT 1
);

DELETE idr
FROM ingresos_diarios idr
WHERE BINARY idr.referencia_tabla = BINARY 'paciente_seguimiento_pagos'
  AND LOCATE(BINARY @seed_tag, BINARY idr.descripcion) > 0;

DELETE cm
FROM cotizacion_movimientos cm
INNER JOIN cotizaciones c ON c.id = cm.cotizacion_id
WHERE BINARY c.observaciones = BINARY @seed_tag;

DELETE ce
FROM cotizacion_eventos ce
INNER JOIN cotizaciones c ON c.id = ce.cotizacion_id
WHERE BINARY c.observaciones = BINARY @seed_tag;

DELETE cc
FROM contratos_consumos cc
WHERE BINARY cc.observaciones = BINARY @seed_tag;

DELETE psp
FROM paciente_seguimiento_pagos psp
INNER JOIN contratos_paciente cp ON cp.id = psp.contrato_paciente_id
WHERE BINARY cp.observaciones = BINARY @seed_tag;

DELETE cd
FROM cobros_detalle cd
INNER JOIN cobros cb ON cb.id = cd.cobro_id
WHERE BINARY cb.observaciones = BINARY @seed_tag;

DELETE cb
FROM cobros cb
WHERE BINARY cb.observaciones = BINARY @seed_tag;

DELETE cdet
FROM cotizaciones_detalle cdet
INNER JOIN cotizaciones c ON c.id = cdet.cotizacion_id
WHERE BINARY c.observaciones = BINARY @seed_tag;

DELETE c
FROM cotizaciones c
WHERE BINARY c.observaciones = BINARY @seed_tag;

DELETE tr
FROM triaje tr
INNER JOIN consultas q ON q.id = tr.consulta_id
WHERE BINARY q.origen_creacion = BINARY 'contrato_agenda'
  AND q.paciente_id = @paciente_id
  AND q.cobro_id IS NULL;

DELETE q
FROM consultas q
WHERE BINARY q.origen_creacion = BINARY 'contrato_agenda'
  AND q.paciente_id = @paciente_id
  AND q.es_control = 0
  AND q.hc_origen_id IS NULL
  AND q.cobro_id IS NULL;

DELETE ac
FROM agenda_contrato ac
INNER JOIN contratos_paciente cp ON cp.id = ac.contrato_paciente_id
WHERE BINARY cp.observaciones = BINARY @seed_tag;

DELETE cps
FROM contratos_paciente_servicios cps
INNER JOIN contratos_paciente cp ON cp.id = cps.contrato_paciente_id
WHERE BINARY cp.observaciones = BINARY @seed_tag;

DELETE cp
FROM contratos_paciente cp
WHERE BINARY cp.observaciones = BINARY @seed_tag;

COMMIT;

-- Validacion post reset
SELECT
  @seed_tag AS seed_tag,
  (SELECT COUNT(*) FROM contratos_paciente WHERE BINARY observaciones = BINARY @seed_tag) AS contratos,
  (SELECT COUNT(*) FROM cotizaciones WHERE BINARY observaciones = BINARY @seed_tag) AS cotizaciones,
  (SELECT COUNT(*) FROM cobros WHERE BINARY observaciones = BINARY @seed_tag) AS cobros,
  (SELECT COUNT(*) FROM contratos_consumos WHERE BINARY observaciones = BINARY @seed_tag) AS consumos;
