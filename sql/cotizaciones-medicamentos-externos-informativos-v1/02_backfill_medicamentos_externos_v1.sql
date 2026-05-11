-- v1: Backfill de datos históricos para marcar filas no mapeadas como externas/no cobrables

-- 1) Marcar detalle farmacia con servicio_id 0 como externo y no cobrable
UPDATE cotizaciones_detalle
SET
    es_externo = 1,
    incluir_en_cobro = 0,
    nombre_externo = COALESCE(NULLIF(TRIM(descripcion), ''), nombre_externo, 'Medicamento externo / no disponible'),
    motivo_externo = COALESCE(NULLIF(motivo_externo, ''), 'servicio_id_0_historico')
WHERE LOWER(TRIM(COALESCE(servicio_tipo, ''))) = 'farmacia'
  AND COALESCE(servicio_id, 0) = 0;

-- 2) Recalcular total solo cobrable y estado financiero por cotizacion
--    Reglas:
--    - total = suma subtotales activos con incluir_en_cobro=1
--    - saldo_pendiente = max(total - total_pagado, 0)
--    - estado =
--        informativo  si total=0 y hay externos activos
--        pagado       si saldo=0
--        parcial      si total_pagado>0 y saldo>0
--        pendiente    en otro caso
UPDATE cotizaciones c
LEFT JOIN (
    SELECT
        cd.cotizacion_id,
        ROUND(SUM(CASE
            WHEN (COALESCE(cd.estado_item, 'activo') <> 'eliminado') AND COALESCE(cd.incluir_en_cobro, 1) = 1
                THEN COALESCE(cd.subtotal, 0)
            ELSE 0
        END), 2) AS total_cobrable,
        SUM(CASE
            WHEN (COALESCE(cd.estado_item, 'activo') <> 'eliminado') AND COALESCE(cd.es_externo, 0) = 1
                THEN 1
            ELSE 0
        END) AS externos_activos
    FROM cotizaciones_detalle cd
    GROUP BY cd.cotizacion_id
) r ON r.cotizacion_id = c.id
SET
    c.total = COALESCE(r.total_cobrable, 0),
    c.saldo_pendiente = GREATEST(COALESCE(r.total_cobrable, 0) - COALESCE(c.total_pagado, 0), 0),
    c.estado = CASE
        WHEN COALESCE(r.total_cobrable, 0) <= 0.00001 AND COALESCE(r.externos_activos, 0) > 0 THEN 'informativo'
        WHEN GREATEST(COALESCE(r.total_cobrable, 0) - COALESCE(c.total_pagado, 0), 0) <= 0.00001 THEN 'pagado'
        WHEN COALESCE(c.total_pagado, 0) > 0 THEN 'parcial'
        ELSE 'pendiente'
    END;
