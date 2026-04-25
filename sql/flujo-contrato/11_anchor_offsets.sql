-- ============================================================
-- Migración 11: Anchors clínicos en contratos_paciente
--              + Offsets clínicos en contratos_plantillas_items
-- Fecha: 2026-04-19
-- Versión compatible con hosting restringido (sin INFORMATION_SCHEMA)
-- ============================================================

-- ----------------------------------------------------------------
-- 1. contratos_paciente: anchor_tipo + anchor_fecha
-- ----------------------------------------------------------------
-- anchor_tipo: el punto de referencia clínico del contrato
--   ninguno         -> comportamiento actual (base = fecha_inicio)
--   fur             -> Fecha Última Regla (cálculos gestacionales)
--   fecha_cirugia   -> fecha programada de cirugía
--   fecha_parto_estimada -> fecha probable de parto (FPP)
--   fecha_inicio_tratamiento -> inicio real de tratamiento
-- anchor_fecha: la fecha concreta del anchor
-- ----------------------------------------------------------------
ALTER TABLE contratos_paciente
  ADD COLUMN IF NOT EXISTS anchor_tipo ENUM('ninguno','fur','fecha_cirugia','fecha_parto_estimada','fecha_inicio_tratamiento')
  NOT NULL DEFAULT 'ninguno' AFTER observaciones;

ALTER TABLE contratos_paciente
  ADD COLUMN IF NOT EXISTS anchor_fecha DATE NULL AFTER anchor_tipo;

-- ----------------------------------------------------------------
-- 2. contratos_plantillas_items: offset_tipo + offset_valor + offset_unidad
-- ----------------------------------------------------------------
-- offset_tipo:
--   ninguno            -> usa orden_programado × 7 días (comportamiento actual)
--   relativo_anchor    -> anchor_fecha + offset_valor * offset_unidad
--   semana_gestacional -> FUR + semanas × 7 días (solo cuando anchor_tipo = 'fur')
-- offset_valor: cantidad de días / semanas / meses a sumar al anchor
-- offset_unidad: unidad de tiempo del offset
-- ----------------------------------------------------------------
ALTER TABLE contratos_plantillas_items
  ADD COLUMN IF NOT EXISTS offset_tipo ENUM('ninguno','relativo_anchor','semana_gestacional')
  NOT NULL DEFAULT 'ninguno' AFTER regla_uso;

ALTER TABLE contratos_plantillas_items
  ADD COLUMN IF NOT EXISTS offset_valor INT NOT NULL DEFAULT 0 AFTER offset_tipo;

ALTER TABLE contratos_plantillas_items
  ADD COLUMN IF NOT EXISTS offset_unidad ENUM('dias','semanas','meses')
  NOT NULL DEFAULT 'semanas' AFTER offset_valor;

-- ----------------------------------------------------------------
-- 3. Verificación final (sin INFORMATION_SCHEMA)
-- ----------------------------------------------------------------
SHOW COLUMNS FROM contratos_paciente LIKE 'anchor_tipo';
SHOW COLUMNS FROM contratos_paciente LIKE 'anchor_fecha';

SHOW COLUMNS FROM contratos_plantillas_items LIKE 'offset_tipo';
SHOW COLUMNS FROM contratos_plantillas_items LIKE 'offset_valor';
SHOW COLUMNS FROM contratos_plantillas_items LIKE 'offset_unidad';
