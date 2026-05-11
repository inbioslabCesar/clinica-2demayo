-- 08_cie10_control_calidad_es.sql
-- Control de calidad estricto para CIE10 en castellano.
-- Objetivo: detectar y bloquear cualquier contaminacion EN en campos *_es.

SET NAMES utf8mb4;

DELIMITER $$

DROP PROCEDURE IF EXISTS sp_cie10_qc_generar $$
CREATE PROCEDURE sp_cie10_qc_generar()
BEGIN
    DROP TEMPORARY TABLE IF EXISTS tmp_cie10_qc_issues;
    CREATE TEMPORARY TABLE tmp_cie10_qc_issues (
        codigo VARCHAR(10) NOT NULL,
        campo VARCHAR(40) NOT NULL,
        valor_actual TEXT,
        motivo VARCHAR(120) NOT NULL,
        PRIMARY KEY (codigo, campo)
    ) ENGINE=InnoDB;

    -- Campos vacios en ES
    INSERT INTO tmp_cie10_qc_issues (codigo, campo, valor_actual, motivo)
    SELECT codigo, 'nombre_es', nombre_es, 'vacio'
    FROM cie10
    WHERE activo = 1
      AND COALESCE(NULLIF(TRIM(nombre_es), ''), '') = '';

    INSERT INTO tmp_cie10_qc_issues (codigo, campo, valor_actual, motivo)
    SELECT codigo, 'categoria_es', categoria_es, 'vacio'
    FROM cie10
    WHERE activo = 1
      AND COALESCE(NULLIF(TRIM(categoria_es), ''), '') = '';

    INSERT INTO tmp_cie10_qc_issues (codigo, campo, valor_actual, motivo)
    SELECT codigo, 'subcategoria_es', subcategoria_es, 'vacio'
    FROM cie10
    WHERE activo = 1
      AND COALESCE(NULLIF(TRIM(subcategoria_es), ''), '') = '';

    -- Tokens EN prohibidos en ES
    INSERT INTO tmp_cie10_qc_issues (codigo, campo, valor_actual, motivo)
    SELECT codigo, 'nombre_es', nombre_es, 'token_en_detectado'
    FROM cie10
    WHERE activo = 1
      AND LOWER(COALESCE(nombre_es, '')) REGEXP '(^|[^a-z])(due to|other|unspecified|acute|chronic|infection|disease|with|without|certain|infectious|parasitic|digestive|respiratory|circulatory|nervous|genitourinary|mononeuropathy|polyneuropathy|neuropathy|nerve|root|plexus|gland|glands|history|screening|examination)([^a-z]|$)';

    INSERT INTO tmp_cie10_qc_issues (codigo, campo, valor_actual, motivo)
    SELECT codigo, 'categoria_es', categoria_es, 'token_en_detectado'
    FROM cie10
    WHERE activo = 1
      AND LOWER(COALESCE(categoria_es, '')) REGEXP '(^|[^a-z])(certain|diseases|infectious|parasitic|system|digestive|respiratory|circulatory|nervous|gland|glands)([^a-z]|$)';

    INSERT INTO tmp_cie10_qc_issues (codigo, campo, valor_actual, motivo)
    SELECT codigo, 'subcategoria_es', subcategoria_es, 'token_en_detectado'
    FROM cie10
    WHERE activo = 1
      AND LOWER(COALESCE(subcategoria_es, '')) REGEXP '(^|[^a-z])(infectious|diseases|disorders|digestive|respiratory|circulatory|nervous|genitourinary|nerve|root|plexus|neuropathy|gland|glands)([^a-z]|$)';

    -- Resumen general
    SELECT
        (SELECT COUNT(*) FROM cie10 WHERE activo = 1) AS activos,
        (SELECT COUNT(*) FROM tmp_cie10_qc_issues) AS issues_totales,
        (SELECT COUNT(DISTINCT codigo) FROM tmp_cie10_qc_issues) AS codigos_con_issue;

    -- Resumen por motivo/campo
    SELECT campo, motivo, COUNT(*) AS cantidad
    FROM tmp_cie10_qc_issues
    GROUP BY campo, motivo
    ORDER BY campo, motivo;

    -- Muestra para correccion
    SELECT codigo, campo, motivo, valor_actual
    FROM tmp_cie10_qc_issues
    ORDER BY codigo, campo
    LIMIT 300;
END $$

DROP PROCEDURE IF EXISTS sp_cie10_qc_validar_o_fallar $$
CREATE PROCEDURE sp_cie10_qc_validar_o_fallar()
BEGIN
    DECLARE v_issues INT DEFAULT 0;

    -- Ejecutar misma logica de conteo rapido
    SELECT
        (
            SELECT COUNT(*)
            FROM cie10
            WHERE activo = 1
              AND (
                    COALESCE(NULLIF(TRIM(nombre_es), ''), '') = ''
                 OR COALESCE(NULLIF(TRIM(categoria_es), ''), '') = ''
                 OR COALESCE(NULLIF(TRIM(subcategoria_es), ''), '') = ''
                     OR LOWER(COALESCE(nombre_es, '')) REGEXP '(^|[^a-z])(due to|other|unspecified|acute|chronic|infection|disease|with|without|certain|infectious|parasitic|digestive|respiratory|circulatory|nervous|genitourinary|mononeuropathy|polyneuropathy|neuropathy|nerve|root|plexus|gland|glands|history|screening|examination)([^a-z]|$)'
                   OR LOWER(COALESCE(categoria_es, '')) REGEXP '(^|[^a-z])(certain|diseases|infectious|parasitic|system|digestive|respiratory|circulatory|nervous|gland|glands)([^a-z]|$)'
                     OR LOWER(COALESCE(subcategoria_es, '')) REGEXP '(^|[^a-z])(infectious|diseases|disorders|digestive|respiratory|circulatory|nervous|genitourinary|nerve|root|plexus|neuropathy|gland|glands)([^a-z]|$)'
              )
        )
    INTO v_issues;

    IF v_issues > 0 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'QC CIE10 ES fallido: existen registros contaminados o vacios. Ejecuta CALL sp_cie10_qc_generar();';
    ELSE
        SELECT 'QC CIE10 ES OK - sin contaminacion detectada' AS resultado;
    END IF;
END $$

DELIMITER ;

-- Uso recomendado:
-- 1) Diagnostico detallado:
-- CALL sp_cie10_qc_generar();
--
-- 2) Validacion estricta (hard-stop):
-- CALL sp_cie10_qc_validar_o_fallar();
