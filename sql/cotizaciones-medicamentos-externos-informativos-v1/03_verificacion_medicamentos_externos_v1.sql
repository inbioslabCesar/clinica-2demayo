-- Verificaciones sugeridas post-migracion

-- A) Totales de detalle externo
SELECT
    COUNT(*) AS total_externos,
    SUM(CASE WHEN incluir_en_cobro = 0 THEN 1 ELSE 0 END) AS externos_no_cobrables,
    SUM(CASE WHEN incluir_en_cobro = 1 THEN 1 ELSE 0 END) AS externos_cobrables
FROM cotizaciones_detalle
WHERE COALESCE(es_externo, 0) = 1;

-- B) Cotizaciones informativas
SELECT
    id,
    paciente_id,
    estado,
    total,
    total_pagado,
    saldo_pendiente,
    fecha
FROM cotizaciones
WHERE LOWER(TRIM(COALESCE(estado, ''))) = 'informativo'
ORDER BY id DESC
LIMIT 100;

-- C) Posibles anomalías: informativo con total > 0
SELECT id, estado, total, total_pagado, saldo_pendiente
FROM cotizaciones
WHERE LOWER(TRIM(COALESCE(estado, ''))) = 'informativo'
  AND COALESCE(total, 0) > 0.00001;
