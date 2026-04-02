-- Fase 1 HC templates (opcional)
-- Este script habilita overrides por clinica/version para el resolver de HC.

CREATE TABLE IF NOT EXISTS hc_templates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  template_id VARCHAR(100) NOT NULL,
  version VARCHAR(50) NOT NULL,
  nombre VARCHAR(150) NOT NULL,
  schema_version VARCHAR(20) NOT NULL DEFAULT '2.0',
  source VARCHAR(50) NOT NULL DEFAULT 'clinica_override',
  clinic_key VARCHAR(120) NULL,
  schema_json LONGTEXT NOT NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_hc_templates_unique (template_id, version, clinic_key),
  KEY idx_hc_templates_lookup (template_id, activo, clinic_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed inicial minimo (plantillas base)
INSERT INTO hc_templates (template_id, version, nombre, schema_version, source, clinic_key, schema_json, activo)
VALUES
('medicina_general', '2026.04.01', 'Medicina General', '2.0', 'clinica_override', NULL,
 '{"sections":{"anamnesis":{"tiempo_enfermedad":"","forma_inicio":"","curso":""},"antecedentes":{"antecedentes":""},"examen_fisico":{"examen_fisico":""},"plan":{"tratamiento":""}}}', 1),
('ginecologia', '2026.04.01', 'Ginecologia', '2.0', 'clinica_override', NULL,
 '{"sections":{"anamnesis":{"tiempo_enfermedad":"","forma_inicio":"","curso":""},"gineco_obstetricos":{"fur":"","gestas":"","partos":"","cesareas":""},"examen_fisico":{"examen_fisico":""},"plan":{"tratamiento":""}}}', 1),
('pediatria', '2026.04.01', 'Pediatria', '2.0', 'clinica_override', NULL,
 '{"sections":{"anamnesis":{"tiempo_enfermedad":"","forma_inicio":"","curso":""},"antecedentes":{"vacunas_completas":"","alergias":"","antecedentes":""},"crecimiento":{"peso":"","talla":"","imc":""},"plan":{"tratamiento":""}}}', 1)
ON DUPLICATE KEY UPDATE
  nombre = VALUES(nombre),
  schema_version = VALUES(schema_version),
  source = VALUES(source),
  schema_json = VALUES(schema_json),
  activo = VALUES(activo);
