-- 94_eliminar_ordenes_legacy_canceladas.sql
-- Elimina permanentemente las órdenes de imagen legacy (sin token de detalle)
-- que ya fueron canceladas por el script 93 y no tienen archivos adjuntos.
--
-- Criterio de "legacy":
--   indicaciones = 'Orden creada desde cotizacion #<N>'
--   (sin prefijo "Detalle #<id> - ")
--   estado = 'cancelado'
--   sin archivos en ordenes_imagen_archivos
--
-- Modo seguro:
--   p_apply = 0 -> ROLLBACK (solo preview)
--   p_apply = 1 -> COMMIT (borra definitivamente)

DELIMITER $$

DROP PROCEDURE IF EXISTS sp_eliminar_ordenes_legacy_canceladas $$
CREATE PROCEDURE sp_eliminar_ordenes_legacy_canceladas(IN p_apply TINYINT)
BEGIN
    DECLARE v_old_fk INT DEFAULT 1;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SET FOREIGN_KEY_CHECKS = v_old_fk;
        RESIGNAL;
    END;

    START TRANSACTION;
    SET v_old_fk = @@FOREIGN_KEY_CHECKS;
    SET FOREIGN_KEY_CHECKS = 0;

    DROP TEMPORARY TABLE IF EXISTS tmp_legacy_del;

    -- Órdenes legacy canceladas sin archivos
    CREATE TEMPORARY TABLE tmp_legacy_del (
        orden_id INT PRIMARY KEY,
        cotizacion_id INT,
        indicaciones VARCHAR(700) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    ) ENGINE=Memory;

    INSERT INTO tmp_legacy_del (orden_id, cotizacion_id, indicaciones)
    SELECT
        oi.id,
        oi.cotizacion_id,
        oi.indicaciones
    FROM ordenes_imagen oi
    LEFT JOIN ordenes_imagen_archivos oia ON oia.orden_id = oi.id
    WHERE oi.estado = 'cancelado'
      AND oi.cotizacion_id IS NOT NULL
      AND oi.cotizacion_id > 0
      -- indicacion legacy: exactamente "Orden creada desde cotizacion #<N>"
      -- (no empieza con "Detalle #")
      AND oi.indicaciones COLLATE utf8mb4_unicode_ci
              REGEXP '^Orden creada desde cotizacion #[0-9]+$'
      AND oia.id IS NULL   -- sin archivos
    GROUP BY oi.id;

    -- Preview
    SELECT
        l.orden_id,
        l.cotizacion_id,
        l.indicaciones,
        'SERÁ ELIMINADA' AS accion
    FROM tmp_legacy_del l
    ORDER BY l.cotizacion_id, l.orden_id;

    SELECT COUNT(*) AS ordenes_a_eliminar FROM tmp_legacy_del;

    -- Borrar solo si p_apply = 1
    IF p_apply = 1 THEN
        DELETE oi
        FROM ordenes_imagen oi
        INNER JOIN tmp_legacy_del l ON l.orden_id = oi.id;

        COMMIT;
        SET FOREIGN_KEY_CHECKS = v_old_fk;
        SELECT 'COMMIT aplicado: órdenes legacy eliminadas' AS resultado;
    ELSE
        ROLLBACK;
        SET FOREIGN_KEY_CHECKS = v_old_fk;
        SELECT 'ROLLBACK aplicado (solo simulación)' AS resultado;
    END IF;
END $$

DELIMITER ;

-- Uso:
-- 1) Preview seguro
-- CALL sp_eliminar_ordenes_legacy_canceladas(0);
--
-- 2) Eliminar definitivamente
-- CALL sp_eliminar_ordenes_legacy_canceladas(1);
