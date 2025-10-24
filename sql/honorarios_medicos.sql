-- =====================================================
-- SISTEMA DE HONORARIOS MÉDICOS
-- Script para crear las tablas necesarias
-- =====================================================

-- Tabla de configuración de honorarios por médico
CREATE TABLE IF NOT EXISTS configuracion_honorarios_medicos (
    id INT PRIMARY KEY AUTO_INCREMENT,
    medico_id INT NOT NULL,
    especialidad VARCHAR(100) NULL COMMENT 'Especialidad específica o NULL para general',
    tipo_servicio ENUM('consulta', 'procedimiento', 'cirugia', 'interconsulta', 'otros') NOT NULL DEFAULT 'consulta',
    tarifa_total DECIMAL(10,2) NOT NULL COMMENT 'Tarifa total que paga el paciente',
    porcentaje_clinica DECIMAL(5,2) NOT NULL COMMENT 'Porcentaje que retiene la clínica',
    porcentaje_medico DECIMAL(5,2) NOT NULL COMMENT 'Porcentaje que recibe el médico',
    monto_fijo_clinica DECIMAL(10,2) NULL COMMENT 'Alternativa: monto fijo para clínica',
    monto_fijo_medico DECIMAL(10,2) NULL COMMENT 'Alternativa: monto fijo para médico',
    activo BOOLEAN DEFAULT TRUE,
    vigencia_desde DATE NOT NULL DEFAULT (CURDATE()),
    vigencia_hasta DATE NULL COMMENT 'NULL = vigencia indefinida',
    observaciones TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (medico_id) REFERENCES medicos(id) ON DELETE CASCADE,
    INDEX idx_medico_activo (medico_id, activo),
    INDEX idx_vigencia (vigencia_desde, vigencia_hasta),
    CONSTRAINT chk_porcentajes CHECK (porcentaje_clinica + porcentaje_medico = 100),
    CONSTRAINT chk_montos_o_porcentajes CHECK (
        (monto_fijo_clinica IS NULL AND monto_fijo_medico IS NULL) OR 
        (porcentaje_clinica IS NOT NULL AND porcentaje_medico IS NOT NULL)
    )
);

-- Tabla de movimientos de honorarios (registro detallado)
CREATE TABLE IF NOT EXISTS honorarios_medicos_movimientos (
    id INT PRIMARY KEY AUTO_INCREMENT,
    consulta_id INT NULL COMMENT 'Referencia a la consulta si aplica',
    cobro_id INT NULL COMMENT 'Referencia al cobro/venta',
    medico_id INT NOT NULL,
    paciente_id INT NULL,
    fecha DATE NOT NULL,
    hora TIME NOT NULL,
    tipo_servicio ENUM('consulta', 'procedimiento', 'cirugia', 'interconsulta', 'otros') NOT NULL,
    especialidad VARCHAR(100) NULL,
    tarifa_total DECIMAL(10,2) NOT NULL,
    monto_clinica DECIMAL(10,2) NOT NULL COMMENT 'Monto que queda para la clínica',
    monto_medico DECIMAL(10,2) NOT NULL COMMENT 'Monto que se debe al médico',
    porcentaje_aplicado_clinica DECIMAL(5,2) NOT NULL,
    porcentaje_aplicado_medico DECIMAL(5,2) NOT NULL,
    estado_pago_medico ENUM('pendiente', 'pagado', 'cancelado') DEFAULT 'pendiente',
    fecha_pago_medico DATE NULL,
    metodo_pago_medico ENUM('efectivo', 'transferencia', 'cheque', 'deposito') NULL,
    liquidacion_id INT NULL COMMENT 'ID de la liquidación cuando se procese',
    observaciones TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (medico_id) REFERENCES medicos(id) ON DELETE CASCADE,
    FOREIGN KEY (paciente_id) REFERENCES pacientes(id) ON DELETE SET NULL,
    INDEX idx_medico_fecha (medico_id, fecha),
    INDEX idx_estado_pago (estado_pago_medico),
    INDEX idx_liquidacion (liquidacion_id)
);

-- Tabla de liquidaciones periódicas
CREATE TABLE IF NOT EXISTS liquidaciones_medicos (
    id INT PRIMARY KEY AUTO_INCREMENT,
    medico_id INT NOT NULL,
    periodo_tipo ENUM('semanal', 'quincenal', 'mensual') NOT NULL DEFAULT 'mensual',
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE NOT NULL,
    total_consultas INT NOT NULL DEFAULT 0,
    total_ingresos_brutos DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT 'Total facturado',
    total_honorarios_medico DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT 'Total a pagar al médico',
    total_retencion_clinica DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT 'Total que retiene clínica',
    estado ENUM('borrador', 'generada', 'pagada', 'cancelada') DEFAULT 'borrador',
    fecha_generacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_pago DATE NULL,
    metodo_pago ENUM('efectivo', 'transferencia', 'cheque', 'deposito') NULL,
    referencia_pago VARCHAR(100) NULL COMMENT 'Número de transferencia, cheque, etc.',
    observaciones TEXT,
    created_by INT NOT NULL COMMENT 'Usuario que creó la liquidación',
    paid_by INT NULL COMMENT 'Usuario que procesó el pago',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (medico_id) REFERENCES medicos(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES usuarios(id),
    FOREIGN KEY (paid_by) REFERENCES usuarios(id),
    INDEX idx_medico_periodo (medico_id, fecha_inicio, fecha_fin),
    INDEX idx_estado (estado),
    INDEX idx_fecha_pago (fecha_pago)
);

-- Agregar columnas a la tabla de egresos existente para integración
ALTER TABLE egresos 
ADD COLUMN medico_id INT NULL COMMENT 'ID del médico si es pago de honorarios',
ADD COLUMN liquidacion_id INT NULL COMMENT 'ID de liquidación si aplica',
ADD FOREIGN KEY (medico_id) REFERENCES medicos(id) ON DELETE SET NULL;

-- Agregar índices para mejor rendimiento
CREATE INDEX idx_egresos_medico ON egresos(medico_id);
CREATE INDEX idx_egresos_liquidacion ON egresos(liquidacion_id);

-- =====================================================
-- DATOS DE EJEMPLO (OPCIONAL)
-- =====================================================

-- Insertar configuraciones de ejemplo (ajustar medico_id según tu BD)
/*
INSERT INTO configuracion_honorarios_medicos 
(medico_id, especialidad, tipo_servicio, tarifa_total, porcentaje_clinica, porcentaje_medico, observaciones) 
VALUES 
(1, 'Cardiología', 'consulta', 120.00, 33.33, 66.67, 'Cardiólogo especialista'),
(2, 'Pediatría', 'consulta', 80.00, 37.50, 62.50, 'Pediatra general'),
(3, 'Cirugía General', 'consulta', 100.00, 30.00, 70.00, 'Cirujano general'),
(3, 'Cirugía General', 'cirugia', 500.00, 20.00, 80.00, 'Cirugías menores');
*/

-- =====================================================
-- VISTAS ÚTILES PARA REPORTES
-- =====================================================

-- Vista de honorarios pendientes por médico
CREATE OR REPLACE VIEW vista_honorarios_pendientes AS
SELECT 
    h.medico_id,
    CONCAT(m.nombre, ' ', m.apellido) as medico_nombre,
    m.especialidad,
    COUNT(*) as consultas_pendientes,
    SUM(h.monto_medico) as total_pendiente,
    MIN(h.fecha) as fecha_mas_antigua,
    MAX(h.fecha) as fecha_mas_reciente
FROM honorarios_medicos_movimientos h
INNER JOIN medicos m ON h.medico_id = m.id
WHERE h.estado_pago_medico = 'pendiente'
GROUP BY h.medico_id, m.nombre, m.apellido, m.especialidad;

-- Vista de resumen de liquidaciones
CREATE OR REPLACE VIEW vista_resumen_liquidaciones AS
SELECT 
    l.id,
    l.medico_id,
    CONCAT(m.nombre, ' ', m.apellido) as medico_nombre,
    l.periodo_tipo,
    l.fecha_inicio,
    l.fecha_fin,
    l.total_consultas,
    l.total_honorarios_medico,
    l.estado,
    l.fecha_pago,
    DATEDIFF(CURDATE(), l.fecha_fin) as dias_vencimiento
FROM liquidaciones_medicos l
INNER JOIN medicos m ON l.medico_id = m.id
ORDER BY l.fecha_fin DESC;