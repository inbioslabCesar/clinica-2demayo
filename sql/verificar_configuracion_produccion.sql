-- Script para verificar y crear la tabla configuracion_clinica en producción
-- Ejecutar este script en la base de datos de Hostinger

-- Verificar si la tabla existe
SELECT COUNT(*) as table_exists 
FROM information_schema.tables 
WHERE table_schema = 'u330560936_2demayobd' 
AND table_name = 'configuracion_clinica';

-- Crear la tabla si no existe
CREATE TABLE IF NOT EXISTS configuracion_clinica (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre_clinica VARCHAR(255) NOT NULL,
  direccion TEXT NOT NULL,
  telefono VARCHAR(20) NOT NULL,
  email VARCHAR(100) NOT NULL,
  horario_atencion TEXT,
  logo_url VARCHAR(500) NULL,
  website VARCHAR(255) NULL,
  ruc VARCHAR(20) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Insertar datos por defecto si no existen
INSERT INTO configuracion_clinica (
  nombre_clinica, 
  direccion, 
  telefono, 
  email, 
  horario_atencion
) 
SELECT 
  'Clínica 2 de Mayo',
  'Av. Principal 123, Lima, Perú', 
  '(01) 234-5678',
  'info@clinica2demayo.com',
  'Lunes a Viernes: 7:00 AM - 8:00 PM\nSábados: 7:00 AM - 2:00 PM'
WHERE NOT EXISTS (SELECT 1 FROM configuracion_clinica LIMIT 1);

-- Verificar que los datos fueron insertados
SELECT * FROM configuracion_clinica ORDER BY created_at DESC LIMIT 1;