-- 19_verificacion_hc_cadena_contrato.sql
-- Verificaciones rapidas post-migracion HC encadenada + contratos

SHOW COLUMNS FROM historia_clinica LIKE 'hc_parent_id';
SHOW COLUMNS FROM historia_clinica LIKE 'hc_root_id';
SHOW COLUMNS FROM historia_clinica LIKE 'chain_depth';
SHOW COLUMNS FROM historia_clinica LIKE 'contrato_paciente_id';
SHOW COLUMNS FROM historia_clinica LIKE 'agenda_contrato_id';
SHOW COLUMNS FROM historia_clinica LIKE 'chain_status';
SHOW COLUMNS FROM historia_clinica LIKE 'updated_seq';

SHOW INDEX FROM historia_clinica
WHERE Key_name IN ('idx_hc_parent_id', 'idx_hc_root_depth', 'idx_hc_contrato_evento', 'idx_hc_chain_status');

SHOW TABLES LIKE 'hc_chain_auditoria';

SELECT
  COUNT(*) AS total_hc,
  SUM(CASE WHEN hc_parent_id IS NULL THEN 1 ELSE 0 END) AS nodos_raiz,
  SUM(CASE WHEN hc_parent_id IS NOT NULL THEN 1 ELSE 0 END) AS nodos_hijo,
  SUM(CASE WHEN chain_status = 'anulada' THEN 1 ELSE 0 END) AS nodos_anulados
FROM historia_clinica;

SELECT
  chain_depth,
  COUNT(*) AS total
FROM historia_clinica
GROUP BY chain_depth
ORDER BY chain_depth;

SELECT
  COUNT(*) AS hcs_con_contexto_contrato,
  SUM(CASE WHEN agenda_contrato_id IS NOT NULL THEN 1 ELSE 0 END) AS hcs_con_evento_agenda
FROM historia_clinica
WHERE contrato_paciente_id IS NOT NULL OR agenda_contrato_id IS NOT NULL;

SELECT
  h.id AS hc_id,
  h.consulta_id,
  h.hc_parent_id,
  h.hc_root_id,
  h.chain_depth,
  h.chain_status,
  h.contrato_paciente_id,
  h.agenda_contrato_id
FROM historia_clinica h
ORDER BY h.id DESC
LIMIT 30;

SELECT
  h.id AS hc_hija,
  h.hc_parent_id,
  p.id AS hc_parent_real,
  h.chain_status
FROM historia_clinica h
LEFT JOIN historia_clinica p ON p.id = h.hc_parent_id
WHERE h.hc_parent_id IS NOT NULL
  AND p.id IS NULL;
