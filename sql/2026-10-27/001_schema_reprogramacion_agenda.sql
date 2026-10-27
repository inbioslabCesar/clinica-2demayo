-- 001_schema_reprogramacion_agenda.sql
-- Auditoría de reprogramación por grupo/servicio (agenda/cotización)

CREATE TABLE IF NOT EXISTS agenda_reprogramaciones_auditoria (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    evento_grupo VARCHAR(64) NOT NULL,
    cotizacion_id INT NOT NULL,
    cotizacion_detalle_id INT NULL,
    agenda_id BIGINT UNSIGNED NULL,
    consulta_id INT NULL,
    servicio_tipo VARCHAR(30) NOT NULL,
    servicio_id INT NULL,
    fecha_anterior DATE NULL,
    fecha_nueva DATE NOT NULL,
    hora_anterior TIME NULL,
    hora_nueva TIME NULL,
    usuario_id INT NULL,
    motivo VARCHAR(255) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_reprog_cot_serv (cotizacion_id, servicio_tipo, servicio_id, created_at),
    INDEX idx_reprog_evento (evento_grupo),
    INDEX idx_reprog_agenda (agenda_id),
    INDEX idx_reprog_consulta (consulta_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

