-- 02_verificacion_receta_hc_cotizacion_automatica.sql
-- Verificacion post-deploy de tablas de sincronizacion receta HC -> cotizacion.
-- Compatible con phpMyAdmin (evita PREPARE/EXECUTE, que en algunos hosts
-- dispara "Undefined index: statement" al renderizar resultados).
--
-- Uso recomendado en produccion:
--   1) Ejecutar primero 01_schema_receta_hc_cotizacion_automatica.sql
--   2) Luego ejecutar este archivo en la base objetivo seleccionada.

DELIMITER $$

DROP PROCEDURE IF EXISTS sp_verificar_receta_hc_cotizacion $$
CREATE PROCEDURE sp_verificar_receta_hc_cotizacion()
BEGIN
  SELECT DATABASE() AS base_activa;

  SELECT
    table_name,
    engine,
    table_rows,
    create_time,
    update_time
  FROM information_schema.tables
  WHERE table_schema = DATABASE()
    AND table_name IN ('hc_receta_cotizacion_sync', 'hc_receta_cotizacion_items_pendientes')
  ORDER BY table_name;

  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = DATABASE()
      AND table_name = 'hc_receta_cotizacion_sync'
  ) THEN
    SELECT
      estado,
      COUNT(*) AS total
    FROM hc_receta_cotizacion_sync
    GROUP BY estado
    ORDER BY estado;
  ELSE
    SELECT 'hc_receta_cotizacion_sync NO EXISTE en la base activa' AS aviso;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = DATABASE()
      AND table_name = 'hc_receta_cotizacion_items_pendientes'
  ) THEN
    SELECT
      estado,
      COUNT(*) AS total
    FROM hc_receta_cotizacion_items_pendientes
    GROUP BY estado
    ORDER BY estado;
  ELSE
    SELECT 'hc_receta_cotizacion_items_pendientes NO EXISTE en la base activa' AS aviso;
  END IF;
END $$

DELIMITER ;

CALL sp_verificar_receta_hc_cotizacion();
DROP PROCEDURE IF EXISTS sp_verificar_receta_hc_cotizacion;
