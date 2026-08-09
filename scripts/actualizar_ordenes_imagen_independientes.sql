-- Permite registrar estudios de imagen vendidos directamente, sin crear una consulta médica ficticia.
ALTER TABLE ordenes_imagen
    MODIFY consulta_id INT NULL;

-- Normaliza órdenes directas que históricamente se almacenaron con 0.
UPDATE ordenes_imagen
SET consulta_id = NULL
WHERE consulta_id = 0;

SHOW COLUMNS FROM ordenes_imagen LIKE 'consulta_id';