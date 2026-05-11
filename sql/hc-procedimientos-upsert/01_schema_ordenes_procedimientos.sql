-- 01_schema_ordenes_procedimientos.sql
-- Nueva logica HC: solicitudes de procedimientos con upsert por consulta.

CREATE TABLE IF NOT EXISTS ordenes_procedimientos (
    id INT NOT NULL AUTO_INCREMENT,
    consulta_id INT NOT NULL,
    paciente_id INT DEFAULT NULL,
    procedimientos_json LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    estado VARCHAR(20) DEFAULT 'pendiente',
    cotizacion_id INT DEFAULT NULL,
    usuario_id INT DEFAULT NULL,
    fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_op_consulta_estado_fecha_id (consulta_id, estado, fecha, id),
    KEY idx_op_paciente_fecha_id (paciente_id, fecha, id),
    KEY idx_op_cotizacion (cotizacion_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
