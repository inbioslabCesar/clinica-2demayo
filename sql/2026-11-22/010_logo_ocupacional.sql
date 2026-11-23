-- Logo horizontal de documentos ocupacionales (certificados y PDFs de salud ocupacional).
-- Columna opcional: sin ella, api_configuracion.php y la pantalla de Configuración funcionan igual y los documentos usan logo_url.
-- Idempotente. Aplicar solo en instalaciones que activen el módulo 'ocupacional' (2 de Mayo).

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'configuracion_clinica' AND COLUMN_NAME = 'logo_ocupacional_url');
SET @ddl := IF(@existe = 0,
               'ALTER TABLE configuracion_clinica ADD COLUMN logo_ocupacional_url VARCHAR(500) DEFAULT NULL',
               'SELECT ''logo_ocupacional_url ya existe'' AS info');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Verificación: debe devolver 1 fila
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'configuracion_clinica' AND COLUMN_NAME = 'logo_ocupacional_url';
