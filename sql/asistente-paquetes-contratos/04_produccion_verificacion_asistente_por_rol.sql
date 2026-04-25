-- 04_produccion_verificacion_asistente_por_rol.sql
-- Verificacion de conocimiento del asistente por rol

SELECT
  categoria,
  COUNT(*) AS total
FROM asistente_conocimiento
WHERE categoria = 'Roles y Flujos'
GROUP BY categoria;

SELECT
  pregunta,
  LEFT(respuesta, 150) AS resumen,
  orden,
  activo
FROM asistente_conocimiento
WHERE categoria = 'Roles y Flujos'
ORDER BY orden, id;

SELECT
  palabra_base,
  sinonimo,
  categoria,
  peso_relevancia,
  activo
FROM asistente_sinonimos
WHERE categoria = 'roles'
ORDER BY palabra_base, sinonimo;
