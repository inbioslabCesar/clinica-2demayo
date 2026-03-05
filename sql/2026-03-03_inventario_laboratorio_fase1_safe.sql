-- =========================================================
-- MIGRACIÓN INVENTARIO LABORATORIO (FASE 1) - SAFE
-- Fecha: 2026-03-03
-- Uso: ejecutar en phpMyAdmin dentro de la BD poli2demayo
-- =========================================================

SET NAMES utf8mb4;

-- 1) Crear tablas base (sin FKs al inicio para evitar bloqueos)

CREATE TABLE IF NOT EXISTS inventario_items (
    id INT NOT NULL AUTO_INCREMENT,
    codigo VARCHAR(40) NOT NULL,
    nombre VARCHAR(150) NOT NULL,
    categoria VARCHAR(30) NOT NULL,
    marca VARCHAR(80) NULL,
    presentacion VARCHAR(120) NULL,
    factor_presentacion DECIMAL(12,4) NOT NULL DEFAULT 1,
    unidad_medida VARCHAR(30) NOT NULL,
    controla_stock TINYINT(1) NOT NULL DEFAULT 1,
    stock_minimo DECIMAL(12,2) NOT NULL DEFAULT 0,
    stock_critico DECIMAL(12,2) NOT NULL DEFAULT 0,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_inventario_items_codigo (codigo),
    KEY idx_inventario_items_nombre (nombre),
    KEY idx_inventario_items_categoria (categoria),
    KEY idx_inventario_items_controla_stock (controla_stock),
    KEY idx_inventario_items_activo (activo),
    KEY idx_inventario_items_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS inventario_lotes (
    id INT NOT NULL AUTO_INCREMENT,
    item_id INT NOT NULL,
    lote_codigo VARCHAR(80) NOT NULL,
    fecha_vencimiento DATE NULL,
    cantidad_inicial DECIMAL(12,2) NOT NULL DEFAULT 0,
    cantidad_actual DECIMAL(12,2) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NULL,
    PRIMARY KEY (id),
    KEY idx_inventario_lotes_item (item_id),
    KEY idx_inventario_lotes_venc (fecha_vencimiento),
    KEY idx_inventario_lotes_stock (cantidad_actual),
    KEY idx_inventario_lotes_item_stock_venc (item_id, cantidad_actual, fecha_vencimiento, id),
    KEY idx_inventario_lotes_venc_stock_item (fecha_vencimiento, cantidad_actual, item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS inventario_movimientos (
    id INT NOT NULL AUTO_INCREMENT,
    item_id INT NOT NULL,
    lote_id INT NULL,
    tipo VARCHAR(20) NOT NULL,
    cantidad DECIMAL(12,2) NOT NULL,
    observacion VARCHAR(255) NULL,
    origen VARCHAR(30) NOT NULL DEFAULT 'inventario',
    usuario_id INT NULL,
    fecha_hora DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_inventario_mov_item (item_id),
    KEY idx_inventario_mov_lote (lote_id),
    KEY idx_inventario_mov_tipo (tipo),
    KEY idx_inventario_mov_origen (origen),
    KEY idx_inventario_mov_fecha (fecha_hora),
    KEY idx_inventario_mov_fecha_id (fecha_hora, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS inventario_examen_recetas (
    id INT NOT NULL AUTO_INCREMENT,
    id_examen INT NOT NULL,
    item_id INT NOT NULL,
    cantidad_por_prueba DECIMAL(12,4) NOT NULL,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    observacion VARCHAR(255) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_inventario_receta_examen_item (id_examen, item_id),
    KEY idx_inventario_receta_examen (id_examen),
    KEY idx_inventario_receta_item (item_id),
    KEY idx_inventario_receta_activo (activo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS inventario_transferencias (
    id INT NOT NULL AUTO_INCREMENT,
    origen VARCHAR(50) NOT NULL DEFAULT 'almacen_principal',
    destino VARCHAR(50) NOT NULL DEFAULT 'laboratorio',
    usuario_id INT NULL,
    observacion VARCHAR(255) NULL,
    fecha_hora DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_inventario_transferencias_fecha (fecha_hora),
    KEY idx_inventario_transferencias_destino (destino),
    KEY idx_transfer_destino_id (destino, id),
    KEY idx_transfer_fecha_id (fecha_hora, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS inventario_transferencias_detalle (
    id INT NOT NULL AUTO_INCREMENT,
    transferencia_id INT NOT NULL,
    item_id INT NOT NULL,
    cantidad DECIMAL(12,4) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_inventario_transfer_det_transf (transferencia_id),
    KEY idx_inventario_transfer_det_item (item_id),
    KEY idx_transfer_det_item_transfer (item_id, transferencia_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS inventario_consumos_examen (
    id INT NOT NULL AUTO_INCREMENT,
    orden_id INT NULL,
    cobro_id INT NULL,
    consulta_id INT NULL,
    paciente_id INT NULL,
    id_examen INT NOT NULL,
    item_id INT NOT NULL,
    cantidad_consumida DECIMAL(12,4) NOT NULL,
    origen_evento VARCHAR(30) NOT NULL DEFAULT 'resultado',
    estado VARCHAR(20) NOT NULL DEFAULT 'aplicado',
    usuario_id INT NULL,
    observacion VARCHAR(255) NULL,
    fecha_hora DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_consumo_evento_orden (orden_id, id_examen, item_id, origen_evento),
    KEY idx_inventario_consumo_orden (orden_id),
    KEY idx_inventario_consumo_cobro (cobro_id),
    KEY idx_inventario_consumo_examen (id_examen),
    KEY idx_inventario_consumo_item (item_id),
    KEY idx_inventario_consumo_fecha (fecha_hora),
    KEY idx_consumo_estado_item (estado, item_id),
    KEY idx_consumo_repeticion (estado, origen_evento, fecha_hora, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2) Compatibilidad de columnas en inventario_items
SET @sql_add_col_marca := (
    SELECT IF(
        EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inventario_items' AND COLUMN_NAME = 'marca'),
        'SELECT 1',
        'ALTER TABLE inventario_items ADD COLUMN marca VARCHAR(80) NULL AFTER categoria'
    )
);
PREPARE stmt_add_col_marca FROM @sql_add_col_marca; EXECUTE stmt_add_col_marca; DEALLOCATE PREPARE stmt_add_col_marca;

SET @sql_add_col_presentacion := (
    SELECT IF(
        EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inventario_items' AND COLUMN_NAME = 'presentacion'),
        'SELECT 1',
        'ALTER TABLE inventario_items ADD COLUMN presentacion VARCHAR(120) NULL AFTER marca'
    )
);
PREPARE stmt_add_col_presentacion FROM @sql_add_col_presentacion; EXECUTE stmt_add_col_presentacion; DEALLOCATE PREPARE stmt_add_col_presentacion;

SET @sql_add_col_factor := (
    SELECT IF(
        EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inventario_items' AND COLUMN_NAME = 'factor_presentacion'),
        'SELECT 1',
        'ALTER TABLE inventario_items ADD COLUMN factor_presentacion DECIMAL(12,4) NOT NULL DEFAULT 1 AFTER presentacion'
    )
);
PREPARE stmt_add_col_factor FROM @sql_add_col_factor; EXECUTE stmt_add_col_factor; DEALLOCATE PREPARE stmt_add_col_factor;

SET @sql_add_col_controla_stock := (
    SELECT IF(
        EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inventario_items' AND COLUMN_NAME = 'controla_stock'),
        'SELECT 1',
        'ALTER TABLE inventario_items ADD COLUMN controla_stock TINYINT(1) NOT NULL DEFAULT 1 AFTER unidad_medida'
    )
);
PREPARE stmt_add_col_controla_stock FROM @sql_add_col_controla_stock; EXECUTE stmt_add_col_controla_stock; DEALLOCATE PREPARE stmt_add_col_controla_stock;

SET @sql_add_col_created_at := (
    SELECT IF(
        EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inventario_items' AND COLUMN_NAME = 'created_at'),
        'SELECT 1',
        'ALTER TABLE inventario_items ADD COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER activo'
    )
);
PREPARE stmt_add_col_created_at FROM @sql_add_col_created_at; EXECUTE stmt_add_col_created_at; DEALLOCATE PREPARE stmt_add_col_created_at;

SET @sql_add_col_updated_at := (
    SELECT IF(
        EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inventario_items' AND COLUMN_NAME = 'updated_at'),
        'SELECT 1',
        'ALTER TABLE inventario_items ADD COLUMN updated_at DATETIME NULL AFTER created_at'
    )
);
PREPARE stmt_add_col_updated_at FROM @sql_add_col_updated_at; EXECUTE stmt_add_col_updated_at; DEALLOCATE PREPARE stmt_add_col_updated_at;

-- 3) Agregar FKs condicionalmente

SET @sql_fk_lotes_item := (
    SELECT IF(
        EXISTS(SELECT 1 FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'fk_inventario_lotes_item'),
        'SELECT 1',
        'ALTER TABLE inventario_lotes ADD CONSTRAINT fk_inventario_lotes_item FOREIGN KEY (item_id) REFERENCES inventario_items (id) ON DELETE CASCADE'
    )
);
PREPARE stmt_fk_lotes_item FROM @sql_fk_lotes_item; EXECUTE stmt_fk_lotes_item; DEALLOCATE PREPARE stmt_fk_lotes_item;

SET @sql_fk_mov_item := (
    SELECT IF(
        EXISTS(SELECT 1 FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'fk_inventario_mov_item'),
        'SELECT 1',
        'ALTER TABLE inventario_movimientos ADD CONSTRAINT fk_inventario_mov_item FOREIGN KEY (item_id) REFERENCES inventario_items (id) ON DELETE CASCADE'
    )
);
PREPARE stmt_fk_mov_item FROM @sql_fk_mov_item; EXECUTE stmt_fk_mov_item; DEALLOCATE PREPARE stmt_fk_mov_item;

SET @sql_fk_mov_lote := (
    SELECT IF(
        EXISTS(SELECT 1 FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'fk_inventario_mov_lote'),
        'SELECT 1',
        'ALTER TABLE inventario_movimientos ADD CONSTRAINT fk_inventario_mov_lote FOREIGN KEY (lote_id) REFERENCES inventario_lotes (id) ON DELETE SET NULL'
    )
);
PREPARE stmt_fk_mov_lote FROM @sql_fk_mov_lote; EXECUTE stmt_fk_mov_lote; DEALLOCATE PREPARE stmt_fk_mov_lote;

SET @sql_fk_receta_item := (
    SELECT IF(
        EXISTS(SELECT 1 FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'fk_inventario_receta_item'),
        'SELECT 1',
        'ALTER TABLE inventario_examen_recetas ADD CONSTRAINT fk_inventario_receta_item FOREIGN KEY (item_id) REFERENCES inventario_items (id) ON DELETE CASCADE'
    )
);
PREPARE stmt_fk_receta_item FROM @sql_fk_receta_item; EXECUTE stmt_fk_receta_item; DEALLOCATE PREPARE stmt_fk_receta_item;

SET @sql_fk_receta_examen := (
    SELECT IF(
        EXISTS(SELECT 1 FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'fk_inventario_receta_examen_lab'),
        'SELECT 1',
        'ALTER TABLE inventario_examen_recetas ADD CONSTRAINT fk_inventario_receta_examen_lab FOREIGN KEY (id_examen) REFERENCES examenes_laboratorio (id) ON DELETE CASCADE'
    )
);
PREPARE stmt_fk_receta_examen FROM @sql_fk_receta_examen; EXECUTE stmt_fk_receta_examen; DEALLOCATE PREPARE stmt_fk_receta_examen;

SET @sql_fk_transfer_det_transfer := (
    SELECT IF(
        EXISTS(SELECT 1 FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'fk_inventario_transfer_det_transferencia'),
        'SELECT 1',
        'ALTER TABLE inventario_transferencias_detalle ADD CONSTRAINT fk_inventario_transfer_det_transferencia FOREIGN KEY (transferencia_id) REFERENCES inventario_transferencias (id) ON DELETE CASCADE'
    )
);
PREPARE stmt_fk_transfer_det_transfer FROM @sql_fk_transfer_det_transfer; EXECUTE stmt_fk_transfer_det_transfer; DEALLOCATE PREPARE stmt_fk_transfer_det_transfer;

SET @sql_fk_transfer_det_item := (
    SELECT IF(
        EXISTS(SELECT 1 FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'fk_inventario_transfer_det_item'),
        'SELECT 1',
        'ALTER TABLE inventario_transferencias_detalle ADD CONSTRAINT fk_inventario_transfer_det_item FOREIGN KEY (item_id) REFERENCES inventario_items (id) ON DELETE CASCADE'
    )
);
PREPARE stmt_fk_transfer_det_item FROM @sql_fk_transfer_det_item; EXECUTE stmt_fk_transfer_det_item; DEALLOCATE PREPARE stmt_fk_transfer_det_item;

SET @sql_fk_consumo_item := (
    SELECT IF(
        EXISTS(SELECT 1 FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'fk_inventario_consumo_item'),
        'SELECT 1',
        'ALTER TABLE inventario_consumos_examen ADD CONSTRAINT fk_inventario_consumo_item FOREIGN KEY (item_id) REFERENCES inventario_items (id) ON DELETE CASCADE'
    )
);
PREPARE stmt_fk_consumo_item FROM @sql_fk_consumo_item; EXECUTE stmt_fk_consumo_item; DEALLOCATE PREPARE stmt_fk_consumo_item;

SET @sql_fk_consumo_examen := (
    SELECT IF(
        EXISTS(SELECT 1 FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'fk_inventario_consumo_examen_lab'),
        'SELECT 1',
        'ALTER TABLE inventario_consumos_examen ADD CONSTRAINT fk_inventario_consumo_examen_lab FOREIGN KEY (id_examen) REFERENCES examenes_laboratorio (id) ON DELETE CASCADE'
    )
);
PREPARE stmt_fk_consumo_examen FROM @sql_fk_consumo_examen; EXECUTE stmt_fk_consumo_examen; DEALLOCATE PREPARE stmt_fk_consumo_examen;

SET @sql_fk_consumo_orden := (
    SELECT IF(
        EXISTS(SELECT 1 FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'fk_inventario_consumo_orden_lab'),
        'SELECT 1',
        'ALTER TABLE inventario_consumos_examen ADD CONSTRAINT fk_inventario_consumo_orden_lab FOREIGN KEY (orden_id) REFERENCES ordenes_laboratorio (id) ON DELETE SET NULL'
    )
);
PREPARE stmt_fk_consumo_orden FROM @sql_fk_consumo_orden; EXECUTE stmt_fk_consumo_orden; DEALLOCATE PREPARE stmt_fk_consumo_orden;

SET @sql_fk_consumo_paciente := (
    SELECT IF(
        EXISTS(SELECT 1 FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'fk_inventario_consumo_paciente'),
        'SELECT 1',
        'ALTER TABLE inventario_consumos_examen ADD CONSTRAINT fk_inventario_consumo_paciente FOREIGN KEY (paciente_id) REFERENCES pacientes (id) ON DELETE SET NULL'
    )
);
PREPARE stmt_fk_consumo_paciente FROM @sql_fk_consumo_paciente; EXECUTE stmt_fk_consumo_paciente; DEALLOCATE PREPARE stmt_fk_consumo_paciente;

SELECT 'OK - Fase1 SAFE aplicada/verificada.' AS resultado;
