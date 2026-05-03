-- Verificacion post-deploy CIE10 bilingue (ES/EN)
-- Ejecutar despues de 01, 02 y 03, y luego de 05 si aplicaste full ES.
-- IMPORTANTE: reemplaza en TODO el archivo el schema objetivo si no es este:
-- u330560936_femcare_bd

SET NAMES utf8mb4;

SELECT DATABASE() AS base_actual_sesion, 'u330560936_cardiovidabd' AS base_objetivo;

-- 1) Sanidad basica
SELECT
  SUM(CASE WHEN column_name = 'nombre_es' THEN 1 ELSE 0 END) AS has_nombre_es,
  SUM(CASE WHEN column_name = 'categoria_es' THEN 1 ELSE 0 END) AS has_categoria_es,
  SUM(CASE WHEN column_name = 'subcategoria_es' THEN 1 ELSE 0 END) AS has_subcategoria_es,
  SUM(CASE WHEN column_name = 'descripcion_es' THEN 1 ELSE 0 END) AS has_descripcion_es
FROM information_schema.columns
WHERE table_schema = 'u330560936_cardiovidabd'
  AND table_name = 'cie10'
  AND column_name IN ('nombre_es', 'categoria_es', 'subcategoria_es', 'descripcion_es');

-- 2) Cobertura ES
SELECT
  COUNT(*) AS total_activos,
  SUM(CASE WHEN COALESCE(NULLIF(nombre_es, ''), '') <> '' THEN 1 ELSE 0 END) AS con_nombre_es,
  SUM(CASE WHEN COALESCE(NULLIF(nombre_es, ''), '') = '' THEN 1 ELSE 0 END) AS sin_nombre_es,
  ROUND(
    100 * SUM(CASE WHEN COALESCE(NULLIF(nombre_es, ''), '') <> '' THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0),
    2
  ) AS cobertura_es_pct
FROM u330560936_cardiovidabd.cie10
WHERE activo = 1;

-- 3) Cuantos codigos tienen traduccion distinta al EN original
SELECT
  COUNT(*) AS codigos_es_distintos
FROM u330560936_femcare_bd.cie10
WHERE activo = 1
  AND COALESCE(NULLIF(nombre_es, ''), '') <> ''
  AND nombre_es <> nombre;

-- 4) Muestras visuales (UI efectiva con fallback)
SELECT
  codigo,
  COALESCE(NULLIF(nombre_es, ''), nombre) AS nombre_ui,
  nombre AS nombre_en,
  COALESCE(NULLIF(categoria_es, ''), categoria) AS categoria_ui,
  COALESCE(NULLIF(subcategoria_es, ''), subcategoria) AS subcategoria_ui
FROM u330560936_femcare_bd.cie10
WHERE activo = 1
ORDER BY codigo
LIMIT 25;

-- 5) Muestras de codigos con traduccion ES distinta (si existen)
SELECT
  codigo,
  nombre_es,
  nombre,
  categoria_es,
  categoria
FROM u330560936_femcare_bd.cie10
WHERE activo = 1
  AND COALESCE(NULLIF(nombre_es, ''), '') <> ''
  AND nombre_es <> nombre
ORDER BY codigo
LIMIT 25;

-- 6) Pruebas funcionales de busqueda (simula nombre mostrado por API)
-- Termino: diabetes
SELECT
  codigo,
  COALESCE(NULLIF(nombre_es, ''), nombre) AS nombre_ui,
  COALESCE(NULLIF(categoria_es, ''), categoria) AS categoria_ui
FROM u330560936_femcare_bd.cie10
WHERE activo = 1
  AND (
    COALESCE(NULLIF(nombre_es, ''), nombre) LIKE '%diabetes%'
    OR COALESCE(NULLIF(categoria_es, ''), categoria) LIKE '%diabetes%'
    OR COALESCE(NULLIF(subcategoria_es, ''), subcategoria) LIKE '%diabetes%'
  )
ORDER BY codigo
LIMIT 15;

-- Termino: hipertension / hipertensión
SELECT
  codigo,
  COALESCE(NULLIF(nombre_es, ''), nombre) AS nombre_ui,
  COALESCE(NULLIF(categoria_es, ''), categoria) AS categoria_ui
FROM u330560936_femcare_bd.cie10
WHERE activo = 1
  AND (
    COALESCE(NULLIF(nombre_es, ''), nombre) LIKE '%hipertension%'
    OR COALESCE(NULLIF(nombre_es, ''), nombre) LIKE '%hipertensión%'
    OR COALESCE(NULLIF(categoria_es, ''), categoria) LIKE '%hipertension%'
    OR COALESCE(NULLIF(categoria_es, ''), categoria) LIKE '%hipertensión%'
  )
ORDER BY codigo
LIMIT 15;

-- Termino: gastroenteritis
SELECT
  codigo,
  COALESCE(NULLIF(nombre_es, ''), nombre) AS nombre_ui,
  COALESCE(NULLIF(categoria_es, ''), categoria) AS categoria_ui
FROM u330560936_femcare_bd.cie10
WHERE activo = 1
  AND (
    COALESCE(NULLIF(nombre_es, ''), nombre) LIKE '%gastroenteritis%'
    OR COALESCE(NULLIF(categoria_es, ''), categoria) LIKE '%gastroenteritis%'
    OR COALESCE(NULLIF(subcategoria_es, ''), subcategoria) LIKE '%gastroenteritis%'
  )
ORDER BY codigo
LIMIT 15;
