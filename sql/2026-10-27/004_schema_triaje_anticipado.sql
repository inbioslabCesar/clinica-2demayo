-- 004_schema_triaje_anticipado.sql
-- Auditoría de excepciones de triaje anticipado

CREATE TABLE IF NOT EXISTS triaje_procesamiento_anticipado_auditoria (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    consulta_id INT NOT NULL,
    triaje_id INT NULL,
    fecha_programada_operativa DATE NULL,
    fecha_hoy_operativa DATE NOT NULL,
    usuario_id INT NULL,
    usuario_rol VARCHAR(60) NULL,
    usuario_nombre VARCHAR(120) NULL,
    motivo VARCHAR(255) NOT NULL,
    accion VARCHAR(30) NOT NULL DEFAULT 'override',
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_tpaa_consulta (consulta_id),
    KEY idx_tpaa_fecha (fecha_programada_operativa)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

