-- =========================================
-- SOLO LAS 2 TABLAS QUE FALTAN
-- Basado en lo que veo en tu captura de pantalla
-- =========================================

-- TABLA 1: LIQUIDACIONES DE MÉDICOS (FALTA)
CREATE TABLE IF NOT EXISTS liquidaciones_medicos (
    id INT PRIMARY KEY AUTO_INCREMENT,
    medico_id INT NOT NULL,
    periodo_desde DATE NOT NULL,
    periodo_hasta DATE NOT NULL,
    total_bruto DECIMAL(10,2) NOT NULL,
    descuentos DECIMAL(10,2) DEFAULT 0,
    total_neto DECIMAL(10,2) NOT NULL,
    estado ENUM('borrador', 'aprobada', 'pagada', 'cancelada') DEFAULT 'borrador',
    fecha_aprobacion DATE NULL,
    fecha_pago DATE NULL,
    metodo_pago ENUM('efectivo', 'transferencia', 'cheque', 'deposito') NULL,
    observaciones TEXT,
    usuario_aprobacion VARCHAR(100),
    usuario_pago VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- TABLA 2: DETALLE CIERRE DE CAJA (FALTA)
CREATE TABLE IF NOT EXISTS cierre_caja_detalle (
    id INT PRIMARY KEY AUTO_INCREMENT,
    caja_id INT NOT NULL,
    usuario_cierre_id INT NOT NULL,
    efectivo_sistema DECIMAL(10,2) DEFAULT 0,
    efectivo_contado DECIMAL(10,2) DEFAULT 0,
    diferencia_efectivo DECIMAL(10,2) DEFAULT 0,
    tarjetas_sistema DECIMAL(10,2) DEFAULT 0,
    tarjetas_contado DECIMAL(10,2) DEFAULT 0,
    diferencia_tarjetas DECIMAL(10,2) DEFAULT 0,
    transferencias_sistema DECIMAL(10,2) DEFAULT 0,
    transferencias_contado DECIMAL(10,2) DEFAULT 0,
    diferencia_transferencias DECIMAL(10,2) DEFAULT 0,
    otros_sistema DECIMAL(10,2) DEFAULT 0,
    otros_contado DECIMAL(10,2) DEFAULT 0,
    diferencia_otros DECIMAL(10,2) DEFAULT 0,
    diferencia_total DECIMAL(10,2) DEFAULT 0,
    observaciones TEXT,
    fecha_cierre TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- TABLA 3: LOG DE REAPERTURAS (OPCIONAL PARA AUDITORÍA)
CREATE TABLE IF NOT EXISTS log_reaperturas (
    id INT PRIMARY KEY AUTO_INCREMENT,
    caja_id INT NOT NULL,
    fecha_reapertura TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_id INT NOT NULL,
    usuario_nombre VARCHAR(100),
    motivo TEXT,
    datos_cierre_anterior TEXT
);