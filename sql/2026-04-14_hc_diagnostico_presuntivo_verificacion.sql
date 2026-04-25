-- Verificacion funcional de diagnosticos en historia_clinica (JSON)
-- Objetivo: confirmar que se guarda 'presuntivo' y no se rompe el flujo existente.

-- 1) Ultimas historias con diagnosticos JSON
SELECT
  hc.id,
  hc.consulta_id,
  hc.fecha_registro,
  JSON_LENGTH(JSON_EXTRACT(hc.datos, '$.diagnosticos')) AS total_dx
FROM historia_clinica hc
WHERE JSON_CONTAINS_PATH(hc.datos, 'one', '$.diagnosticos')
ORDER BY hc.id DESC
LIMIT 20;

-- 2) Conteo por tipo en los ultimos registros (MySQL 8+ por JSON_TABLE)
SELECT
  LOWER(TRIM(jt.tipo)) AS tipo,
  COUNT(*) AS cantidad
FROM historia_clinica hc
JOIN JSON_TABLE(
  hc.datos,
  '$.diagnosticos[*]'
  COLUMNS (
    tipo VARCHAR(50) PATH '$.tipo' DEFAULT '' ON EMPTY
  )
) AS jt
WHERE hc.id >= (SELECT GREATEST(COALESCE(MAX(id) - 500, 1), 1) FROM historia_clinica)
GROUP BY LOWER(TRIM(jt.tipo))
ORDER BY cantidad DESC;

-- 3) Muestra de diagnosticos presuntivos recientes
SELECT
  hc.id,
  hc.consulta_id,
  hc.fecha_registro,
  jt.codigo,
  jt.nombre,
  jt.tipo,
  jt.observaciones
FROM historia_clinica hc
JOIN JSON_TABLE(
  hc.datos,
  '$.diagnosticos[*]'
  COLUMNS (
    codigo VARCHAR(30) PATH '$.codigo' DEFAULT '' ON EMPTY,
    nombre VARCHAR(255) PATH '$.nombre' DEFAULT '' ON EMPTY,
    tipo VARCHAR(50) PATH '$.tipo' DEFAULT '' ON EMPTY,
    observaciones VARCHAR(500) PATH '$.observaciones' DEFAULT '' ON EMPTY
  )
) AS jt
WHERE LOWER(TRIM(jt.tipo)) = 'presuntivo'
ORDER BY hc.id DESC
LIMIT 50;

-- 4) Control de regresion: verificar que principal/definitivo siguen presentes
SELECT
  SUM(CASE WHEN LOWER(TRIM(jt.tipo)) = 'principal' THEN 1 ELSE 0 END) AS total_principal,
  SUM(CASE WHEN LOWER(TRIM(jt.tipo)) = 'definitivo' THEN 1 ELSE 0 END) AS total_definitivo,
  SUM(CASE WHEN LOWER(TRIM(jt.tipo)) = 'secundario' THEN 1 ELSE 0 END) AS total_secundario,
  SUM(CASE WHEN LOWER(TRIM(jt.tipo)) = 'presuntivo' THEN 1 ELSE 0 END) AS total_presuntivo
FROM historia_clinica hc
JOIN JSON_TABLE(
  hc.datos,
  '$.diagnosticos[*]'
  COLUMNS (
    tipo VARCHAR(50) PATH '$.tipo' DEFAULT '' ON EMPTY
  )
) AS jt;

-- 5) Registros con tipo fuera del dominio esperado (deberia tender a cero)
SELECT
  hc.id,
  hc.consulta_id,
  hc.fecha_registro,
  jt.tipo
FROM historia_clinica hc
JOIN JSON_TABLE(
  hc.datos,
  '$.diagnosticos[*]'
  COLUMNS (
    tipo VARCHAR(50) PATH '$.tipo' DEFAULT '' ON EMPTY
  )
) AS jt
WHERE LOWER(TRIM(jt.tipo)) NOT IN ('principal','secundario','presuntivo','definitivo')
  AND TRIM(jt.tipo) <> ''
ORDER BY hc.id DESC
LIMIT 50;
