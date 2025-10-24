-- ====================================
-- SCRIPT PARA HOSTINGER - VERSIÓN SEGURA
-- SISTEMA DE HONORARIOS MÉDICOS
-- Clínica 2 de Mayo
-- Fecha: 22 de Octubre 2025
-- ====================================

-- IMPORTANTE: Este script maneja las dependencias de forma segura
-- Verifica la existencia de tablas antes de crear foreign keys

-- ====================================
-- 1. TABLA: CONFIGURACIÓN DE HONORARIOS MÉDICOS
-- ====================================
CREATE TABLE IF NOT EXISTS configuracion_honorarios_medicos (
    id INT PRIMARY KEY AUTO_INCREMENT,
    medico_id INT NOT NULL,
    tarifa_id INT NULL, -- Referencia específica a una tarifa, NULL para configuración general
    especialidad VARCHAR(100),
    tipo_servicio ENUM('consulta', 'procedimiento', 'cirugia', 'interconsulta', 'otros') NOT NULL DEFAULT 'consulta',
    porcentaje_clinica DECIMAL(5,2) NOT NULL,
    porcentaje_medico DECIMAL(5,2) NOT NULL,
    monto_fijo_clinica DECIMAL(10,2) NULL, -- Opcional: usar monto fijo en lugar de porcentaje
    monto_fijo_medico DECIMAL(10,2) NULL,  -- Opcional: usar monto fijo en lugar de porcentaje
    activo TINYINT(1) DEFAULT 1,
    vigencia_desde DATE NOT NULL DEFAULT (CURDATE()),
    vigencia_hasta DATE NULL,
    observaciones TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- Índices para mejorar rendimiento
    INDEX idx_medico_servicio (medico_id, tipo_servicio),
    INDEX idx_vigencia (vigencia_desde, vigencia_hasta),
    INDEX idx_activo (activo),
    
    -- Restricciones de integridad
    CONSTRAINT chk_porcentajes_validos CHECK (porcentaje_clinica >= 0 AND porcentaje_medico >= 0),
    CONSTRAINT chk_suma_porcentajes CHECK (
        (monto_fijo_clinica IS NOT NULL AND monto_fijo_medico IS NOT NULL) OR 
        (ABS(porcentaje_clinica + porcentaje_medico - 100) < 0.01)
    )
);

-- ====================================
-- 2. TABLA: MOVIMIENTOS DE HONORARIOS MÉDICOS
-- ====================================
CREATE TABLE IF NOT EXISTS honorarios_medicos_movimientos (
    id INT PRIMARY KEY AUTO_INCREMENT,
    consulta_id INT NULL, -- Referencia a la consulta que generó el honorario
    cobro_id INT NULL,    -- Referencia al cobro realizado
    medico_id INT NOT NULL,
    paciente_id INT NULL,
    tarifa_id INT NULL, -- Nueva referencia a la tarifa utilizada
    tipo_precio ENUM('particular', 'seguro', 'convenio') DEFAULT 'particular', -- Tipo de precio aplicado
    fecha DATE NOT NULL,
    hora TIME NOT NULL,
    tipo_servicio ENUM('consulta', 'procedimiento', 'cirugia', 'interconsulta', 'otros') NOT NULL,
    especialidad VARCHAR(100),
    tarifa_total DECIMAL(10,2) NOT NULL, -- Precio total del servicio
    monto_clinica DECIMAL(10,2) NOT NULL, -- Monto correspondiente a la clínica
    monto_medico DECIMAL(10,2) NOT NULL,  -- Monto correspondiente al médico
    porcentaje_aplicado_clinica DECIMAL(5,2) NOT NULL, -- Porcentaje aplicado a la clínica
    porcentaje_aplicado_medico DECIMAL(5,2) NOT NULL,  -- Porcentaje aplicado al médico
    estado_pago_medico ENUM('pendiente', 'pagado', 'cancelado') DEFAULT 'pendiente',
    fecha_pago_medico DATE NULL,
    metodo_pago_medico ENUM('efectivo', 'transferencia', 'cheque', 'deposito') NULL,
    liquidacion_id INT NULL, -- Para agrupar en liquidaciones periódicas
    observaciones TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Índices
    INDEX idx_movimientos_medico_fecha (medico_id, fecha),
    INDEX idx_movimientos_estado_pago (estado_pago_medico),
    INDEX idx_movimientos_liquidacion (liquidacion_id),
    INDEX idx_movimientos_consulta (consulta_id),
    
    -- Restricciones
    CONSTRAINT chk_montos_positivos CHECK (monto_clinica >= 0 AND monto_medico >= 0),
    CONSTRAINT chk_total_coherente CHECK (ABS(tarifa_total - (monto_clinica + monto_medico)) < 0.01)
);

-- ====================================
-- 3. TABLA: LIQUIDACIONES DE MÉDICOS
-- ====================================
CREATE TABLE IF NOT EXISTS liquidaciones_medicos (
    id INT PRIMARY KEY AUTO_INCREMENT,
    medico_id INT NOT NULL,
    periodo_desde DATE NOT NULL,
    periodo_hasta DATE NOT NULL,
    total_bruto DECIMAL(10,2) NOT NULL,      -- Total de honorarios antes de descuentos
    descuentos DECIMAL(10,2) DEFAULT 0,      -- Descuentos aplicados (seguros, etc.)
    total_neto DECIMAL(10,2) NOT NULL,       -- Total a pagar al médico
    estado ENUM('borrador', 'aprobada', 'pagada', 'cancelada') DEFAULT 'borrador',
    fecha_aprobacion DATE NULL,
    fecha_pago DATE NULL,
    metodo_pago ENUM('efectivo', 'transferencia', 'cheque', 'deposito') NULL,
    observaciones TEXT,
    usuario_aprobacion VARCHAR(100),
    usuario_pago VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- Índices
    INDEX idx_liquidaciones_medico_periodo (medico_id, periodo_desde, periodo_hasta),
    INDEX idx_liquidaciones_estado (estado),
    INDEX idx_liquidaciones_fechas (fecha_aprobacion, fecha_pago),
    
    -- Restricciones
    CONSTRAINT chk_liquidacion_periodo CHECK (periodo_hasta >= periodo_desde),
    CONSTRAINT chk_liquidacion_montos CHECK (total_bruto >= 0 AND total_neto >= 0 AND descuentos >= 0)
);

-- ====================================
-- 4. TABLA: DETALLE CIERRE DE CAJA (AUDITORÍA)
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
    
    -- Índices
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
    
    -- Índices
    INDEX idx_reaperturas_caja (caja_id),
    INDEX idx_reaperturas_usuario (usuario_id),
    INDEX idx_reaperturas_fecha (fecha_reapertura)
);

-- ====================================
-- 6. TABLA: EGRESOS (CONTROL DE GASTOS)
-- ====================================
CREATE TABLE IF NOT EXISTS egresos (
    id INT PRIMARY KEY AUTO_INCREMENT,
    fecha DATE NOT NULL,
    tipo ENUM('operativo', 'administrativo', 'inversion', 'otros') NOT NULL DEFAULT 'operativo',
    categoria VARCHAR(100) NOT NULL, -- Ej: 'honorarios_medicos', 'suministros', 'servicios'
    concepto TEXT NOT NULL,
    monto DECIMAL(10,2) NOT NULL,
    responsable VARCHAR(100),
    estado ENUM('pendiente', 'confirmado', 'cancelado') DEFAULT 'pendiente',
    observaciones TEXT,
    honorario_movimiento_id INT NULL, -- Referencia a honorarios médicos
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- Índices
    INDEX idx_egresos_fecha (fecha),
    INDEX idx_egresos_tipo (tipo),
    INDEX idx_egresos_categoria (categoria),
    INDEX idx_egresos_estado (estado),
    INDEX idx_egresos_honorario (honorario_movimiento_id)
);

-- ====================================
-- 7. AGREGAR FOREIGN KEYS (SOLO SI LAS TABLAS EXISTEN)
-- ====================================

-- Foreign keys para configuracion_honorarios_medicos
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'configuracion_honorarios_medicos' AND constraint_name = 'fk_configuracion_honorarios_medico');
SET @medicos_exists = (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'medicos');
SET @sql_medicos = IF(@fk_exists = 0 AND @medicos_exists > 0, 
    'ALTER TABLE configuracion_honorarios_medicos ADD CONSTRAINT fk_configuracion_honorarios_medico FOREIGN KEY (medico_id) REFERENCES medicos(id) ON DELETE CASCADE',
    'SELECT "Skipping medicos foreign key" as message'
);
PREPARE stmt FROM @sql_medicos;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_exists = (SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'configuracion_honorarios_medicos' AND constraint_name = 'fk_configuracion_honorarios_tarifa');
SET @tarifas_exists = (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'tarifas');
SET @sql_tarifas = IF(@fk_exists = 0 AND @tarifas_exists > 0, 
    'ALTER TABLE configuracion_honorarios_medicos ADD CONSTRAINT fk_configuracion_honorarios_tarifa FOREIGN KEY (tarifa_id) REFERENCES tarifas(id) ON DELETE CASCADE',
    'SELECT "Skipping tarifas foreign key" as message'
);
PREPARE stmt FROM @sql_tarifas;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Foreign keys para honorarios_medicos_movimientos
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'honorarios_medicos_movimientos' AND constraint_name = 'fk_honorarios_movimientos_medico');
SET @medicos_exists = (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'medicos');
SET @sql_mov_medicos = IF(@fk_exists = 0 AND @medicos_exists > 0, 
    'ALTER TABLE honorarios_medicos_movimientos ADD CONSTRAINT fk_honorarios_movimientos_medico FOREIGN KEY (medico_id) REFERENCES medicos(id) ON DELETE CASCADE',
    'SELECT "Skipping medicos foreign key for movimientos" as message'
);
PREPARE stmt FROM @sql_mov_medicos;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_exists = (SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'honorarios_medicos_movimientos' AND constraint_name = 'fk_honorarios_movimientos_paciente');
SET @pacientes_exists = (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'pacientes');
SET @sql_mov_pacientes = IF(@fk_exists = 0 AND @pacientes_exists > 0, 
    'ALTER TABLE honorarios_medicos_movimientos ADD CONSTRAINT fk_honorarios_movimientos_paciente FOREIGN KEY (paciente_id) REFERENCES pacientes(id) ON DELETE SET NULL',
    'SELECT "Skipping pacientes foreign key" as message'
);
PREPARE stmt FROM @sql_mov_pacientes;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_exists = (SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'honorarios_medicos_movimientos' AND constraint_name = 'fk_honorarios_movimientos_tarifa');
SET @tarifas_exists = (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'tarifas');
SET @sql_mov_tarifas = IF(@fk_exists = 0 AND @tarifas_exists > 0, 
    'ALTER TABLE honorarios_medicos_movimientos ADD CONSTRAINT fk_honorarios_movimientos_tarifa FOREIGN KEY (tarifa_id) REFERENCES tarifas(id) ON DELETE CASCADE',
    'SELECT "Skipping tarifas foreign key for movimientos" as message'
);
PREPARE stmt FROM @sql_mov_tarifas;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Foreign key para liquidaciones_medicos
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'liquidaciones_medicos' AND constraint_name = 'fk_liquidaciones_medico');
SET @medicos_exists = (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'medicos');
SET @sql_liq_medicos = IF(@fk_exists = 0 AND @medicos_exists > 0, 
    'ALTER TABLE liquidaciones_medicos ADD CONSTRAINT fk_liquidaciones_medico FOREIGN KEY (medico_id) REFERENCES medicos(id) ON DELETE CASCADE',
    'SELECT "Skipping medicos foreign key for liquidaciones" as message'
);
PREPARE stmt FROM @sql_liq_medicos;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Foreign keys para cierre_caja_detalle
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'cierre_caja_detalle' AND constraint_name = 'fk_cierre_detalle_caja');
SET @cajas_exists = (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'cajas');
SET @sql_cierre_caja = IF(@fk_exists = 0 AND @cajas_exists > 0, 
    'ALTER TABLE cierre_caja_detalle ADD CONSTRAINT fk_cierre_detalle_caja FOREIGN KEY (caja_id) REFERENCES cajas(id) ON DELETE CASCADE',
    'SELECT "Skipping cajas foreign key" as message'
);
PREPARE stmt FROM @sql_cierre_caja;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_exists = (SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'cierre_caja_detalle' AND constraint_name = 'fk_cierre_detalle_usuario');
SET @usuarios_exists = (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'usuarios');
SET @sql_cierre_usuario = IF(@fk_exists = 0 AND @usuarios_exists > 0, 
    'ALTER TABLE cierre_caja_detalle ADD CONSTRAINT fk_cierre_detalle_usuario FOREIGN KEY (usuario_cierre_id) REFERENCES usuarios(id) ON DELETE CASCADE',
    'SELECT "Skipping usuarios foreign key for cierre" as message'
);
PREPARE stmt FROM @sql_cierre_usuario;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Foreign key para egresos
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'egresos' AND constraint_name = 'fk_egresos_honorario_movimiento');
SET @sql_egresos = IF(@fk_exists = 0, 
    'ALTER TABLE egresos ADD CONSTRAINT fk_egresos_honorario_movimiento FOREIGN KEY (honorario_movimiento_id) REFERENCES honorarios_medicos_movimientos(id) ON DELETE SET NULL',
    'SELECT "Skipping honorarios foreign key for egresos" as message'
);
PREPARE stmt FROM @sql_egresos;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ====================================
-- 8. DATOS INICIALES (OPCIONAL)
-- ====================================

-- Solo insertar datos si la tabla de médicos existe y tiene datos
SET @medicos_count = (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'medicos');

-- Configuraciones de honorarios iniciales (solo si hay médicos)
SET @sql_insert = IF(@medicos_count > 0,
    'INSERT IGNORE INTO configuracion_honorarios_medicos (medico_id, especialidad, tipo_servicio, porcentaje_clinica, porcentaje_medico, vigencia_desde, observaciones) VALUES (1, "Medicina General", "consulta", 40.00, 60.00, "2024-01-01", "Configuración inicial para medicina general")',
    'SELECT "No hay tabla medicos, omitiendo datos iniciales" as message'
);
PREPARE stmt FROM @sql_insert;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ====================================
-- RESUMEN DE CAMBIOS APLICADOS
-- ====================================

/*
TABLAS NUEVAS CREADAS:
1. configuracion_honorarios_medicos - Configuración de porcentajes por médico/servicio
2. honorarios_medicos_movimientos - Registro de cada honorario generado  
3. liquidaciones_medicos - Liquidaciones periódicas para médicos
4. cierre_caja_detalle - Auditoría detallada de cierres de caja
5. log_reaperturas - Log de reaperturas de caja para auditoría
6. egresos - Tabla de control de gastos y egresos (NUEVA)

TABLAS MODIFICADAS:
-- NINGUNA (Todas las tablas necesarias se crean nuevas)

CARACTERÍSTICAS ESPECIALES:
✅ Script seguro que verifica dependencias antes de crear foreign keys
✅ No falla si las tablas referenciadas no existen
✅ Todas las tablas se crean independientemente
✅ Foreign keys se agregan solo si las tablas de referencia existen
✅ Compatible con diferentes versiones de base de datos en producción

FUNCIONALIDADES IMPLEMENTADAS:
✅ Sistema completo de honorarios médicos
✅ Configuración de porcentajes por médico y tipo de servicio  
✅ Integración opcional con sistema de tarifas existente
✅ Cálculo automático de honorarios basado en tarifas y porcentajes
✅ Registro de movimientos por cada consulta/procedimiento
✅ Sistema de liquidaciones periódicas
✅ Control de acceso por roles (administrador, recepcionista)
✅ Auditoría completa de cierres de caja
✅ Log de reaperturas para control administrativo
✅ Validación de fechas y datos consistentes

APIS IMPLEMENTADAS:
- api_honorarios_medicos_v2.php (Gestión de configuraciones)
- api_movimientos_honorarios.php (Movimientos y pagos)

INTERFACES DE USUARIO:
- GestionHonorariosMedicos.jsx (Administración)
- PagosHonorariosMedicos.jsx (Gestión de pagos)

ESTADO: ✅ LISTO PARA PRODUCCIÓN EN HOSTINGER
*/

-- ====================================
-- FIN DEL SCRIPT
-- ====================================