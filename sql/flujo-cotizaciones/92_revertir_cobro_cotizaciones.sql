-- 92_revertir_cobro_cotizaciones.sql
-- Revierte el cobro de cotizaciones específicas, dejándolas en estado 'pendiente'.
--
-- Qué hace:
--   1) Identifica todos los cobros vinculados a las cotizaciones indicadas
--   2) Elimina: ingresos_diarios, cobros_cotizaciones, cotizacion_movimientos, cobros_detalle, cobros
--   3) Corrige precios reales en cotizaciones_detalle (si se configura en este script)
--   4) Recalcula total en cotizaciones desde su detalle
--   5) Resetea en cotizaciones: total_pagado=0, saldo_pendiente=total, estado='pendiente'
--
-- Modo seguro:
--   p_apply = 0  →  ROLLBACK (solo muestra qué se borraría)
--   p_apply = 1  →  COMMIT   (aplica los cambios)
--
-- Ajusta los IDs en v_cotizacion_ids antes de ejecutar.

DELIMITER $$

DROP PROCEDURE IF EXISTS sp_revertir_cobro_cotizaciones $$
CREATE PROCEDURE sp_revertir_cobro_cotizaciones(IN p_apply TINYINT)
BEGIN
    DECLARE v_old_fk INT DEFAULT 1;

    -- ── IDs de cotizaciones a revertir ──────────────────────────────────────
    -- Cambia estos valores según los IDs que quieres revertir
    -- Se usa una tabla temporal para facilitar el JOIN
    -- ────────────────────────────────────────────────────────────────────────

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SET FOREIGN_KEY_CHECKS = v_old_fk;
        RESIGNAL;
    END;

    START TRANSACTION;

    SET v_old_fk = @@FOREIGN_KEY_CHECKS;
    SET FOREIGN_KEY_CHECKS = 0;

    -- Limpiar temporales anteriores si quedaron residuos
    DROP TEMPORARY TABLE IF EXISTS tmp_rev_cotizaciones;
    DROP TEMPORARY TABLE IF EXISTS tmp_rev_cobros;
    DROP TEMPORARY TABLE IF EXISTS tmp_rev_preview;
    DROP TEMPORARY TABLE IF EXISTS tmp_rev_precio_fix;

    -- ── 1. Cotizaciones objetivo ─────────────────────────────────────────────
    CREATE TEMPORARY TABLE tmp_rev_cotizaciones (
        id INT PRIMARY KEY
    ) ENGINE=Memory;

    -- ★★★ EDITA AQUÍ los IDs de cotizaciones a revertir ★★★
    INSERT INTO tmp_rev_cotizaciones (id) VALUES (64);

        -- ── 1b. Precios correctos por detalle (ajustar según caso) ──────────────
        -- descripcion_like se usa para ubicar el item correcto dentro de cada cotización.
        CREATE TEMPORARY TABLE tmp_rev_precio_fix (
                cotizacion_id   INT NOT NULL,
            descripcion_like VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
                precio_real     DECIMAL(12,2) NOT NULL,
                PRIMARY KEY (cotizacion_id, descripcion_like)
        ) ENGINE=Memory;

        -- IMPORTANTE: Por defecto NO se corrige precio de ningún detalle.
        -- Si necesitas corregir precios para las cotizaciones objetivo,
        -- agrega aquí SOLO los IDs incluidos en tmp_rev_cotizaciones.
        -- Ejemplo (descomentar y ajustar):
        -- INSERT INTO tmp_rev_precio_fix (cotizacion_id, descripcion_like, precio_real) VALUES
        --     (64, 'NOMBRE SERVICIO', 123.45);

    -- ── 2. Cobros vinculados (por cobros_cotizaciones o cotizacion_movimientos)
    CREATE TEMPORARY TABLE tmp_rev_cobros (
        id INT PRIMARY KEY
    ) ENGINE=Memory;

    -- Vía tabla cobros_cotizaciones (fuente principal)
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_name = 'cobros_cotizaciones'
    ) THEN
        INSERT IGNORE INTO tmp_rev_cobros (id)
        SELECT DISTINCT cc.cobro_id
        FROM cobros_cotizaciones cc
        INNER JOIN tmp_rev_cotizaciones trc ON trc.id = cc.cotizacion_id
        WHERE cc.cobro_id IS NOT NULL;
    END IF;

    -- Vía tabla cotizacion_movimientos (respaldo)
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_name = 'cotizacion_movimientos'
    ) THEN
        INSERT IGNORE INTO tmp_rev_cobros (id)
        SELECT DISTINCT cm.cobro_id
        FROM cotizacion_movimientos cm
        INNER JOIN tmp_rev_cotizaciones trc ON trc.id = cm.cotizacion_id
        WHERE cm.cobro_id IS NOT NULL;
    END IF;

    -- ── 3. Preview ───────────────────────────────────────────────────────────
    CREATE TEMPORARY TABLE tmp_rev_preview (
        tabla     VARCHAR(80)  NOT NULL,
        registros BIGINT       NOT NULL
    ) ENGINE=Memory;

    INSERT INTO tmp_rev_preview VALUES ('cotizaciones_a_revertir',
        (SELECT COUNT(*) FROM tmp_rev_cotizaciones));

    INSERT INTO tmp_rev_preview VALUES ('cobros_a_eliminar',
        (SELECT COUNT(*) FROM tmp_rev_cobros));

    INSERT INTO tmp_rev_preview VALUES ('cobros_detalle_a_eliminar',
        (SELECT COUNT(*) FROM cobros_detalle cd
         INNER JOIN tmp_rev_cobros trc ON trc.id = cd.cobro_id));

    INSERT INTO tmp_rev_preview VALUES ('cotizaciones_detalle_a_corregir_precio',
        (
            SELECT COUNT(*)
            FROM cotizaciones_detalle cd
            INNER JOIN tmp_rev_precio_fix pf ON pf.cotizacion_id = cd.cotizacion_id
            INNER JOIN tmp_rev_cotizaciones trc ON trc.id = cd.cotizacion_id
            WHERE COALESCE(cd.descripcion, '') COLLATE utf8mb4_general_ci
                  LIKE CONCAT('%', pf.descripcion_like COLLATE utf8mb4_general_ci, '%')
        ));

    SET @cnt_cc = 0;
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = DATABASE() AND table_name = 'cobros_cotizaciones') THEN
        SELECT COUNT(*) INTO @cnt_cc
        FROM cobros_cotizaciones cc
        INNER JOIN tmp_rev_cobros trc ON trc.id = cc.cobro_id;
    END IF;
    INSERT INTO tmp_rev_preview VALUES ('cobros_cotizaciones_a_eliminar', @cnt_cc);

    SET @cnt_cm = 0;
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = DATABASE() AND table_name = 'cotizacion_movimientos') THEN
        SELECT COUNT(*) INTO @cnt_cm
        FROM cotizacion_movimientos cm
        INNER JOIN tmp_rev_cotizaciones trc ON trc.id = cm.cotizacion_id;
    END IF;
    INSERT INTO tmp_rev_preview VALUES ('cotizacion_movimientos_a_eliminar', @cnt_cm);

    INSERT INTO tmp_rev_preview VALUES ('ingresos_diarios_a_eliminar',
        (SELECT COUNT(*) FROM ingresos_diarios id_t
         INNER JOIN tmp_rev_cobros trc ON trc.id = id_t.referencia_id
         WHERE id_t.referencia_tabla = 'cobros'));

    -- Estado actual de las cotizaciones antes de revertir
    SELECT
        c.id,
        c.estado,
        c.total,
        c.total_pagado,
        c.saldo_pendiente,
        '→ pendiente / total_pagado=0 / saldo_pendiente=total' AS cambio_propuesto
    FROM cotizaciones c
    INNER JOIN tmp_rev_cotizaciones trc ON trc.id = c.id
    ORDER BY c.id;

    -- Preview de detalle antes de corrección de precio
    SELECT
        cd.cotizacion_id,
        cd.id AS detalle_id,
        cd.descripcion,
        cd.cantidad,
        cd.precio_unitario,
        cd.subtotal,
        pf.precio_real AS precio_unitario_objetivo,
        ROUND(COALESCE(NULLIF(cd.cantidad, 0), 1) * pf.precio_real, 2) AS subtotal_objetivo
    FROM cotizaciones_detalle cd
    INNER JOIN tmp_rev_precio_fix pf ON pf.cotizacion_id = cd.cotizacion_id
    INNER JOIN tmp_rev_cotizaciones trc ON trc.id = cd.cotizacion_id
        WHERE COALESCE(cd.descripcion, '') COLLATE utf8mb4_general_ci
            LIKE CONCAT('%', pf.descripcion_like COLLATE utf8mb4_general_ci, '%')
    ORDER BY cd.cotizacion_id, cd.id;

    SELECT tabla, registros FROM tmp_rev_preview ORDER BY tabla;

    -- ── 4. BORRADOS en cascada ───────────────────────────────────────────────

    -- 4a. ingresos_diarios vinculados a estos cobros
    DELETE id_t
    FROM ingresos_diarios id_t
    INNER JOIN tmp_rev_cobros trc ON trc.id = id_t.referencia_id
    WHERE id_t.referencia_tabla = 'cobros';

    -- 4b. cobros_cotizaciones
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = DATABASE() AND table_name = 'cobros_cotizaciones') THEN
        DELETE cc
        FROM cobros_cotizaciones cc
        INNER JOIN tmp_rev_cobros trc ON trc.id = cc.cobro_id;
    END IF;

    -- 4c. cotizacion_movimientos (por cotizacion_id para capturar todo)
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = DATABASE() AND table_name = 'cotizacion_movimientos') THEN
        DELETE cm
        FROM cotizacion_movimientos cm
        INNER JOIN tmp_rev_cotizaciones trc ON trc.id = cm.cotizacion_id;
    END IF;

    -- 4d. cobros_detalle
    DELETE cd
    FROM cobros_detalle cd
    INNER JOIN tmp_rev_cobros trc ON trc.id = cd.cobro_id;

    -- 4e. cobros (solo si todos los ítems del cobro apuntan a cotizaciones que estamos revirtiendo)
    --     Seguridad extra: si un cobro cubría MÚLTIPLES cotizaciones y solo se revierte parte,
    --     NO se borra el cobro — solo se borra si todas sus cotizaciones están en tmp_rev.
    DELETE cb
    FROM cobros cb
    INNER JOIN tmp_rev_cobros trc ON trc.id = cb.id
    WHERE NOT EXISTS (
        -- El cobro NO tiene ninguna cotización fuera del conjunto a revertir
        SELECT 1
        FROM cobros_cotizaciones cc2
        WHERE cc2.cobro_id = cb.id
          AND cc2.cotizacion_id NOT IN (SELECT id FROM tmp_rev_cotizaciones)
    );

    -- 4f. Corregir precio_unitario/subtotal en cotizaciones_detalle
    UPDATE cotizaciones_detalle cd
    INNER JOIN tmp_rev_precio_fix pf ON pf.cotizacion_id = cd.cotizacion_id
    INNER JOIN tmp_rev_cotizaciones trc ON trc.id = cd.cotizacion_id
    SET
        cd.precio_unitario = pf.precio_real,
        cd.subtotal = ROUND(COALESCE(NULLIF(cd.cantidad, 0), 1) * pf.precio_real, 2)
    WHERE COALESCE(cd.descripcion, '') COLLATE utf8mb4_general_ci
          LIKE CONCAT('%', pf.descripcion_like COLLATE utf8mb4_general_ci, '%');

    -- 4g. Recalcular total desde cotizaciones_detalle
    UPDATE cotizaciones c
    INNER JOIN (
        SELECT cd.cotizacion_id, ROUND(SUM(COALESCE(cd.subtotal, 0)), 2) AS total_recalculado
        FROM cotizaciones_detalle cd
        INNER JOIN tmp_rev_cotizaciones trc ON trc.id = cd.cotizacion_id
        GROUP BY cd.cotizacion_id
    ) x ON x.cotizacion_id = c.id
    SET c.total = x.total_recalculado;

    -- 4h. Resetear cotizaciones a pendiente
    UPDATE cotizaciones
    SET
        total_pagado    = 0,
        saldo_pendiente = total,
        estado          = 'pendiente',
        updated_at      = NOW()
    WHERE id IN (SELECT id FROM tmp_rev_cotizaciones);

    -- ── 5. COMMIT o ROLLBACK ─────────────────────────────────────────────────
    IF p_apply = 1 THEN
        COMMIT;
        SET FOREIGN_KEY_CHECKS = v_old_fk;
        SELECT 'COMMIT aplicado — cotizaciones revertidas a pendiente' AS resultado;

        -- Verificación final
        SELECT id, estado, total, total_pagado, saldo_pendiente
        FROM cotizaciones
        WHERE id IN (SELECT id FROM tmp_rev_cotizaciones)
        ORDER BY id;
    ELSE
        ROLLBACK;
        SET FOREIGN_KEY_CHECKS = v_old_fk;
        SELECT 'ROLLBACK aplicado — solo simulación, nada fue modificado' AS resultado;
    END IF;
END $$

DELIMITER ;

-- ── Uso ────────────────────────────────────────────────────────────────────────
-- Paso 1: ver qué se borraría sin tocar nada
-- CALL sp_revertir_cobro_cotizaciones(0);

-- Paso 2: aplicar cuando estés seguro
-- CALL sp_revertir_cobro_cotizaciones(1);
