-- 17_verificacion_tipo_ingreso_contrato_abono.sql
-- Verificaciones rapidas post-migracion

SHOW COLUMNS FROM ingresos_diarios LIKE 'tipo_ingreso';

SELECT tipo_ingreso, COUNT(*) AS cantidad, ROUND(SUM(monto), 2) AS monto_total
FROM ingresos_diarios
GROUP BY tipo_ingreso
ORDER BY cantidad DESC;

SELECT
  COUNT(*) AS movimientos_contrato_abono,
  ROUND(COALESCE(SUM(monto), 0), 2) AS monto_contrato_abono
FROM ingresos_diarios
WHERE tipo_ingreso = 'contrato_abono';

SELECT
  COUNT(*) AS registros_legacy_otros,
  ROUND(COALESCE(SUM(monto), 0), 2) AS monto_legacy_otros
FROM ingresos_diarios
WHERE tipo_ingreso = 'otros'
  AND referencia_tabla = 'paciente_seguimiento_pagos';
