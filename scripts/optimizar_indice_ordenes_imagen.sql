-- Ejecutar una sola vez por base de datos.
-- Optimiza el panel médico: filtro por responsable/modalidad y orden cronológico.

ALTER TABLE ordenes_imagen
    ADD INDEX idx_oi_medico_tipo_fecha (medico_id, tipo, fecha);

SHOW INDEX FROM ordenes_imagen WHERE Key_name = 'idx_oi_medico_tipo_fecha';
