-- Migracion idempotente: Honorarios por cobrar (Opcion B)
-- Objetivo: diferir la generacion de honorarios_medicos_movimientos hasta que la cotizacion este pagada al 100%

START TRANSACTION;

CREATE TABLE IF NOT EXISTS honorarios_por_cobrar (
  id INT NOT NULL AUTO_INCREMENT,
  cotizacion_id INT NOT NULL,
  cobro_id INT NOT NULL,
  consulta_id INT NULL,
  medico_id INT NOT NULL,
  paciente_id INT NULL,
  tarifa_id INT NULL,
  tipo_precio ENUM('particular','seguro','convenio') NOT NULL DEFAULT 'particular',
  tipo_servicio VARCHAR(50) NOT NULL,
  descripcion VARCHAR(255) NULL,
  tarifa_total DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  monto_clinica DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  monto_medico DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  porcentaje_aplicado_clinica DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  porcentaje_aplicado_medico DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  metodo_pago_medico ENUM('efectivo','transferencia','cheque','deposito','tarjeta','yape','plin') NOT NULL DEFAULT 'efectivo',
  usuario_cobro_id INT NOT NULL,
  caja_id INT NULL,
  turno VARCHAR(20) NULL,
  observaciones TEXT NULL,
  firma_origen CHAR(40) NOT NULL,
  estado_consolidacion ENUM('pendiente','consolidado','anulado') NOT NULL DEFAULT 'pendiente',
  honorario_movimiento_id_final INT NULL,
  consolidado_at DATETIME NULL,
  anulado_at DATETIME NULL,
  anulado_por INT NULL,
  motivo_anulacion VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_hpc_firma_origen (firma_origen),
  KEY idx_hpc_cot_estado (cotizacion_id, estado_consolidacion),
  KEY idx_hpc_cobro (cobro_id),
  KEY idx_hpc_medico_estado (medico_id, estado_consolidacion),
  KEY idx_hpc_usuario_cobro (usuario_cobro_id),
  KEY idx_hpc_hon_final (honorario_movimiento_id_final)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- FKs idempotentes (solo si no existen)
SET @fk_hpc_cot := (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'honorarios_por_cobrar'
    AND CONSTRAINT_NAME = 'fk_hpc_cotizacion'
);
SET @sql_hpc_cot := IF(@fk_hpc_cot = 0,
  'ALTER TABLE honorarios_por_cobrar ADD CONSTRAINT fk_hpc_cotizacion FOREIGN KEY (cotizacion_id) REFERENCES cotizaciones(id) ON DELETE CASCADE ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt_hpc_cot FROM @sql_hpc_cot;
EXECUTE stmt_hpc_cot;
DEALLOCATE PREPARE stmt_hpc_cot;

SET @fk_hpc_cob := (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'honorarios_por_cobrar'
    AND CONSTRAINT_NAME = 'fk_hpc_cobro'
);
SET @sql_hpc_cob := IF(@fk_hpc_cob = 0,
  'ALTER TABLE honorarios_por_cobrar ADD CONSTRAINT fk_hpc_cobro FOREIGN KEY (cobro_id) REFERENCES cobros(id) ON DELETE CASCADE ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt_hpc_cob FROM @sql_hpc_cob;
EXECUTE stmt_hpc_cob;
DEALLOCATE PREPARE stmt_hpc_cob;

SET @fk_hpc_med := (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'honorarios_por_cobrar'
    AND CONSTRAINT_NAME = 'fk_hpc_medico'
);
SET @sql_hpc_med := IF(@fk_hpc_med = 0,
  'ALTER TABLE honorarios_por_cobrar ADD CONSTRAINT fk_hpc_medico FOREIGN KEY (medico_id) REFERENCES medicos(id) ON DELETE RESTRICT ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt_hpc_med FROM @sql_hpc_med;
EXECUTE stmt_hpc_med;
DEALLOCATE PREPARE stmt_hpc_med;

SET @fk_hpc_usr := (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'honorarios_por_cobrar'
    AND CONSTRAINT_NAME = 'fk_hpc_usuario_cobro'
);
SET @sql_hpc_usr := IF(@fk_hpc_usr = 0,
  'ALTER TABLE honorarios_por_cobrar ADD CONSTRAINT fk_hpc_usuario_cobro FOREIGN KEY (usuario_cobro_id) REFERENCES usuarios(id) ON DELETE RESTRICT ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt_hpc_usr FROM @sql_hpc_usr;
EXECUTE stmt_hpc_usr;
DEALLOCATE PREPARE stmt_hpc_usr;

SET @fk_hpc_caja := (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'honorarios_por_cobrar'
    AND CONSTRAINT_NAME = 'fk_hpc_caja'
);
SET @sql_hpc_caja := IF(@fk_hpc_caja = 0,
  'ALTER TABLE honorarios_por_cobrar ADD CONSTRAINT fk_hpc_caja FOREIGN KEY (caja_id) REFERENCES cajas(id) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt_hpc_caja FROM @sql_hpc_caja;
EXECUTE stmt_hpc_caja;
DEALLOCATE PREPARE stmt_hpc_caja;

SET @fk_hpc_hmf := (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'honorarios_por_cobrar'
    AND CONSTRAINT_NAME = 'fk_hpc_honorario_final'
);
SET @sql_hpc_hmf := IF(@fk_hpc_hmf = 0,
  'ALTER TABLE honorarios_por_cobrar ADD CONSTRAINT fk_hpc_honorario_final FOREIGN KEY (honorario_movimiento_id_final) REFERENCES honorarios_medicos_movimientos(id) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt_hpc_hmf FROM @sql_hpc_hmf;
EXECUTE stmt_hpc_hmf;
DEALLOCATE PREPARE stmt_hpc_hmf;

COMMIT;
