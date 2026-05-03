-- Verificacion post deploy para produccion_medica_detalle

SELECT
    COUNT(*) AS total_items,
    SUM(CASE WHEN clasificacion_origen = 'produccion_medica' THEN 1 ELSE 0 END) AS total_produccion_medica,
    SUM(CASE WHEN clasificacion_origen = 'venta_directa' THEN 1 ELSE 0 END) AS total_venta_directa,
    ROUND(SUM(monto_neto_item), 2) AS monto_neto_total
FROM produccion_medica_detalle;

SELECT
    DATE(fecha_cobro) AS fecha,
    ROUND(SUM(monto_neto_item), 2) AS total_pmd,
    (
        SELECT ROUND(COALESCE(SUM(c.total), 0), 2)
        FROM cobros c
        WHERE c.estado = 'pagado'
          AND DATE(c.fecha_cobro) = DATE(pmd.fecha_cobro)
    ) AS total_cobros_pagados,
    ROUND(
        SUM(monto_neto_item) - (
            SELECT COALESCE(SUM(c.total), 0)
            FROM cobros c
            WHERE c.estado = 'pagado'
              AND DATE(c.fecha_cobro) = DATE(pmd.fecha_cobro)
        ),
        2
    ) AS diferencia
FROM produccion_medica_detalle pmd
GROUP BY DATE(fecha_cobro)
ORDER BY fecha DESC
LIMIT 31;

SELECT
    periodo_yyyymm,
    clasificacion_origen,
    COUNT(*) AS items,
    ROUND(SUM(monto_neto_item), 2) AS monto
FROM produccion_medica_detalle
GROUP BY periodo_yyyymm, clasificacion_origen
ORDER BY periodo_yyyymm DESC, clasificacion_origen ASC;
