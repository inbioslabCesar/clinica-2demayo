-- 01_schema_receta_hc_delta_pendientes_v1.sql
-- Soporte de trazabilidad por item de receta para aplicar logica delta (pendientes) sin duplicados.
-- Idempotente para despliegue en produccion.

CREATE TABLE IF NOT EXISTS hc_receta_items_estado (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    consulta_id INT NOT NULL,
    hc_id INT NULL,
    cotizacion_id INT NULL,
    item_fingerprint CHAR(40) NOT NULL,
    codigo VARCHAR(80) NULL,
    nombre VARCHAR(255) NULL,
    cantidad_calculada INT NOT NULL DEFAULT 1,
    estado ENUM('pendiente_sync', 'sincronizado_auto', 'confirmado_quimico', 'dispensado', 'cancelado') NOT NULL DEFAULT 'pendiente_sync',
    ultimo_motivo VARCHAR(80) NULL,
    payload_json JSON NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_hc_receta_item_consulta_fp (consulta_id, item_fingerprint),
    KEY idx_hc_receta_item_estado (estado),
    KEY idx_hc_receta_item_cotizacion (cotizacion_id),
    KEY idx_hc_receta_item_consulta (consulta_id),
    CONSTRAINT fk_hc_receta_item_consulta
        FOREIGN KEY (consulta_id) REFERENCES consultas(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_hc_receta_item_hc
        FOREIGN KEY (hc_id) REFERENCES historia_clinica(id)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_hc_receta_item_cotizacion
        FOREIGN KEY (cotizacion_id) REFERENCES cotizaciones(id)
        ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
