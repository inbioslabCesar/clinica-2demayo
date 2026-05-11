-- 93_reparar_ecografias_hc_desde_cotizacion.sql
-- Repara cotizaciones ya cobradas donde las ecografías del paquete/perfil
-- quedaron agrupadas en una sola orden de imagen en HC.
--
-- Qué hace:
--  1) Toma cada detalle de ecografía de la(s) cotización(es) objetivo
--  2) Genera la indicación esperada por detalle:
--       "Detalle #<id> - <descripcion> | Orden creada desde cotización #<cotizacion_id>"
--  3) Inserta órdenes faltantes en ordenes_imagen (tipo='ecografia')
--  4) (Opcional) Cancela la orden legacy genérica sin token, solo si no tiene archivos
--
-- Modo seguro:
--   p_apply = 0 -> ROLLBACK (solo preview)
--   p_apply = 1 -> COMMIT

DELIMITER $$

DROP PROCEDURE IF EXISTS sp_reparar_ecografias_hc_desde_cotizacion $$
CREATE PROCEDURE sp_reparar_ecografias_hc_desde_cotizacion(IN p_apply TINYINT)
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

    DROP TEMPORARY TABLE IF EXISTS tmp_fix_cot_ids;
    DROP TEMPORARY TABLE IF EXISTS tmp_fix_det_eco;
    DROP TEMPORARY TABLE IF EXISTS tmp_fix_missing;
    DROP TEMPORARY TABLE IF EXISTS tmp_fix_legacy;
    DROP TEMPORARY TABLE IF EXISTS tmp_fix_preview;

    -- ===== 1) Cotizaciones objetivo =====
    CREATE TEMPORARY TABLE tmp_fix_cot_ids (
        cotizacion_id INT PRIMARY KEY
    ) ENGINE=Memory;

    -- EDITA AQUI los IDs que quieras reparar
    INSERT INTO tmp_fix_cot_ids (cotizacion_id) VALUES (14);

    -- ===== 2) Detalles ecografía esperados =====
    CREATE TEMPORARY TABLE tmp_fix_det_eco (
        cotizacion_id INT NOT NULL,
        detalle_id INT NOT NULL,
        paciente_id INT NOT NULL,
        consulta_id INT NOT NULL,
        indicaciones VARCHAR(700) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
        PRIMARY KEY (cotizacion_id, detalle_id)
    ) ENGINE=Memory;

    INSERT INTO tmp_fix_det_eco (cotizacion_id, detalle_id, paciente_id, consulta_id, indicaciones)
    SELECT
        c.id AS cotizacion_id,
        cd.id AS detalle_id,
        c.paciente_id,
        COALESCE(
            NULLIF(cd.consulta_id, 0),
            (
                SELECT oi.consulta_id
                FROM ordenes_imagen oi
                WHERE oi.cotizacion_id = c.id
                  AND oi.consulta_id > 0
                ORDER BY oi.id ASC
                LIMIT 1
            ),
            0
        ) AS consulta_id,
        CONCAT(
            'Detalle #' COLLATE utf8mb4_unicode_ci,
            cd.id,
            ' - ' COLLATE utf8mb4_unicode_ci,
            COALESCE(NULLIF(TRIM(cd.descripcion), ''), 'Ecografia') COLLATE utf8mb4_unicode_ci,
            ' | Orden creada desde cotizacion #' COLLATE utf8mb4_unicode_ci,
            c.id
        ) AS indicaciones
    FROM cotizaciones c
    INNER JOIN tmp_fix_cot_ids t ON t.cotizacion_id = c.id
    INNER JOIN cotizaciones_detalle cd ON cd.cotizacion_id = c.id
    WHERE (
            LOWER(TRIM(COALESCE(cd.servicio_tipo, ''))) = 'ecografia'
         OR (
                LOWER(TRIM(COALESCE(cd.servicio_tipo, ''))) IN ('procedimiento','procedimientos')
                        AND LOWER(COALESCE(cd.descripcion, '') COLLATE utf8mb4_unicode_ci) LIKE '%ecograf%'
            )
          )
      AND (
            cd.estado_item IS NULL
            OR cd.estado_item <> 'eliminado'
          );

    -- ===== 3) Faltantes (no existe orden tokenizada por detalle) =====
    CREATE TEMPORARY TABLE tmp_fix_missing (
        cotizacion_id INT NOT NULL,
        detalle_id INT NOT NULL,
        paciente_id INT NOT NULL,
        consulta_id INT NOT NULL,
        indicaciones VARCHAR(700) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
        PRIMARY KEY (cotizacion_id, detalle_id)
    ) ENGINE=Memory;

    INSERT INTO tmp_fix_missing (cotizacion_id, detalle_id, paciente_id, consulta_id, indicaciones)
    SELECT d.cotizacion_id, d.detalle_id, d.paciente_id, d.consulta_id, d.indicaciones
    FROM tmp_fix_det_eco d
    WHERE NOT EXISTS (
        SELECT 1
        FROM ordenes_imagen oi
        WHERE oi.cotizacion_id = d.cotizacion_id
          AND LOWER(TRIM(COALESCE(oi.tipo, ''))) = 'ecografia'
                    AND oi.indicaciones COLLATE utf8mb4_unicode_ci = d.indicaciones COLLATE utf8mb4_unicode_ci
    );

    -- ===== 4) Legacy genérica (sin token), solo para limpiar opcionalmente =====
    CREATE TEMPORARY TABLE tmp_fix_legacy (
        orden_id INT PRIMARY KEY
    ) ENGINE=Memory;

    INSERT INTO tmp_fix_legacy (orden_id)
    SELECT oi.id
    FROM ordenes_imagen oi
    INNER JOIN tmp_fix_cot_ids t ON t.cotizacion_id = oi.cotizacion_id
    LEFT JOIN ordenes_imagen_archivos oia ON oia.orden_id = oi.id
    WHERE LOWER(TRIM(COALESCE(oi.tipo, ''))) = 'ecografia'
            AND oi.indicaciones COLLATE utf8mb4_unicode_ci = CONCAT('Orden creada desde cotizacion #' COLLATE utf8mb4_unicode_ci, oi.cotizacion_id)
    GROUP BY oi.id
    HAVING COUNT(oia.id) = 0;

    -- ===== 5) Preview =====
    CREATE TEMPORARY TABLE tmp_fix_preview (
        item VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
        registros BIGINT NOT NULL
    ) ENGINE=Memory;

    INSERT INTO tmp_fix_preview VALUES ('cotizaciones_objetivo', (SELECT COUNT(*) FROM tmp_fix_cot_ids));
    INSERT INTO tmp_fix_preview VALUES ('detalles_ecografia_detectados', (SELECT COUNT(*) FROM tmp_fix_det_eco));
    INSERT INTO tmp_fix_preview VALUES ('ordenes_ecografia_a_insertar', (SELECT COUNT(*) FROM tmp_fix_missing));
    INSERT INTO tmp_fix_preview VALUES ('ordenes_legacy_sin_archivo', (SELECT COUNT(*) FROM tmp_fix_legacy));

    SELECT item, registros FROM tmp_fix_preview ORDER BY item;

    SELECT
        m.cotizacion_id,
        m.detalle_id,
        m.consulta_id,
        m.indicaciones
    FROM tmp_fix_missing m
    ORDER BY m.cotizacion_id, m.detalle_id;

    -- ===== 6) Aplicar =====
    -- Inserta orden por cada detalle faltante
    INSERT INTO ordenes_imagen (consulta_id, paciente_id, tipo, indicaciones, estado, solicitado_por, cotizacion_id, carga_anticipada)
    SELECT
        m.consulta_id,
        m.paciente_id,
        'ecografia',
        m.indicaciones,
        'pendiente',
        0,
        m.cotizacion_id,
        0
    FROM tmp_fix_missing m;

    -- Opcional de higiene: cancelar legacy genérica sin archivos
    UPDATE ordenes_imagen oi
    INNER JOIN tmp_fix_legacy l ON l.orden_id = oi.id
    SET oi.estado = 'cancelado';

    IF p_apply = 1 THEN
        COMMIT;
        SET FOREIGN_KEY_CHECKS = v_old_fk;
        SELECT 'COMMIT aplicado' AS resultado;

        -- Verificación final
        SELECT
            oi.cotizacion_id,
            oi.id AS orden_id,
            oi.consulta_id,
            oi.tipo,
            oi.estado,
            oi.indicaciones
        FROM ordenes_imagen oi
        INNER JOIN tmp_fix_cot_ids t ON t.cotizacion_id = oi.cotizacion_id
        WHERE LOWER(TRIM(COALESCE(oi.tipo, ''))) = 'ecografia'
        ORDER BY oi.cotizacion_id, oi.id;
    ELSE
        ROLLBACK;
        SET FOREIGN_KEY_CHECKS = v_old_fk;
        SELECT 'ROLLBACK aplicado (solo simulación)' AS resultado;
    END IF;
END $$

DELIMITER ;

-- Uso:
-- 1) Preview seguro
-- CALL sp_reparar_ecografias_hc_desde_cotizacion(0);
--
-- 2) Aplicar
-- CALL sp_reparar_ecografias_hc_desde_cotizacion(1);
