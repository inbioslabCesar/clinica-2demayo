-- 08_verificacion_finanzas_alerta.sql
-- Verificacion no destructiva de resumen financiero y alerta de liquidacion.

SELECT
  cp.id AS contrato_id,
  cp.paciente_id,
  cp.estado,
  cp.fecha_inicio,
  cp.fecha_fin,
  cp.monto_total,
  cp.saldo_pendiente,
  COALESCE(pag.total_abonado, 0) AS total_abonado,
  COALESCE(srv.servicios_totales, 0) AS servicios_totales,
  COALESCE(srv.servicios_consumidos, 0) AS servicios_consumidos,
  GREATEST(0, COALESCE(srv.servicios_totales, 0) - COALESCE(srv.servicios_consumidos, 0)) AS servicios_pendientes,
  ag.penultima_fecha_programada,
  CASE
    WHEN ag.penultima_fecha_programada IS NOT NULL THEN DATE_SUB(ag.penultima_fecha_programada, INTERVAL 7 DAY)
    ELSE NULL
  END AS fecha_alerta_liquidacion,
  CASE
    WHEN cp.saldo_pendiente > 0
      AND ag.penultima_fecha_programada IS NOT NULL
      AND CURDATE() BETWEEN DATE_SUB(DATE(ag.penultima_fecha_programada), INTERVAL 7 DAY) AND DATE(ag.penultima_fecha_programada)
    THEN 1 ELSE 0
  END AS alerta_liquidacion_critica,
  CASE
    WHEN cp.saldo_pendiente > 0
      AND ag.penultima_fecha_programada IS NOT NULL
      AND CURDATE() > DATE(ag.penultima_fecha_programada)
    THEN 1 ELSE 0
  END AS alerta_liquidacion_vencida
FROM contratos_paciente cp
LEFT JOIN (
  SELECT
    contrato_paciente_id,
    SUM(monto_pagado) AS total_abonado
  FROM paciente_seguimiento_pagos
  GROUP BY contrato_paciente_id
) pag ON pag.contrato_paciente_id = cp.id
LEFT JOIN (
  SELECT
    contrato_paciente_id,
    SUM(cantidad_total) AS servicios_totales,
    SUM(cantidad_consumida) AS servicios_consumidos
  FROM contratos_paciente_servicios
  GROUP BY contrato_paciente_id
) srv ON srv.contrato_paciente_id = cp.id
LEFT JOIN (
  SELECT
    a1.contrato_paciente_id,
    MAX(a1.fecha_programada) AS penultima_fecha_programada
  FROM agenda_contrato a1
  WHERE a1.estado_evento <> 'cancelado'
    AND a1.fecha_programada < (
      SELECT MAX(a2.fecha_programada)
      FROM agenda_contrato a2
      WHERE a2.contrato_paciente_id = a1.contrato_paciente_id
        AND a2.estado_evento <> 'cancelado'
    )
  GROUP BY a1.contrato_paciente_id
) ag ON ag.contrato_paciente_id = cp.id
ORDER BY cp.id DESC
LIMIT 100;
