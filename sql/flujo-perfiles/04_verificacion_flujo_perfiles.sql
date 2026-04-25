-- 04_verificacion_flujo_perfiles.sql
-- Verificacion rapida de estructura y consistencia inicial

SET @db_actual := DATABASE();
SET @db_actual := IF(
  @db_actual IS NULL OR @db_actual = '' OR @db_actual IN ('information_schema', 'mysql', 'performance_schema', 'sys'),
  (
    SELECT t.table_schema
    FROM information_schema.tables t
    WHERE t.table_name IN (
      'paquetes_perfiles',
      'paquetes_perfiles_items',
      'paquetes_perfiles_items_honorario_reglas',
      'paquetes_perfiles_ventas_snapshot'
    )
    GROUP BY t.table_schema
    ORDER BY
      SUM(t.table_name = 'paquetes_perfiles') DESC,
      SUM(t.table_name = 'paquetes_perfiles_items') DESC,
      SUM(t.table_name = 'paquetes_perfiles_items_honorario_reglas') DESC,
      SUM(t.table_name = 'paquetes_perfiles_ventas_snapshot') DESC,
      t.table_schema ASC
    LIMIT 1
  ),
  @db_actual
);

SELECT DATABASE() AS db_sesion, @db_actual AS db_objetivo;

-- Nota de compatibilidad:
-- phpMyAdmin puede mostrar notices internos al procesar EXECUTE/PREPARE en import.
-- Para evitarlo, esta verificacion usa consultas directas sobre la BD en sesion.
-- Asegura haber seleccionado la BD objetivo antes de ejecutar este script.

-- Conteo de tablas esperadas en el esquema actual
SELECT
  SUM(table_name = 'paquetes_perfiles') AS has_paquetes_perfiles,
  SUM(table_name = 'paquetes_perfiles_items') AS has_paquetes_perfiles_items,
  SUM(table_name = 'paquetes_perfiles_items_honorario_reglas') AS has_paquetes_perfiles_items_honorario_reglas,
  SUM(table_name = 'paquetes_perfiles_ventas_snapshot') AS has_paquetes_perfiles_ventas_snapshot
FROM information_schema.tables
WHERE table_schema = @db_actual
  AND table_name IN (
    'paquetes_perfiles',
    'paquetes_perfiles_items',
    'paquetes_perfiles_items_honorario_reglas',
    'paquetes_perfiles_ventas_snapshot'
  );

SELECT table_name
FROM information_schema.tables
WHERE table_schema = @db_actual
  AND table_name IN (
    'paquetes_perfiles',
    'paquetes_perfiles_items',
    'paquetes_perfiles_items_honorario_reglas',
    'paquetes_perfiles_ventas_snapshot'
  )
ORDER BY table_name;

-- Validacion de totales (BD seleccionada en la sesion actual)
SELECT
  (SELECT COUNT(*) FROM paquetes_perfiles) AS paquetes_total,
  (SELECT COUNT(*) FROM paquetes_perfiles_items) AS items_total,
  (SELECT COUNT(*) FROM paquetes_perfiles_items_honorario_reglas) AS reglas_honorario_total,
  (SELECT COUNT(*) FROM paquetes_perfiles_ventas_snapshot) AS snapshots_total;

-- Diagnostico para detectar items medicos potenciales sin medico asignado
SELECT id, paquete_id, source_type, descripcion_snapshot
FROM paquetes_perfiles_items
WHERE source_type IN ('consulta','ecografia','rayosx','procedimiento','operacion')
  AND (medico_id IS NULL OR medico_id = 0)
LIMIT 50;
