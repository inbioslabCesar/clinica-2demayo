-- 10_auditoria_consolidada_contratos.sql
-- Auditoria consolidada no destructiva para validar estado del flujo de contratos.
-- Version compatible con hosting restringido (sin information_schema).

-- 1) Estado de indices criticos para rendimiento.
SHOW INDEX FROM agenda_contrato WHERE Key_name = 'idx_agenda_contrato_alerta';
SHOW INDEX FROM paciente_seguimiento_pagos WHERE Key_name = 'idx_pagos_contrato_created';
SHOW INDEX FROM contratos_paciente_servicios WHERE Key_name = 'idx_cps_resumen_contrato';

-- 2) Resumen global de contratos y calidad de datos.
SELECT
  'resumen_global' AS bloque,
  COUNT(*) AS contratos_total,
  SUM(cp.estado = 'activo') AS contratos_activos,
  SUM(cp.saldo_pendiente > 0) AS contratos_con_deuda,
  SUM(cp.fecha_limite_liquidacion IS NULL) AS contratos_sin_fecha_limite,
  SUM(cp.fecha_fin IS NOT NULL AND cp.fecha_limite_liquidacion IS NOT NULL AND cp.fecha_limite_liquidacion > cp.fecha_fin) AS fecha_limite_invalida
FROM contratos_paciente cp;

-- 3) Top contratos con alerta de liquidacion (critica / vencida).
SELECT
  'alertas_top' AS bloque,
  base.contrato_id,
  base.paciente_id,
  base.estado,
  base.saldo_pendiente,
  base.penultima_fecha_programada,
  base.fecha_alerta_liquidacion,
  base.alerta_liquidacion_critica,
  base.alerta_liquidacion_vencida
FROM (
  SELECT
    cp.id AS contrato_id,
    cp.paciente_id,
    cp.estado,
    cp.saldo_pendiente,
    pen.penultima_fecha_programada,
    CASE
      WHEN pen.penultima_fecha_programada IS NOT NULL THEN DATE_SUB(DATE(pen.penultima_fecha_programada), INTERVAL 7 DAY)
      ELSE NULL
    END AS fecha_alerta_liquidacion,
    CASE
      WHEN cp.saldo_pendiente > 0
        AND pen.penultima_fecha_programada IS NOT NULL
        AND CURDATE() BETWEEN DATE_SUB(DATE(pen.penultima_fecha_programada), INTERVAL 7 DAY) AND DATE(pen.penultima_fecha_programada)
      THEN 1 ELSE 0
    END AS alerta_liquidacion_critica,
    CASE
      WHEN cp.saldo_pendiente > 0
        AND pen.penultima_fecha_programada IS NOT NULL
        AND CURDATE() > DATE(pen.penultima_fecha_programada)
      THEN 1 ELSE 0
    END AS alerta_liquidacion_vencida
  FROM contratos_paciente cp
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
  ) pen ON pen.contrato_paciente_id = cp.id
) base
WHERE base.alerta_liquidacion_critica = 1
   OR base.alerta_liquidacion_vencida = 1
ORDER BY base.alerta_liquidacion_vencida DESC, base.alerta_liquidacion_critica DESC, base.contrato_id DESC
LIMIT 20;

-- 4) Top contratos con resumen financiero + consumo.
SELECT
  'finanzas_consumo_top' AS bloque,
  cp.id AS contrato_id,
  cp.paciente_id,
  cp.estado,
  cp.monto_total,
  cp.saldo_pendiente,
  COALESCE(pag.total_abonado, 0) AS total_abonado,
  COALESCE(srv.servicios_totales, 0) AS servicios_totales,
  COALESCE(srv.servicios_consumidos, 0) AS servicios_consumidos,
  GREATEST(0, COALESCE(srv.servicios_totales, 0) - COALESCE(srv.servicios_consumidos, 0)) AS servicios_pendientes
FROM contratos_paciente cp
LEFT JOIN (
  SELECT contrato_paciente_id, SUM(monto_pagado) AS total_abonado
  FROM paciente_seguimiento_pagos
  GROUP BY contrato_paciente_id
) pag ON pag.contrato_paciente_id = cp.id
LEFT JOIN (
  SELECT contrato_paciente_id, SUM(cantidad_total) AS servicios_totales, SUM(cantidad_consumida) AS servicios_consumidos
  FROM contratos_paciente_servicios
  GROUP BY contrato_paciente_id
) srv ON srv.contrato_paciente_id = cp.id
ORDER BY cp.id DESC
LIMIT 20;
