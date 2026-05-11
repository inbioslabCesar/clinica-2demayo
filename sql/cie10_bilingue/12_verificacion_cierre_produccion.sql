-- 12_verificacion_cierre_produccion.sql
-- Verificacion final de cierre CIE10 ES en produccion (solo lectura).
-- No modifica datos.

SET NAMES utf8mb4;

-- 1) Conteo base de registros activos
SELECT COUNT(*) AS activos_total
FROM cie10
WHERE activo = 1;

-- 2) Vacios en columnas ES (debe ser 0 en los tres)
SELECT
    SUM(CASE WHEN nombre_es IS NULL OR CHAR_LENGTH(TRIM(nombre_es)) = 0 THEN 1 ELSE 0 END) AS vacios_nombre_es,
    SUM(CASE WHEN categoria_es IS NULL OR CHAR_LENGTH(TRIM(categoria_es)) = 0 THEN 1 ELSE 0 END) AS vacios_categoria_es,
    SUM(CASE WHEN subcategoria_es IS NULL OR CHAR_LENGTH(TRIM(subcategoria_es)) = 0 THEN 1 ELSE 0 END) AS vacios_subcategoria_es
FROM cie10
WHERE activo = 1;

-- 3) Tokens EN residuales (debe ser 0)
SELECT COUNT(*) AS posibles_tokens_en
FROM cie10
WHERE activo = 1
  AND (
        LOWER(COALESCE(nombre_es, '')) REGEXP '(^|[^a-z])(due to|other|unspecified|acute|chronic|infection|disease|with|without|certain|infectious|parasitic|digestive|respiratory|circulatory|nervous|genitourinary)([^a-z]|$)'
     OR LOWER(COALESCE(categoria_es, '')) REGEXP '(^|[^a-z])(certain|diseases|infectious|parasitic|system|digestive|respiratory|circulatory|nervous)([^a-z]|$)'
     OR LOWER(COALESCE(subcategoria_es, '')) REGEXP '(^|[^a-z])(infectious|diseases|disorders|digestive|respiratory|circulatory|nervous|genitourinary)([^a-z]|$)'
  );

-- 4) Verificacion QC oficial (debe responder OK)
CALL sp_cie10_qc_validar_o_fallar();

-- 5) Muestra rapida para inspeccion visual (opcional)
SELECT codigo, nombre_es, categoria_es, subcategoria_es
FROM cie10
WHERE activo = 1
ORDER BY codigo
LIMIT 30;
