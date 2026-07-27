-- Verificacion de la plantilla HC integral de Pediatria

SELECT
  id,
  template_id,
  version,
  nombre,
  clinic_key,
  activo,
  JSON_LENGTH(JSON_EXTRACT(schema_json, '$.sections')) AS total_secciones,
  updated_at
FROM hc_templates
WHERE template_id = 'pediatria'
ORDER BY (clinic_key IS NULL OR clinic_key = '') DESC, id DESC;