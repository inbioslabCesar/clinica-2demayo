-- 01_precheck_flujo_perfiles.sql
-- Verifica tablas base del flujo actual antes de agregar Paquetes/Perfiles

SELECT DATABASE() AS db_actual;

SELECT table_name
FROM information_schema.tables
WHERE table_schema = DATABASE()
  AND table_name IN (
    'cotizaciones',
    'cotizaciones_detalle',
    'cotizacion_movimientos',
    'cobros',
    'cobros_detalle',
    'honorarios_medicos_movimientos',
    'configuracion_honorarios_medicos',
    'laboratorio_referencia_movimientos',
    'ingresos_diarios'
  )
ORDER BY table_name;

SELECT
  SUM(table_name = 'cotizaciones') AS ok_cotizaciones,
  SUM(table_name = 'cobros') AS ok_cobros,
  SUM(table_name = 'honorarios_medicos_movimientos') AS ok_honorarios,
  SUM(table_name = 'laboratorio_referencia_movimientos') AS ok_lab_ref
FROM information_schema.tables
WHERE table_schema = DATABASE()
  AND table_name IN ('cotizaciones','cobros','honorarios_medicos_movimientos','laboratorio_referencia_movimientos');
