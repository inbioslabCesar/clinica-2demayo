-- 21_cleanup_prueba_3dias.sql
-- Limpia los datos del seed de prueba del contrato 3 dias de LEONCIO (id=983).
-- Ejecutar antes de repetir el seed 21.

START TRANSACTION;

-- Guardar los ids del contrato de prueba
-- (solo los creados por el seed, identificados por la observacion)
SET @cp_ids_csv = (
    SELECT GROUP_CONCAT(id) FROM contratos_paciente
    WHERE paciente_id = 983
      AND observaciones LIKE '%Seed de prueba 3 dias%'
);

-- Consultas vinculadas a la agenda del contrato de prueba
CREATE TEMPORARY TABLE IF NOT EXISTS _tmp_consultas_prueba AS
SELECT DISTINCT ag.consulta_id AS id
FROM agenda_contrato ag
INNER JOIN contratos_paciente cp ON cp.id = ag.contrato_paciente_id
WHERE cp.paciente_id = 983
  AND cp.observaciones LIKE '%Seed de prueba 3 dias%'
  AND ag.consulta_id IS NOT NULL;

-- HC vinculadas
CREATE TEMPORARY TABLE IF NOT EXISTS _tmp_hc_prueba AS
SELECT id FROM historia_clinica
WHERE consulta_id IN (SELECT id FROM _tmp_consultas_prueba);

-- Eliminar ordenes
DELETE FROM ordenes_imagen
WHERE consulta_id IN (SELECT id FROM _tmp_consultas_prueba);

DELETE FROM ordenes_laboratorio
WHERE consulta_id IN (SELECT id FROM _tmp_consultas_prueba);

-- Eliminar HC
DELETE FROM historia_clinica
WHERE id IN (SELECT id FROM _tmp_hc_prueba);

-- Eliminar agenda
DELETE ag FROM agenda_contrato ag
INNER JOIN contratos_paciente cp ON cp.id = ag.contrato_paciente_id
WHERE cp.paciente_id = 983
  AND cp.observaciones LIKE '%Seed de prueba 3 dias%';

-- Eliminar consultas
DELETE FROM consultas
WHERE id IN (SELECT id FROM _tmp_consultas_prueba);

-- Eliminar contrato paciente
DELETE FROM contratos_paciente
WHERE paciente_id = 983
  AND observaciones LIKE '%Seed de prueba 3 dias%';

-- Limpiar temporales
DROP TEMPORARY TABLE IF EXISTS _tmp_consultas_prueba;
DROP TEMPORARY TABLE IF EXISTS _tmp_hc_prueba;

COMMIT;

SELECT 'Cleanup completado - seed de prueba eliminado' AS estado;
