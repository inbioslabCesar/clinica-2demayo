-- 07_indices_finanzas_alerta_liquidacion.sql
-- Indices de soporte para consultas de estado de cuenta y alertas de liquidacion.
-- Version compatible con hosting restringido (sin information_schema).

-- Ejecutar una sola vez en produccion. Si ya existen, puede devolver error de indice duplicado.
CREATE INDEX idx_agenda_contrato_alerta ON agenda_contrato (contrato_paciente_id, estado_evento, fecha_programada);
CREATE INDEX idx_pagos_contrato_created ON paciente_seguimiento_pagos (contrato_paciente_id, created_at);
CREATE INDEX idx_cps_resumen_contrato ON contratos_paciente_servicios (contrato_paciente_id, estado);

-- Verificacion rapida
SHOW INDEX FROM agenda_contrato WHERE Key_name = 'idx_agenda_contrato_alerta';
SHOW INDEX FROM paciente_seguimiento_pagos WHERE Key_name = 'idx_pagos_contrato_created';
SHOW INDEX FROM contratos_paciente_servicios WHERE Key_name = 'idx_cps_resumen_contrato';
