-- Agregar campo para firma digital en configuración de clínica
-- Ejecutar solo si se desea soporte para firma en los PDFs

ALTER TABLE configuracion_clinica 
ADD COLUMN firma_url VARCHAR(500) NULL AFTER logo_url,
ADD COLUMN director_nombre VARCHAR(255) NULL AFTER firma_url,
ADD COLUMN director_cargo VARCHAR(255) NULL AFTER director_nombre,
ADD COLUMN colegio_profesional VARCHAR(255) NULL AFTER director_cargo;

-- Comentarios para los nuevos campos
ALTER TABLE configuracion_clinica 
MODIFY COLUMN firma_url VARCHAR(500) NULL COMMENT 'Ruta de la imagen de la firma del director/responsable',
MODIFY COLUMN director_nombre VARCHAR(255) NULL COMMENT 'Nombre completo del director o responsable que firma',
MODIFY COLUMN director_cargo VARCHAR(255) NULL COMMENT 'Cargo del director (ej: Director Médico, Jefe de Laboratorio)',
MODIFY COLUMN colegio_profesional VARCHAR(255) NULL COMMENT 'Información del colegio profesional (ej: CMP 12345)';