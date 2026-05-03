-- 01_schema_receta_hc_cotizacion_automatica.sql
-- Esquema para sincronizacion automatica de receta (HC) a cotizacion.
-- Idempotente: se puede ejecutar multiples veces.

CREATE TABLE IF NOT EXISTS hc_receta_cotizacion_sync (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    consulta_id INT NOT NULL,
    hc_id INT NULL,
    cotizacion_id INT NULL,
    receta_hash CHAR(40) NOT NULL,
    receta_items_total INT NOT NULL DEFAULT 0,
    items_sincronizados INT NOT NULL DEFAULT 0,
    items_pendientes INT NOT NULL DEFAULT 0,
    estado ENUM('ok', 'parcial', 'pendiente_mapeo', 'error') NOT NULL DEFAULT 'ok',
    ultimo_error TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_hc_receta_sync_consulta (consulta_id),
    KEY idx_hc_receta_sync_cotizacion (cotizacion_id),
    KEY idx_hc_receta_sync_estado (estado),
    KEY idx_hc_receta_sync_hash (receta_hash),
    CONSTRAINT fk_hc_receta_sync_consulta
        FOREIGN KEY (consulta_id) REFERENCES consultas(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_hc_receta_sync_hc
        FOREIGN KEY (hc_id) REFERENCES historia_clinica(id)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_hc_receta_sync_cotizacion
        FOREIGN KEY (cotizacion_id) REFERENCES cotizaciones(id)
        ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS hc_receta_cotizacion_items_pendientes (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    sync_id BIGINT UNSIGNED NULL,
    consulta_id INT NOT NULL,
    hc_id INT NULL,
    item_idx INT NOT NULL DEFAULT 0,
    codigo VARCHAR(80) NULL,
    nombre VARCHAR(255) NULL,
    motivo VARCHAR(80) NOT NULL,
    payload_json JSON NULL,
    estado ENUM('pendiente', 'resuelto', 'descartado') NOT NULL DEFAULT 'pendiente',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_hc_receta_pend_sync (sync_id),
    KEY idx_hc_receta_pend_consulta (consulta_id),
    KEY idx_hc_receta_pend_estado (estado),
    CONSTRAINT fk_hc_receta_pend_sync
        FOREIGN KEY (sync_id) REFERENCES hc_receta_cotizacion_sync(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_hc_receta_pend_consulta
        FOREIGN KEY (consulta_id) REFERENCES consultas(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_hc_receta_pend_hc
        FOREIGN KEY (hc_id) REFERENCES historia_clinica(id)
        ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
