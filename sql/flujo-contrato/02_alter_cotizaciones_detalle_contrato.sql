-- 02_alter_cotizaciones_detalle_contrato.sql
-- Extensiones para trazabilidad de cobertura contractual en cotizaciones.
-- Version compatible con hosting restringido (sin information_schema).

ALTER TABLE cotizaciones_detalle
  ADD COLUMN IF NOT EXISTS contrato_paciente_id BIGINT UNSIGNED NULL AFTER consulta_id;

ALTER TABLE cotizaciones_detalle
  ADD COLUMN IF NOT EXISTS contrato_paciente_servicio_id BIGINT UNSIGNED NULL AFTER contrato_paciente_id;

ALTER TABLE cotizaciones_detalle
  ADD COLUMN IF NOT EXISTS origen_cobro ENUM('regular','contrato','extra') NOT NULL DEFAULT 'regular' AFTER contrato_paciente_servicio_id;

ALTER TABLE cotizaciones_detalle
  ADD COLUMN IF NOT EXISTS monto_lista_referencial DECIMAL(12,2) NULL AFTER origen_cobro;

-- Ejecutar una sola vez en produccion. Si ya existen, puede devolver error de indice duplicado.
ALTER TABLE cotizaciones_detalle ADD INDEX idx_cot_det_origen (origen_cobro);
ALTER TABLE cotizaciones_detalle ADD INDEX idx_cot_det_contrato (contrato_paciente_id);
ALTER TABLE cotizaciones_detalle ADD INDEX idx_cot_det_contrato_servicio (contrato_paciente_servicio_id);

-- Verificacion rapida
SHOW COLUMNS FROM cotizaciones_detalle LIKE 'contrato_paciente_id';
SHOW COLUMNS FROM cotizaciones_detalle LIKE 'contrato_paciente_servicio_id';
SHOW COLUMNS FROM cotizaciones_detalle LIKE 'origen_cobro';
SHOW COLUMNS FROM cotizaciones_detalle LIKE 'monto_lista_referencial';
SHOW INDEX FROM cotizaciones_detalle WHERE Key_name IN ('idx_cot_det_origen','idx_cot_det_contrato','idx_cot_det_contrato_servicio');
