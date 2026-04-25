-- 90_desarrollo_sync_asistente_paquetes_contratos.sql
-- Uso en entorno desarrollo para mantener el asistente alineado con produccion.
--
-- Flujo recomendado en desarrollo:
--   1) Ejecutar 01_produccion_seed_asistente_paquetes_contratos.sql
--   2) Ejecutar este script para limpiar duplicados por pregunta en estas categorias
--   3) Ejecutar 02_produccion_verificacion_asistente_paquetes_contratos.sql

START TRANSACTION;

-- Mantener una sola fila por pregunta en las categorias del alcance.
-- Conserva el menor id (mas antiguo) y elimina duplicados.
DELETE a1
FROM asistente_conocimiento a1
INNER JOIN asistente_conocimiento a2
  ON a1.pregunta = a2.pregunta
 AND a1.id > a2.id
WHERE a1.categoria IN ('Paquetes y Perfiles', 'Contratos')
  AND a2.categoria IN ('Paquetes y Perfiles', 'Contratos');

-- Asegurar que queden activas en desarrollo
UPDATE asistente_conocimiento
SET activo = 1
WHERE categoria IN ('Paquetes y Perfiles', 'Contratos');

COMMIT;

SELECT 'OK sync desarrollo asistente paquetes/contratos' AS estado;
