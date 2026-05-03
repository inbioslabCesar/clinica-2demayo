-- Migracion: produccion medica vs venta directa
-- Objetivo: registrar el espejo itemizado de cada cobro para dashboard analitico.

CREATE TABLE IF NOT EXISTS produccion_medica_detalle (
    id INT NOT NULL AUTO_INCREMENT,
    fecha_cobro DATETIME NOT NULL,
    periodo_yyyymm CHAR(6) NOT NULL,
    cobro_id INT NOT NULL,
    cobro_detalle_idx INT NOT NULL,
    cotizacion_id INT NULL,
    cotizacion_detalle_id INT NULL,
    consulta_id INT NULL,
    medico_id INT NULL,
    paciente_id INT NULL,
    clasificacion_origen ENUM('produccion_medica', 'venta_directa') NOT NULL DEFAULT 'venta_directa',
    origen_operacion VARCHAR(40) NOT NULL DEFAULT 'caja_directa',
    servicio_tipo VARCHAR(50) NOT NULL,
    servicio_id INT NULL,
    servicio_nombre VARCHAR(255) NULL,
    cantidad DECIMAL(12,2) NOT NULL DEFAULT 1.00,
    precio_unitario_lista DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    monto_bruto_item DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    descuento_item DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    monto_neto_item DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    usuario_caja_id INT NULL,
    caja_id INT NULL,
    turno VARCHAR(20) NULL,
    tipo_pago VARCHAR(30) NULL,
    hash_origen VARCHAR(64) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_pmd_hash_origen (hash_origen),
    KEY idx_pmd_periodo_clasif_medico (periodo_yyyymm, clasificacion_origen, medico_id),
    KEY idx_pmd_fecha_caja (fecha_cobro, caja_id),
    KEY idx_pmd_cobro (cobro_id),
    KEY idx_pmd_consulta (consulta_id),
    KEY idx_pmd_cotizacion_detalle (cotizacion_detalle_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @fk_pmd_cobro_exists := (
    SELECT COUNT(*)
    FROM information_schema.table_constraints
    WHERE table_schema = DATABASE()
      AND table_name = 'produccion_medica_detalle'
      AND constraint_name = 'fk_pmd_cobro'
);
SET @sql_pmd_cobro := IF(
    @fk_pmd_cobro_exists = 0,
    'ALTER TABLE produccion_medica_detalle ADD CONSTRAINT fk_pmd_cobro FOREIGN KEY (cobro_id) REFERENCES cobros(id) ON DELETE CASCADE ON UPDATE CASCADE',
    'SELECT 1'
);
PREPARE stmt_pmd_cobro FROM @sql_pmd_cobro;
EXECUTE stmt_pmd_cobro;
DEALLOCATE PREPARE stmt_pmd_cobro;

SET @fk_pmd_caja_exists := (
    SELECT COUNT(*)
    FROM information_schema.table_constraints
    WHERE table_schema = DATABASE()
      AND table_name = 'produccion_medica_detalle'
      AND constraint_name = 'fk_pmd_caja'
);
SET @sql_pmd_caja := IF(
    @fk_pmd_caja_exists = 0,
    'ALTER TABLE produccion_medica_detalle ADD CONSTRAINT fk_pmd_caja FOREIGN KEY (caja_id) REFERENCES cajas(id) ON DELETE SET NULL ON UPDATE CASCADE',
    'SELECT 1'
);
PREPARE stmt_pmd_caja FROM @sql_pmd_caja;
EXECUTE stmt_pmd_caja;
DEALLOCATE PREPARE stmt_pmd_caja;

SET @fk_pmd_medico_exists := (
    SELECT COUNT(*)
    FROM information_schema.table_constraints
    WHERE table_schema = DATABASE()
      AND table_name = 'produccion_medica_detalle'
      AND constraint_name = 'fk_pmd_medico'
);
SET @sql_pmd_medico := IF(
    @fk_pmd_medico_exists = 0,
    'ALTER TABLE produccion_medica_detalle ADD CONSTRAINT fk_pmd_medico FOREIGN KEY (medico_id) REFERENCES medicos(id) ON DELETE SET NULL ON UPDATE CASCADE',
    'SELECT 1'
);
PREPARE stmt_pmd_medico FROM @sql_pmd_medico;
EXECUTE stmt_pmd_medico;
DEALLOCATE PREPARE stmt_pmd_medico;

SET @fk_pmd_consulta_exists := (
    SELECT COUNT(*)
    FROM information_schema.table_constraints
    WHERE table_schema = DATABASE()
      AND table_name = 'produccion_medica_detalle'
      AND constraint_name = 'fk_pmd_consulta'
);
SET @sql_pmd_consulta := IF(
    @fk_pmd_consulta_exists = 0,
    'ALTER TABLE produccion_medica_detalle ADD CONSTRAINT fk_pmd_consulta FOREIGN KEY (consulta_id) REFERENCES consultas(id) ON DELETE SET NULL ON UPDATE CASCADE',
    'SELECT 1'
);
PREPARE stmt_pmd_consulta FROM @sql_pmd_consulta;
EXECUTE stmt_pmd_consulta;
DEALLOCATE PREPARE stmt_pmd_consulta;

SET @fk_pmd_paciente_exists := (
    SELECT COUNT(*)
    FROM information_schema.table_constraints
    WHERE table_schema = DATABASE()
      AND table_name = 'produccion_medica_detalle'
      AND constraint_name = 'fk_pmd_paciente'
);
SET @sql_pmd_paciente := IF(
    @fk_pmd_paciente_exists = 0,
    'ALTER TABLE produccion_medica_detalle ADD CONSTRAINT fk_pmd_paciente FOREIGN KEY (paciente_id) REFERENCES pacientes(id) ON DELETE SET NULL ON UPDATE CASCADE',
    'SELECT 1'
);
PREPARE stmt_pmd_paciente FROM @sql_pmd_paciente;
EXECUTE stmt_pmd_paciente;
DEALLOCATE PREPARE stmt_pmd_paciente;

SET @fk_pmd_usuario_exists := (
    SELECT COUNT(*)
    FROM information_schema.table_constraints
    WHERE table_schema = DATABASE()
      AND table_name = 'produccion_medica_detalle'
      AND constraint_name = 'fk_pmd_usuario_caja'
);
SET @sql_pmd_usuario := IF(
    @fk_pmd_usuario_exists = 0,
    'ALTER TABLE produccion_medica_detalle ADD CONSTRAINT fk_pmd_usuario_caja FOREIGN KEY (usuario_caja_id) REFERENCES usuarios(id) ON DELETE SET NULL ON UPDATE CASCADE',
    'SELECT 1'
);
PREPARE stmt_pmd_usuario FROM @sql_pmd_usuario;
EXECUTE stmt_pmd_usuario;
DEALLOCATE PREPARE stmt_pmd_usuario;
