-- 09_cie10_remediacion_por_codigos.sql
-- Remediacion controlada de CIE10 ES por codigo (sin contaminar).
--
-- Flujo:
--   1) Poblar cola de codigos con issues: CALL sp_cie10_poblar_fix_queue();
--   2) Cargar correcciones en cie10_es_fix_manual (una fila por codigo).
--   3) Simular aplicacion por lote: CALL sp_cie10_aplicar_fix_manual(500, 0);
--   4) Aplicar lote: CALL sp_cie10_aplicar_fix_manual(500, 1);
--   5) Validar hard-stop: CALL sp_cie10_qc_validar_o_fallar();

SET NAMES utf8mb4;

-- Cola de trabajo (codigos con problemas)
CREATE TABLE IF NOT EXISTS cie10_es_fix_queue (
    codigo VARCHAR(10) NOT NULL,
    nombre_es_actual TEXT,
    categoria_es_actual TEXT,
    subcategoria_es_actual TEXT,
    descripcion_es_actual TEXT,
    motivo VARCHAR(120) NOT NULL,
    estado ENUM('pendiente', 'aplicado', 'omitido') NOT NULL DEFAULT 'pendiente',
    creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Correcciones curadas por codigo
CREATE TABLE IF NOT EXISTS cie10_es_fix_manual (
    codigo VARCHAR(10) NOT NULL,
    nombre_es TEXT,
    categoria_es TEXT,
    subcategoria_es TEXT,
    descripcion_es TEXT,
    fuente VARCHAR(120) DEFAULT 'validacion_clinica',
    actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$

DROP PROCEDURE IF EXISTS sp_cie10_poblar_fix_queue $$
CREATE PROCEDURE sp_cie10_poblar_fix_queue()
BEGIN
    -- Reinsertar/actualizar cola con codigos que aun tienen contaminacion o vacios.
    INSERT INTO cie10_es_fix_queue (
        codigo,
        nombre_es_actual,
        categoria_es_actual,
        subcategoria_es_actual,
        descripcion_es_actual,
        motivo,
        estado
    )
    SELECT
        c.codigo,
        c.nombre_es,
        c.categoria_es,
        c.subcategoria_es,
        c.descripcion_es,
        CASE
            WHEN COALESCE(NULLIF(TRIM(c.nombre_es), ''), '') = ''
              OR COALESCE(NULLIF(TRIM(c.categoria_es), ''), '') = ''
              OR COALESCE(NULLIF(TRIM(c.subcategoria_es), ''), '') = ''
            THEN 'vacio_es'
            ELSE 'token_en_detectado'
        END AS motivo,
        'pendiente' AS estado
    FROM cie10 c
    WHERE c.activo = 1
      AND (
            COALESCE(NULLIF(TRIM(c.nombre_es), ''), '') = ''
         OR COALESCE(NULLIF(TRIM(c.categoria_es), ''), '') = ''
         OR COALESCE(NULLIF(TRIM(c.subcategoria_es), ''), '') = ''
         OR LOWER(COALESCE(c.nombre_es, '')) REGEXP '(^|[^a-z])(due to|other|unspecified|acute|chronic|infection|disease|with|without|of|and|certain|infectious|intestinal|system)([^a-z]|$)'
         OR LOWER(COALESCE(c.categoria_es, '')) REGEXP '(^|[^a-z])(certain|diseases|infectious|parasitic|system|digestive|respiratory|circulatory|nervous)([^a-z]|$)'
         OR LOWER(COALESCE(c.subcategoria_es, '')) REGEXP '(^|[^a-z])(infectious|diseases|intestinal|tuberculosis|disorders)([^a-z]|$)'
      )
    ON DUPLICATE KEY UPDATE
        nombre_es_actual = VALUES(nombre_es_actual),
        categoria_es_actual = VALUES(categoria_es_actual),
        subcategoria_es_actual = VALUES(subcategoria_es_actual),
        descripcion_es_actual = VALUES(descripcion_es_actual),
        motivo = VALUES(motivo),
        estado = 'pendiente';

    -- Resumen de cola
    SELECT
        COUNT(*) AS total_queue,
        SUM(CASE WHEN estado = 'pendiente' THEN 1 ELSE 0 END) AS pendientes,
        SUM(CASE WHEN estado = 'aplicado' THEN 1 ELSE 0 END) AS aplicados,
        SUM(CASE WHEN estado = 'omitido' THEN 1 ELSE 0 END) AS omitidos
    FROM cie10_es_fix_queue;

    -- Muestra de pendientes
    SELECT codigo, motivo, nombre_es_actual, categoria_es_actual
    FROM cie10_es_fix_queue
    WHERE estado = 'pendiente'
    ORDER BY codigo
    LIMIT 200;
END $$

DROP PROCEDURE IF EXISTS sp_cie10_aplicar_fix_manual $$
CREATE PROCEDURE sp_cie10_aplicar_fix_manual(
    IN p_batch_size INT,
    IN p_apply TINYINT
)
BEGIN
    DECLARE v_batch_size INT DEFAULT 500;
    DECLARE v_lote INT DEFAULT 0;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    IF p_batch_size IS NOT NULL AND p_batch_size > 0 THEN
        SET v_batch_size = LEAST(p_batch_size, 2000);
    END IF;

    START TRANSACTION;

    DROP TEMPORARY TABLE IF EXISTS tmp_fix_lote;
    CREATE TEMPORARY TABLE tmp_fix_lote (
        codigo VARCHAR(10) NOT NULL,
        PRIMARY KEY (codigo)
    ) ENGINE=Memory;

    INSERT INTO tmp_fix_lote (codigo)
    SELECT q.codigo
    FROM cie10_es_fix_queue q
    INNER JOIN cie10_es_fix_manual m ON m.codigo = q.codigo
    WHERE q.estado = 'pendiente'
    ORDER BY q.codigo
    LIMIT v_batch_size;

    SELECT COUNT(*) INTO v_lote FROM tmp_fix_lote;

    -- Preview del lote
    SELECT
        c.codigo,
        c.nombre_es AS nombre_es_actual,
        m.nombre_es AS nombre_es_nuevo,
        c.categoria_es AS categoria_es_actual,
        m.categoria_es AS categoria_es_nueva
    FROM cie10 c
    INNER JOIN tmp_fix_lote l ON l.codigo = c.codigo
    INNER JOIN cie10_es_fix_manual m ON m.codigo = c.codigo
    ORDER BY c.codigo
    LIMIT 100;

    -- Actualizar solo campos provistos en fix_manual (si vienen vacios, conserva actual)
    UPDATE cie10 c
    INNER JOIN tmp_fix_lote l ON l.codigo = c.codigo
    INNER JOIN cie10_es_fix_manual m ON m.codigo = c.codigo
    SET
        c.nombre_es = COALESCE(NULLIF(TRIM(m.nombre_es), ''), c.nombre_es),
        c.categoria_es = COALESCE(NULLIF(TRIM(m.categoria_es), ''), c.categoria_es),
        c.subcategoria_es = COALESCE(NULLIF(TRIM(m.subcategoria_es), ''), c.subcategoria_es),
        c.descripcion_es = COALESCE(NULLIF(TRIM(m.descripcion_es), ''), c.descripcion_es),
        c.actualizado_en = CURRENT_TIMESTAMP;

    UPDATE cie10_es_fix_queue q
    INNER JOIN tmp_fix_lote l ON l.codigo = q.codigo
    SET q.estado = 'aplicado';

    -- Metricas del lote
    SELECT
        v_batch_size AS batch_size_solicitado,
        v_lote AS filas_en_lote,
        (SELECT COUNT(*) FROM cie10_es_fix_queue WHERE estado = 'pendiente') AS pendientes_restantes;

    IF p_apply = 1 THEN
        COMMIT;
        SELECT 'COMMIT aplicado - correcciones manuales del lote persistidas' AS resultado;
    ELSE
        ROLLBACK;
        SELECT 'ROLLBACK aplicado - simulacion, sin cambios persistidos' AS resultado;
    END IF;
END $$

DELIMITER ;

-- Consultas utiles:
-- 1) Generar cola
-- CALL sp_cie10_poblar_fix_queue();
--
-- 2) Ver pendientes sin correccion cargada
-- SELECT q.codigo, q.motivo, q.nombre_es_actual
-- FROM cie10_es_fix_queue q
-- LEFT JOIN cie10_es_fix_manual m ON m.codigo = q.codigo
-- WHERE q.estado = 'pendiente' AND m.codigo IS NULL
-- ORDER BY q.codigo;
--
-- 3) Simular aplicacion lote
-- CALL sp_cie10_aplicar_fix_manual(500, 0);
--
-- 4) Aplicar lote
-- CALL sp_cie10_aplicar_fix_manual(500, 1);
