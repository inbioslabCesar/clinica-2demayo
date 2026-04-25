-- 09_backfill_fecha_limite_liquidacion.sql
-- Backfill de fecha_limite_liquidacion para contratos historicos.
-- Prioriza penultima actividad programada; si no existe, usa fecha_fin.
-- Regla: fecha_limite_liquidacion = fecha_base - dias_anticipacion.
-- Version compatible con hosting restringido (sin information_schema).

START TRANSACTION;

-- Asegurar columna fecha_limite_liquidacion si no existiera en entornos rezagados.
ALTER TABLE contratos_paciente
  ADD COLUMN IF NOT EXISTS fecha_limite_liquidacion DATE NULL AFTER estado;

-- Backfill: usa penultima fecha de agenda no cancelada; si no hay, fecha_fin.
-- dias_anticipacion toma primero plantilla.dias_anticipacion_liquidacion; fallback 7.
UPDATE contratos_paciente cp
LEFT JOIN contratos_plantillas p ON p.id = cp.plantilla_id
LEFT JOIN (
  SELECT
    a1.contrato_paciente_id,
    MAX(a1.fecha_programada) AS penultima_fecha
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
SET cp.fecha_limite_liquidacion = DATE_SUB(
      DATE(COALESCE(pen.penultima_fecha, CONCAT(cp.fecha_fin, ' 00:00:00'))),
      INTERVAL GREATEST(0, COALESCE(p.dias_anticipacion_liquidacion, 7)) DAY
    )
WHERE cp.fecha_fin IS NOT NULL
  AND cp.fecha_limite_liquidacion IS NULL;

-- Normalizacion opcional para contratos con fecha_limite posterior al fin.
UPDATE contratos_paciente
SET fecha_limite_liquidacion = fecha_fin
WHERE fecha_fin IS NOT NULL
  AND fecha_limite_liquidacion IS NOT NULL
  AND fecha_limite_liquidacion > fecha_fin;

-- Resultado de control.
SELECT
  COUNT(*) AS contratos_total,
  SUM(fecha_limite_liquidacion IS NOT NULL) AS contratos_con_fecha_limite,
  SUM(fecha_limite_liquidacion IS NULL) AS contratos_sin_fecha_limite
FROM contratos_paciente;

COMMIT;
