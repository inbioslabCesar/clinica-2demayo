-- ============================================================
-- FIX #12 y #34: receta vacía / sin medicamentos → anular
-- ============================================================
UPDATE cotizaciones
SET estado = 'anulada'
WHERE id IN (12, 34)
  AND total = 0
  AND (SELECT COUNT(*) FROM cotizaciones_detalle WHERE cotizacion_id = cotizaciones.id AND estado_item = 'activo') = 0;

-- Verificar
SELECT id, estado, total FROM cotizaciones WHERE id IN (12, 34);

