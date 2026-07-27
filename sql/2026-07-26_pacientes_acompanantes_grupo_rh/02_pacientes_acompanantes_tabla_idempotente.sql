-- Migracion idempotente: tabla de acompanantes de pacientes (maximo 2 por backend)
-- Fecha: 2026-07-26

CREATE TABLE IF NOT EXISTS pacientes_acompanantes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  paciente_id INT NOT NULL,
  nombre_completo VARCHAR(150) NOT NULL,
  parentesco VARCHAR(30) NOT NULL,
  telefono VARCHAR(30) NULL,
  es_principal TINYINT(1) NOT NULL DEFAULT 0,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_pa_paciente (paciente_id),
  KEY idx_pa_parentesco (parentesco),
  CONSTRAINT fk_pa_paciente FOREIGN KEY (paciente_id) REFERENCES pacientes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
