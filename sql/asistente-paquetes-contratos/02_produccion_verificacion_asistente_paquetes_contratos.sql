-- 02_produccion_verificacion_asistente_paquetes_contratos.sql
-- Verificacion posterior al seed del asistente

SELECT
  categoria,
  COUNT(*) AS total_preguntas,
  MIN(orden) AS orden_min,
  MAX(orden) AS orden_max
FROM asistente_conocimiento
WHERE categoria IN ('Paquetes y Perfiles', 'Contratos')
GROUP BY categoria
ORDER BY categoria;

SELECT
  pregunta,
  LEFT(respuesta, 140) AS resumen_respuesta,
  orden,
  activo
FROM asistente_conocimiento
WHERE categoria IN ('Paquetes y Perfiles', 'Contratos')
ORDER BY orden, id;

SELECT
  palabra_base,
  sinonimo,
  categoria,
  peso_relevancia,
  activo
FROM asistente_sinonimos
WHERE categoria IN ('paquetes', 'contratos')
ORDER BY categoria, palabra_base, sinonimo;
