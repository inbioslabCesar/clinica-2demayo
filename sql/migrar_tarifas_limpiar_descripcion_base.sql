-- Script seguro para limpiar el campo descripcion_base en la tabla tarifas
-- Elimina nombre y especialidad del médico si están presentes en la descripción
-- Solo deja el nombre del servicio (ejemplo: "RX de tórax", "Ecografía abdominal")

-- IMPORTANTE: Probar primero en una copia de la base de datos

UPDATE tarifas
SET descripcion_base =
  TRIM(
    REGEXP_REPLACE(
      descripcion_base,
      -- Expresión regular para eliminar prefijos tipo "Dr(a). Nombre Apellido - Especialidad - "
      '^(Dr\(a\)\.\s*)?[A-Za-zÁÉÍÓÚáéíóúñÑ]+(\s+[A-Za-zÁÉÍÓÚáéíóúñÑ]+)?(\s*-\s*[A-Za-zÁÉÍÓÚáéíóúñÑ]+)?\s*-\s*',
      ''
    )
  )
WHERE descripcion_base IS NOT NULL AND descripcion_base != '';

-- Recomendación: revisar los resultados antes de ejecutar en producción
-- SELECT id, descripcion_base FROM tarifas;
