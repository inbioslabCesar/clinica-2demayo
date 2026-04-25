-- 03_verificacion_flujo_contrato.sql
-- Verificacion compatible con hosting restringido (sin information_schema).

SHOW TABLES LIKE 'contratos_plantillas';
SHOW TABLES LIKE 'contratos_plantillas_items';
SHOW TABLES LIKE 'contratos_plantillas_hitos';
SHOW TABLES LIKE 'contratos_paciente';
SHOW TABLES LIKE 'contratos_paciente_servicios';
SHOW TABLES LIKE 'agenda_contrato';
SHOW TABLES LIKE 'agenda_contrato_medicos';
SHOW TABLES LIKE 'paciente_seguimiento_pagos';
SHOW TABLES LIKE 'contratos_consumos';

SHOW COLUMNS FROM cotizaciones_detalle LIKE 'contrato_paciente_id';
SHOW COLUMNS FROM cotizaciones_detalle LIKE 'contrato_paciente_servicio_id';
SHOW COLUMNS FROM cotizaciones_detalle LIKE 'origen_cobro';
SHOW COLUMNS FROM cotizaciones_detalle LIKE 'monto_lista_referencial';
