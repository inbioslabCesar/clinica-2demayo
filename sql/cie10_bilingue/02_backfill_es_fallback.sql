-- Backfill ES con fallback seguro
-- No traduce; solo asegura que API tenga valor en ES mientras se carga catalogo castellano.

SET NAMES utf8mb4;

UPDATE cie10
SET
  nombre_es = COALESCE(NULLIF(nombre_es, ''), nombre),
  categoria_es = COALESCE(NULLIF(categoria_es, ''), categoria),
  subcategoria_es = COALESCE(NULLIF(subcategoria_es, ''), subcategoria),
  descripcion_es = COALESCE(NULLIF(descripcion_es, ''), descripcion)
WHERE activo = 1;

SELECT
  COUNT(*) AS total_activos,
  SUM(CASE WHEN nombre_es IS NOT NULL AND nombre_es <> '' THEN 1 ELSE 0 END) AS con_nombre_es
FROM cie10
WHERE activo = 1;
