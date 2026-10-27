-- 002_schema_laboratorio_anticipado.sql
-- Auditoría de procesamiento anticipado en laboratorio

CREATE TABLE IF NOT EXISTS laboratorio_procesamiento_anticipado_auditoria (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    orden_id INT NOT NULL,
    cotizacion_id INT NULL,
    fecha_operativa DATE NULL,
    fecha_hoy_operativa DATE NOT NULL,
    usuario_id INT NULL,
    usuario_rol VARCHAR(60) NULL,
    motivo VARCHAR(255) NOT NULL,
    accion VARCHAR(30) NOT NULL DEFAULT 'override',
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

