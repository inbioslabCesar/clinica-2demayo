CREATE TABLE IF NOT EXISTS public_servicios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  titulo VARCHAR(200) NOT NULL,
  descripcion TEXT NULL,
  icono VARCHAR(120) NULL,
  imagen_url VARCHAR(255) NULL,
  precio DECIMAL(10,2) NULL,
  orden INT NOT NULL DEFAULT 0,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_public_servicios_activo_orden (activo, orden)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

START TRANSACTION;

CREATE TEMPORARY TABLE tmp_servicios_femcare (
  titulo VARCHAR(200) NOT NULL,
  descripcion TEXT NULL,
  orden INT NOT NULL
);

INSERT INTO tmp_servicios_femcare (titulo, descripcion, orden) VALUES
('Chequeo ginecológico', 'Evaluación integral para prevenir y detectar a tiempo.', 1),
('Papanicolaou cérvix', 'Tamizaje de cuello uterino con atención profesional.', 2),
('Ecografías ginecológicas', 'Imagenología especializada para salud femenina.', 3),
('Ecografías obstétricas', 'Control ecográfico del embarazo por etapas.', 4),
('Ecografías especializadas', 'Estudios de precisión para diagnósticos complejos.', 5),
('Planificación familiar', 'Asesoría personalizada en métodos anticonceptivos.', 6),
('Estética ginecológica láser', 'Procedimientos láser enfocados en bienestar íntimo.', 7),
('Controles prenatales', 'Seguimiento continuo para una gestación segura.', 8),
('Atención de parto', 'Acompañamiento médico en parto seguro y humanizado.', 9),
('Chip de rejuvenecimiento', 'Terapia hormonal con valoración médica previa.', 10),
('Cirugías ginecológicas', 'Intervenciones ginecológicas con enfoque mínimamente invasivo.', 11);

UPDATE public_servicios
SET activo = 0
WHERE activo = 1;

UPDATE public_servicios ps
INNER JOIN tmp_servicios_femcare ts
  ON ts.titulo COLLATE utf8mb4_unicode_ci = ps.titulo COLLATE utf8mb4_unicode_ci
SET
  ps.titulo = ts.titulo,
  ps.descripcion = ts.descripcion,
  ps.orden = ts.orden,
  ps.activo = 1,
  ps.actualizado_en = CURRENT_TIMESTAMP;

INSERT INTO public_servicios (titulo, descripcion, precio, icono, imagen_url, orden, activo)
SELECT ts.titulo, ts.descripcion, NULL, NULL, NULL, ts.orden, 1
FROM tmp_servicios_femcare ts
LEFT JOIN public_servicios ps
  ON ps.titulo COLLATE utf8mb4_unicode_ci = ts.titulo COLLATE utf8mb4_unicode_ci
WHERE ps.id IS NULL;

DROP TEMPORARY TABLE tmp_servicios_femcare;

COMMIT;

SELECT id, titulo, orden, activo
FROM public_servicios
WHERE activo = 1
ORDER BY orden ASC, id ASC;