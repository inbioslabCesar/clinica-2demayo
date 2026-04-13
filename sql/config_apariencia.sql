-- Tabla para almacenar avatares y configuración de apariencia del asistente de HC
-- Permite gestionar imágenes de avatares y color primario personalizado

CREATE TABLE IF NOT EXISTS config_apariencia (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tipo VARCHAR(50) NOT NULL DEFAULT 'avatar',
  clave VARCHAR(100) NOT NULL UNIQUE,
  valor TEXT NOT NULL,
  descripcion VARCHAR(255) NULL,
  activo BOOLEAN DEFAULT 0,
  order_index INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_config_tipo_clave (tipo, clave),
  KEY idx_config_activo (activo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insertar datos por defecto
INSERT INTO config_apariencia (tipo, clave, valor, descripcion, activo, order_index) 
VALUES 
  ('color', 'color_primario', '#3B82F6', 'Color primario del sistema', 1, 0),
  ('avatar', 'avatar_medico_defecto', '', 'Avatar predefinido para médicos', 0, 1),
  ('avatar', 'avatar_doctora_defecto', '', 'Avatar predefinido para doctoras', 0, 2),
  ('avatar', 'avatar_asistente_defecto', '', 'Avatar predefinido para asistentes', 0, 3)
ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP;

-- Índice para optimizar búsquedas por tipo
CREATE INDEX idx_config_apariencia_tipo ON config_apariencia(tipo);
