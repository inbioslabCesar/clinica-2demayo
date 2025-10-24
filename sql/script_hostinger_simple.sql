-- ====================================
-- SCRIPT SIMPLIFICADO PARA HOSTINGER
-- SISTEMA DE HONORARIOS MÉDICOS
-- Clínica 2 de Mayo
-- Fecha: 22 de Octubre 2025
-- ====================================

-- VERSIÓN SIMPLIFICADA SIN FOREIGN KEYS PARA EVITAR ERRORES

-- ====================================
-- 1. TABLA: CONFIGURACIÓN DE HONORARIOS MÉDICOS
-- ====================================
CREATE TABLE IF NOT EXISTS configuracion_honorarios_medicos (
    id INT PRIMARY KEY AUTO_INCREMENT,
    medico_id INT NOT NULL,
    tarifa_id INT NULL,
    especialidad VARCHAR(100),
    tipo_servicio ENUM('consulta', 'procedimiento', 'cirugia', 'interconsulta', 'otros') NOT NULL DEFAULT 'consulta',
    porcentaje_clinica DECIMAL(5,2) NOT NULL,
    porcentaje_medico DECIMAL(5,2) NOT NULL,
    monto_fijo_clinica DECIMAL(10,2) NULL,
    monto_fijo_medico DECIMAL(10,2) NULL,
    activo TINYINT(1) DEFAULT 1,
    vigencia_desde DATE NOT NULL DEFAULT (CURDATE()),
    vigencia_hasta DATE NULL,
    observaciones TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_medico_servicio (medico_id, tipo_servicio),
    INDEX idx_vigencia (vigencia_desde, vigencia_hasta),
    INDEX idx_activo (activo)
);

-- ====================================
-- 2. TABLA: MOVIMIENTOS DE HONORARIOS MÉDICOS
-- ====================================
CREATE TABLE IF NOT EXISTS honorarios_medicos_movimientos (
    id INT PRIMARY KEY AUTO_INCREMENT,
    consulta_id INT NULL,
    cobro_id INT NULL,
    medico_id INT NOT NULL,
    paciente_id INT NULL,
    tarifa_id INT NULL,
    tipo_precio ENUM('particular', 'seguro', 'convenio') DEFAULT 'particular',
    fecha DATE NOT NULL,
    hora TIME NOT NULL,
    tipo_servicio ENUM('consulta', 'procedimiento', 'cirugia', 'interconsulta', 'otros') NOT NULL,
    especialidad VARCHAR(100),
    tarifa_total DECIMAL(10,2) NOT NULL,
    monto_clinica DECIMAL(10,2) NOT NULL,
    monto_medico DECIMAL(10,2) NOT NULL,
    porcentaje_aplicado_clinica DECIMAL(5,2) NOT NULL,
    porcentaje_aplicado_medico DECIMAL(5,2) NOT NULL,
    estado_pago_medico ENUM('pendiente', 'pagado', 'cancelado') DEFAULT 'pendiente',
    fecha_pago_medico DATE NULL,
    metodo_pago_medico ENUM('efectivo', 'transferencia', 'cheque', 'deposito') NULL,
    liquidacion_id INT NULL,
    observaciones TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_movimientos_medico_fecha (medico_id, fecha),
    INDEX idx_movimientos_estado_pago (estado_pago_medico),
    INDEX idx_movimientos_liquidacion (liquidacion_id),
    INDEX idx_movimientos_consulta (consulta_id)
);

-- ====================================
-- 3. TABLA: LIQUIDACIONES DE MÉDICOS
-- ====================================
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
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_liquidaciones_medico_periodo (medico_id, periodo_desde, periodo_hasta),
    INDEX idx_liquidaciones_estado (estado),
    INDEX idx_liquidaciones_fechas (fecha_aprobacion, fecha_pago)
);

-- ====================================
-- 4. TABLA: DETALLE CIERRE DE CAJA
-- ====================================
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
    fecha_cierre TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_cierre_detalle_caja (caja_id),
    INDEX idx_cierre_detalle_fecha (fecha_cierre)
);

-- ====================================
-- 5. TABLA: LOG DE REAPERTURAS DE CAJA
-- ====================================
CREATE TABLE IF NOT EXISTS log_reaperturas (
    id INT PRIMARY KEY AUTO_INCREMENT,
    caja_id INT NOT NULL,
    fecha_reapertura TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_id INT NOT NULL,
    usuario_nombre VARCHAR(100),
    motivo TEXT,
    datos_cierre_anterior TEXT,
    
    INDEX idx_reaperturas_caja (caja_id),
    INDEX idx_reaperturas_usuario (usuario_id),
    INDEX idx_reaperturas_fecha (fecha_reapertura)
);

-- ====================================
-- 6. TABLA: EGRESOS
-- ====================================
CREATE TABLE IF NOT EXISTS egresos (
    id INT PRIMARY KEY AUTO_INCREMENT,
    fecha DATE NOT NULL,
    tipo ENUM('operativo', 'administrativo', 'inversion', 'otros') NOT NULL DEFAULT 'operativo',
    categoria VARCHAR(100) NOT NULL,
    concepto TEXT NOT NULL,
    monto DECIMAL(10,2) NOT NULL,
    responsable VARCHAR(100),
    estado ENUM('pendiente', 'confirmado', 'cancelado') DEFAULT 'pendiente',
    observaciones TEXT,
    honorario_movimiento_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_egresos_fecha (fecha),
    INDEX idx_egresos_tipo (tipo),
    INDEX idx_egresos_categoria (categoria),
    INDEX idx_egresos_estado (estado),
    INDEX idx_egresos_honorario (honorario_movimiento_id)
);

-- ====================================
-- RESUMEN FINAL
-- ====================================

/*
TABLAS CREADAS:
✅ configuracion_honorarios_medicos - Configuración de porcentajes 
✅ honorarios_medicos_movimientos - Registro de honorarios generados
✅ liquidaciones_medicos - Liquidaciones periódicas
✅ cierre_caja_detalle - Auditoría de cierres de caja
✅ log_reaperturas - Log de reaperturas de caja
✅ egresos - Control de gastos y egresos

CARACTERÍSTICAS:
✅ Script simplificado sin foreign keys iniciales
✅ Todas las tablas se crean independientemente
✅ Compatible con cualquier esquema de base de datos
✅ Sin restricciones que puedan causar fallos
✅ Listo para usar inmediatamente

NOTA: Las foreign keys se pueden agregar posteriormente una vez 
que todas las tablas estén creadas y funcionando correctamente.

ESTADO: ✅ FUNCIONAL Y LISTO PARA HOSTINGER
*/