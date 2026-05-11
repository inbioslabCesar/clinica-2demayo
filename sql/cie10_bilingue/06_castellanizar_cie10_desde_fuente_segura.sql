-- 06_castellanizar_cie10_desde_fuente_segura.sql
-- Objetivo:
--   Dejar CIE10 visible en castellano de forma segura en produccion,
--   actualizando columnas *_es solo desde una fuente maestra confiable por codigo.
--
-- Modo seguro:
--   p_apply = 0 -> ROLLBACK (simulacion)
--   p_apply = 1 -> COMMIT   (aplica cambios)
--
-- Requisitos previos:
--   1) Debe existir la tabla cie10_es_master con los campos:
--      codigo, nombre_es, categoria_es, subcategoria_es, descripcion_es
--   2) cie10_es_master debe estar validada clinicamente.
--
-- Notas:
--   - No modifica columnas EN (nombre/categoria/subcategoria/descripcion).
--   - Hace backup previo en cie10_backup_castellano.
--   - Incluye verificacion de posibles textos en ingles en columnas *_es.

SET NAMES utf8mb4;

DELIMITER $$

DROP PROCEDURE IF EXISTS sp_cie10_castellanizar_desde_fuente_segura $$
CREATE PROCEDURE sp_cie10_castellanizar_desde_fuente_segura(IN p_apply TINYINT)
BEGIN
    DECLARE v_old_fk INT DEFAULT 1;
    DECLARE v_has_master INT DEFAULT 0;
    DECLARE v_has_seed INT DEFAULT 0;
    DECLARE v_master_total INT DEFAULT 0;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SET FOREIGN_KEY_CHECKS = v_old_fk;
        RESIGNAL;
    END;

    START TRANSACTION;

    SET v_old_fk = @@FOREIGN_KEY_CHECKS;
    SET FOREIGN_KEY_CHECKS = 0;

    -- Verificar/crear fuente maestra
    SELECT COUNT(*) INTO v_has_master
    FROM information_schema.tables
    WHERE table_schema = DATABASE()
      AND table_name = 'cie10_es_master';

    SELECT COUNT(*) INTO v_has_seed
    FROM information_schema.tables
    WHERE table_schema = DATABASE()
      AND table_name = 'cie10_es_seed';

    IF v_has_master = 0 THEN
        CREATE TABLE cie10_es_master (
            codigo VARCHAR(10) NOT NULL,
            nombre_es VARCHAR(500) DEFAULT NULL,
            categoria_es VARCHAR(255) DEFAULT NULL,
            subcategoria_es VARCHAR(255) DEFAULT NULL,
            descripcion_es TEXT,
            PRIMARY KEY (codigo)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        SET v_has_master = 1;
    END IF;

    -- Si existe seed local curada, priorizarla en la fuente maestra
    IF v_has_seed = 1 THEN
        INSERT INTO cie10_es_master (codigo, nombre_es, categoria_es, subcategoria_es, descripcion_es)
        SELECT
            TRIM(codigo),
            NULLIF(TRIM(nombre_es), ''),
            NULLIF(TRIM(categoria_es), ''),
            NULLIF(TRIM(subcategoria_es), ''),
            NULLIF(TRIM(descripcion_es), '')
        FROM cie10_es_seed
        WHERE TRIM(codigo) <> ''
        ON DUPLICATE KEY UPDATE
            nombre_es = VALUES(nombre_es),
            categoria_es = VALUES(categoria_es),
            subcategoria_es = VALUES(subcategoria_es),
            descripcion_es = VALUES(descripcion_es);
    END IF;

        -- Completar SOLO codigos faltantes de la fuente maestra desde el estado actual de cie10
        -- (No sobreescribir datos curados ya existentes en cie10_es_master)
        INSERT INTO cie10_es_master (codigo, nombre_es, categoria_es, subcategoria_es, descripcion_es)
    SELECT
        c.codigo,
        NULLIF(TRIM(c.nombre_es), ''),
        NULLIF(TRIM(c.categoria_es), ''),
        NULLIF(TRIM(c.subcategoria_es), ''),
        NULLIF(TRIM(c.descripcion_es), '')
    FROM cie10 c
        LEFT JOIN cie10_es_master m ON m.codigo = c.codigo
    WHERE c.activo = 1
            AND m.codigo IS NULL
      AND TRIM(c.codigo) <> ''
      AND (
            COALESCE(NULLIF(TRIM(c.nombre_es), ''), '') <> ''
         OR COALESCE(NULLIF(TRIM(c.categoria_es), ''), '') <> ''
         OR COALESCE(NULLIF(TRIM(c.subcategoria_es), ''), '') <> ''
         OR COALESCE(NULLIF(TRIM(c.descripcion_es), ''), '') <> ''
            );

    SELECT COUNT(*) INTO v_master_total FROM cie10_es_master;
    IF v_master_total = 0 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'No hay datos en cie10_es_master ni en cie10_es_seed para castellanizar.';
    END IF;

    -- Verificar columnas minimas en tabla fuente
    IF (
        SELECT COUNT(*)
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = 'cie10_es_master'
          AND column_name IN ('codigo', 'nombre_es', 'categoria_es', 'subcategoria_es', 'descripcion_es')
    ) < 5 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'cie10_es_master no tiene todas las columnas requeridas.';
    END IF;

    DROP TEMPORARY TABLE IF EXISTS tmp_cie10_preview;
    CREATE TEMPORARY TABLE tmp_cie10_preview (
        metrica VARCHAR(120) NOT NULL,
        valor BIGINT NOT NULL
    ) ENGINE=Memory;

    -- Diagnostico previo
    INSERT INTO tmp_cie10_preview VALUES
    ('cie10_activos', (SELECT COUNT(*) FROM cie10 WHERE activo = 1)),
    ('master_total', (SELECT COUNT(*) FROM cie10_es_master)),
    ('master_codigos_unicos', (SELECT COUNT(DISTINCT codigo) FROM cie10_es_master)),
    ('coincidencias_por_codigo', (
        SELECT COUNT(*)
        FROM cie10 c
        INNER JOIN cie10_es_master m ON m.codigo = c.codigo
        WHERE c.activo = 1
    )),
    ('sin_fuente_por_codigo', (
        SELECT COUNT(*)
        FROM cie10 c
        LEFT JOIN cie10_es_master m ON m.codigo = c.codigo
        WHERE c.activo = 1 AND m.codigo IS NULL
    ));

    -- Conteo de campos ES vacios en fuente
    INSERT INTO tmp_cie10_preview VALUES
    ('master_sin_nombre_es', (
        SELECT COUNT(*) FROM cie10_es_master WHERE COALESCE(NULLIF(TRIM(nombre_es), ''), '') = ''
    )),
    ('master_sin_categoria_es', (
        SELECT COUNT(*) FROM cie10_es_master WHERE COALESCE(NULLIF(TRIM(categoria_es), ''), '') = ''
    )),
    ('master_sin_subcategoria_es', (
        SELECT COUNT(*) FROM cie10_es_master WHERE COALESCE(NULLIF(TRIM(subcategoria_es), ''), '') = ''
    )),
    ('master_sin_descripcion_es', (
        SELECT COUNT(*) FROM cie10_es_master WHERE COALESCE(NULLIF(TRIM(descripcion_es), ''), '') = ''
    ));

    -- Posibles restos de ingles en ES (heuristica)
    INSERT INTO tmp_cie10_preview VALUES
    ('es_posible_ingles_antes', (
        SELECT COUNT(*)
        FROM cie10
        WHERE activo = 1
          AND (
                LOWER(COALESCE(nombre_es, '')) REGEXP '(^|[^a-z])(due to|other|unspecified|acute|chronic|infection|disease|with|without|of|and)([^a-z]|$)'
             OR LOWER(COALESCE(categoria_es, '')) REGEXP '(^|[^a-z])(certain|diseases|infectious|parasitic|system)([^a-z]|$)'
             OR LOWER(COALESCE(subcategoria_es, '')) REGEXP '(^|[^a-z])(infectious|diseases|intestinal)([^a-z]|$)'
          )
    ));

    -- Mostrar preview
    SELECT metrica, valor
    FROM tmp_cie10_preview
    ORDER BY metrica;

    -- Muestra de filas a actualizar
    SELECT
        c.codigo,
        c.nombre_es AS nombre_es_actual,
        m.nombre_es AS nombre_es_nuevo,
        c.categoria_es AS categoria_es_actual,
        m.categoria_es AS categoria_es_nueva
    FROM cie10 c
    INNER JOIN cie10_es_master m ON m.codigo = c.codigo
    WHERE c.activo = 1
      AND (
            COALESCE(c.nombre_es, '') <> COALESCE(m.nombre_es, '')
         OR COALESCE(c.categoria_es, '') <> COALESCE(m.categoria_es, '')
      )
    ORDER BY c.codigo
    LIMIT 30;

    -- Backup seguro
    CREATE TABLE IF NOT EXISTS cie10_backup_castellano LIKE cie10;
    TRUNCATE TABLE cie10_backup_castellano;
    INSERT INTO cie10_backup_castellano SELECT * FROM cie10;

    -- Aplicar actualizacion desde fuente segura (solo columnas ES)
    UPDATE cie10 c
    INNER JOIN cie10_es_master m ON m.codigo = c.codigo
    SET
        c.nombre_es = NULLIF(TRIM(m.nombre_es), ''),
        c.categoria_es = NULLIF(TRIM(m.categoria_es), ''),
        c.subcategoria_es = NULLIF(TRIM(m.subcategoria_es), ''),
        c.descripcion_es = NULLIF(TRIM(m.descripcion_es), ''),
        c.actualizado_en = CURRENT_TIMESTAMP
    WHERE c.activo = 1;

    -- Post-validacion
    SELECT
        COUNT(*) AS activos,
        SUM(CASE WHEN COALESCE(NULLIF(TRIM(nombre_es), ''), '') <> '' THEN 1 ELSE 0 END) AS con_nombre_es,
        SUM(CASE WHEN COALESCE(NULLIF(TRIM(nombre_es), ''), '') = '' THEN 1 ELSE 0 END) AS sin_nombre_es
    FROM cie10
    WHERE activo = 1;

    SELECT
        COUNT(*) AS es_posible_ingles_despues
    FROM cie10
    WHERE activo = 1
      AND (
            LOWER(COALESCE(nombre_es, '')) REGEXP '(^|[^a-z])(due to|other|unspecified|acute|chronic|infection|disease|with|without|of|and)([^a-z]|$)'
         OR LOWER(COALESCE(categoria_es, '')) REGEXP '(^|[^a-z])(certain|diseases|infectious|parasitic|system)([^a-z]|$)'
         OR LOWER(COALESCE(subcategoria_es, '')) REGEXP '(^|[^a-z])(infectious|diseases|intestinal)([^a-z]|$)'
      );

    IF p_apply = 1 THEN
        COMMIT;
        SET FOREIGN_KEY_CHECKS = v_old_fk;
        SELECT 'COMMIT aplicado - CIE10 actualizado en castellano desde fuente segura' AS resultado;
    ELSE
        ROLLBACK;
        SET FOREIGN_KEY_CHECKS = v_old_fk;
        SELECT 'ROLLBACK aplicado - solo simulacion, nada fue modificado' AS resultado;
    END IF;
END $$

DELIMITER ;

-- Uso:
-- 1) Simulacion (recomendado)
-- CALL sp_cie10_castellanizar_desde_fuente_segura(0);
--
-- 2) Aplicar cambios
-- CALL sp_cie10_castellanizar_desde_fuente_segura(1);
