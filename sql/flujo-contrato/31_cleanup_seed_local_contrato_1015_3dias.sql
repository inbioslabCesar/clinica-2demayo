-- 31_cleanup_seed_local_contrato_1015_3dias.sql
-- Limpia el seed local del flujo 3 dias para paciente 1015.

START TRANSACTION;

SET @seed_tag := 'SEED_LOCAL_CONTRATO_1015_3DIAS_V1';
SET @paciente_id := 1015;

CREATE TEMPORARY TABLE IF NOT EXISTS _tmp_seed_consultas AS
SELECT id
FROM consultas
WHERE paciente_id = @paciente_id
  AND BINARY origen_creacion IN (
    BINARY 'seed1015_d1',
    BINARY 'seed1015_d2',
    BINARY 'seed1015_d3'
  );

CREATE TEMPORARY TABLE IF NOT EXISTS _tmp_seed_contratos AS
SELECT id
FROM contratos_paciente
WHERE paciente_id = @paciente_id
  AND BINARY observaciones = BINARY @seed_tag;

CREATE TEMPORARY TABLE IF NOT EXISTS _tmp_seed_cotizaciones AS
SELECT id
FROM cotizaciones
WHERE paciente_id = @paciente_id
  AND BINARY observaciones LIKE BINARY CONCAT(@seed_tag, '%');

DELETE oi
FROM ordenes_imagen oi
WHERE oi.consulta_id IN (SELECT id FROM _tmp_seed_consultas);

DELETE ol
FROM ordenes_laboratorio ol
WHERE ol.consulta_id IN (SELECT id FROM _tmp_seed_consultas);

DELETE ce
FROM cotizacion_eventos ce
WHERE ce.cotizacion_id IN (SELECT id FROM _tmp_seed_cotizaciones);

DELETE cc
FROM contratos_consumos cc
WHERE cc.cotizacion_id IN (SELECT id FROM _tmp_seed_cotizaciones);

DELETE cd
FROM cotizaciones_detalle cd
WHERE cd.cotizacion_id IN (SELECT id FROM _tmp_seed_cotizaciones);

DELETE hc
FROM historia_clinica hc
WHERE hc.consulta_id IN (SELECT id FROM _tmp_seed_consultas);

UPDATE agenda_contrato
SET
  consulta_id = NULL,
  estado_evento = 'pendiente',
  ejecucion_estado = 'pendiente',
  ejecutado_en = NULL,
  cotizacion_id_ejecucion = NULL,
  updated_at = NOW()
WHERE contrato_paciente_id IN (SELECT id FROM _tmp_seed_contratos);

DELETE c
FROM cotizaciones c
WHERE c.id IN (SELECT id FROM _tmp_seed_cotizaciones);

DELETE c
FROM consultas c
WHERE c.id IN (SELECT id FROM _tmp_seed_consultas);

DELETE acm
FROM agenda_contrato_medicos acm
INNER JOIN agenda_contrato ac ON ac.id = acm.agenda_contrato_id
WHERE ac.contrato_paciente_id IN (SELECT id FROM _tmp_seed_contratos);

DELETE acss
FROM agenda_contrato_subservicios_snapshot acss
INNER JOIN agenda_contrato ac ON ac.id = acss.agenda_evento_id
WHERE ac.contrato_paciente_id IN (SELECT id FROM _tmp_seed_contratos);

DELETE ac
FROM agenda_contrato ac
WHERE ac.contrato_paciente_id IN (SELECT id FROM _tmp_seed_contratos);

DELETE cps
FROM contratos_paciente_servicios cps
WHERE cps.contrato_paciente_id IN (SELECT id FROM _tmp_seed_contratos);

DELETE cp
FROM contratos_paciente cp
WHERE cp.id IN (SELECT id FROM _tmp_seed_contratos);

DROP TEMPORARY TABLE IF EXISTS _tmp_seed_consultas;
DROP TEMPORARY TABLE IF EXISTS _tmp_seed_contratos;
DROP TEMPORARY TABLE IF EXISTS _tmp_seed_cotizaciones;

SELECT
  @seed_tag AS seed_tag,
  (SELECT COUNT(*) FROM contratos_paciente WHERE BINARY observaciones = BINARY @seed_tag) AS contratos_restantes,
  (SELECT COUNT(*) FROM cotizaciones WHERE paciente_id = @paciente_id AND BINARY observaciones LIKE BINARY CONCAT(@seed_tag, '%')) AS cotizaciones_restantes,
  (SELECT COUNT(*) FROM consultas WHERE paciente_id = @paciente_id AND BINARY origen_creacion IN (BINARY 'seed1015_d1', BINARY 'seed1015_d2', BINARY 'seed1015_d3')) AS consultas_restantes;

COMMIT;
