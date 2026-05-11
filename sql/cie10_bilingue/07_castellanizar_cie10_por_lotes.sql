-- 07_castellanizar_cie10_por_lotes.sql
-- Objetivo:
--   Actualizar CIE10 en castellano por lotes pequenos para reducir impacto
--   en horario laboral.
--
-- Requisitos:
--   - Debe existir tabla cie10_es_master con columnas:
--     codigo, nombre_es, categoria_es, subcategoria_es, descripcion_es
--
-- Modo:
--   p_apply = 0 -> simulacion (ROLLBACK)
--   p_apply = 1 -> aplicar lote (COMMIT)
--
-- Recomendacion operativa:
--   Ejecutar en ciclos de 500 y repetir hasta que pendientes = 0.

SET NAMES utf8mb4;

DELIMITER $$

DROP PROCEDURE IF EXISTS sp_cie10_castellanizar_lote $$
CREATE PROCEDURE sp_cie10_castellanizar_lote(
    IN p_batch_size INT,
    IN p_apply TINYINT
)
BEGIN
    DECLARE v_batch_size INT DEFAULT 500;
    DECLARE v_has_master INT DEFAULT 0;
    DECLARE v_lote INT DEFAULT 0;
    DECLARE v_pendientes INT DEFAULT 0;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    IF p_batch_size IS NOT NULL AND p_batch_size > 0 THEN
        SET v_batch_size = LEAST(p_batch_size, 2000);
    END IF;

    SELECT COUNT(*) INTO v_has_master
    FROM information_schema.tables
    WHERE table_schema = DATABASE()
      AND table_name = 'cie10_es_master';

    IF v_has_master = 0 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Falta tabla cie10_es_master. Carga primero la fuente maestra en castellano.';
    END IF;

    START TRANSACTION;

    DROP TEMPORARY TABLE IF EXISTS tmp_cie10_lote;
    CREATE TEMPORARY TABLE tmp_cie10_lote (
        codigo VARCHAR(10) NOT NULL,
        PRIMARY KEY (codigo)
    ) ENGINE=Memory;

    INSERT INTO tmp_cie10_lote (codigo)
    SELECT c.codigo
    FROM cie10 c
    INNER JOIN cie10_es_master m ON m.codigo = c.codigo
    WHERE c.activo = 1
      AND (
            COALESCE(c.nombre_es, '') <> COALESCE(m.nombre_es, '')
         OR COALESCE(c.categoria_es, '') <> COALESCE(m.categoria_es, '')
         OR COALESCE(c.subcategoria_es, '') <> COALESCE(m.subcategoria_es, '')
         OR COALESCE(c.descripcion_es, '') <> COALESCE(m.descripcion_es, '')
      )
    ORDER BY c.codigo
    LIMIT v_batch_size;

    SELECT COUNT(*) INTO v_lote FROM tmp_cie10_lote;

    -- Muestra de lo que entraria en el lote
    SELECT
        c.codigo,
        c.nombre_es AS nombre_es_actual,
        m.nombre_es AS nombre_es_nuevo,
        c.categoria_es AS categoria_es_actual,
        m.categoria_es AS categoria_es_nueva
    FROM cie10 c
    INNER JOIN cie10_es_master m ON m.codigo = c.codigo
    INNER JOIN tmp_cie10_lote t ON t.codigo = c.codigo
    ORDER BY c.codigo
    LIMIT 50;

    -- Aplicar lote
    UPDATE cie10 c
    INNER JOIN cie10_es_master m ON m.codigo = c.codigo
    INNER JOIN tmp_cie10_lote t ON t.codigo = c.codigo
    SET
        c.nombre_es = NULLIF(TRIM(m.nombre_es), ''),
        c.categoria_es = NULLIF(TRIM(m.categoria_es), ''),
        c.subcategoria_es = NULLIF(TRIM(m.subcategoria_es), ''),
        c.descripcion_es = NULLIF(TRIM(m.descripcion_es), ''),
        c.actualizado_en = CURRENT_TIMESTAMP;

    -- Pendientes globales luego del lote (si fuera aplicado)
    SELECT COUNT(*) INTO v_pendientes
    FROM cie10 c
    INNER JOIN cie10_es_master m ON m.codigo = c.codigo
    WHERE c.activo = 1
      AND (
            COALESCE(c.nombre_es, '') <> COALESCE(m.nombre_es, '')
         OR COALESCE(c.categoria_es, '') <> COALESCE(m.categoria_es, '')
         OR COALESCE(c.subcategoria_es, '') <> COALESCE(m.subcategoria_es, '')
         OR COALESCE(c.descripcion_es, '') <> COALESCE(m.descripcion_es, '')
      );

    -- Metricas del lote
    SELECT
        v_batch_size AS batch_size_solicitado,
        v_lote AS filas_en_lote,
        v_pendientes AS pendientes_post_lote_estimado;

    -- Indicador de mezcla EN residual (heuristica)
    SELECT
        COUNT(*) AS es_posible_ingles
    FROM cie10
    WHERE activo = 1
      AND (
            LOWER(COALESCE(nombre_es, '')) REGEXP '(^|[^a-z])(due to|other|unspecified|acute|chronic|infection|disease|with|without|of|and)([^a-z]|$)'
         OR LOWER(COALESCE(categoria_es, '')) REGEXP '(^|[^a-z])(certain|diseases|infectious|parasitic|system)([^a-z]|$)'
         OR LOWER(COALESCE(subcategoria_es, '')) REGEXP '(^|[^a-z])(infectious|diseases|intestinal)([^a-z]|$)'
      );

    IF p_apply = 1 THEN
        COMMIT;
        SELECT 'COMMIT aplicado - lote actualizado' AS resultado;
    ELSE
        ROLLBACK;
        SELECT 'ROLLBACK aplicado - simulacion, sin cambios persistidos' AS resultado;
    END IF;
END $$

DELIMITER ;

-- Uso sugerido:
-- 1) Simular lote de 500
-- CALL sp_cie10_castellanizar_lote(500, 0);
--
-- 2) Aplicar lote de 500
-- CALL sp_cie10_castellanizar_lote(500, 1);
--
-- 3) Repetir paso 2 hasta pendientes_post_lote_estimado = 0
