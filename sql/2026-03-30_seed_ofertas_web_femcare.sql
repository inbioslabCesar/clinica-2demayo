CREATE TABLE IF NOT EXISTS public_ofertas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  titulo VARCHAR(200) NOT NULL,
  descripcion TEXT NULL,
  precio_antes DECIMAL(10,2) NULL,
  precio_oferta DECIMAL(10,2) NULL,
  fecha_inicio DATE NULL,
  fecha_fin DATE NULL,
  imagen_url VARCHAR(255) NULL,
  orden INT NOT NULL DEFAULT 0,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_public_ofertas_activo_orden (activo, orden),
  INDEX idx_public_ofertas_fechas (fecha_inicio, fecha_fin)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

START TRANSACTION;

CREATE TEMPORARY TABLE tmp_ofertas_femcare (
  titulo VARCHAR(200) NOT NULL,
  descripcion TEXT NULL,
  precio_antes DECIMAL(10,2) NULL,
  precio_oferta DECIMAL(10,2) NULL,
  fecha_inicio DATE NULL,
  fecha_fin DATE NULL,
  orden INT NOT NULL
);

INSERT INTO tmp_ofertas_femcare (titulo, descripcion, precio_antes, precio_oferta, fecha_inicio, fecha_fin, orden) VALUES
('Pack Chequeo Ginecológico', 'Consulta ginecológica + Papanicolaou con evaluación completa.', 180.00, 129.00, NULL, NULL, 1),
('Ecografía Obstétrica 4D', 'Control prenatal con informe digital y acompañamiento especializado.', 220.00, 169.00, NULL, NULL, 2),
('Control Prenatal Integral', 'Triaje + consulta + ecografía básica en una sola atención.', 260.00, 199.00, NULL, NULL, 3),
('Planificación Familiar', 'Asesoría personalizada y control ginecológico preventivo.', 150.00, 99.00, NULL, NULL, 4);

UPDATE public_ofertas
SET activo = 0
WHERE activo = 1;

UPDATE public_ofertas po
INNER JOIN tmp_ofertas_femcare tf
  ON tf.titulo COLLATE utf8mb4_unicode_ci = po.titulo COLLATE utf8mb4_unicode_ci
SET
  po.titulo = tf.titulo,
  po.descripcion = tf.descripcion,
  po.precio_antes = tf.precio_antes,
  po.precio_oferta = tf.precio_oferta,
  po.fecha_inicio = tf.fecha_inicio,
  po.fecha_fin = tf.fecha_fin,
  po.orden = tf.orden,
  po.activo = 1,
  po.actualizado_en = CURRENT_TIMESTAMP;

INSERT INTO public_ofertas (titulo, descripcion, precio_antes, precio_oferta, fecha_inicio, fecha_fin, imagen_url, orden, activo)
SELECT tf.titulo, tf.descripcion, tf.precio_antes, tf.precio_oferta, tf.fecha_inicio, tf.fecha_fin, NULL, tf.orden, 1
FROM tmp_ofertas_femcare tf
LEFT JOIN public_ofertas po
  ON po.titulo COLLATE utf8mb4_unicode_ci = tf.titulo COLLATE utf8mb4_unicode_ci
WHERE po.id IS NULL;

DROP TEMPORARY TABLE tmp_ofertas_femcare;

COMMIT;

SELECT id, titulo, precio_antes, precio_oferta, orden, activo
FROM public_ofertas
WHERE activo = 1
ORDER BY orden ASC, id ASC;