-- ====================================
-- SCRIPT PARA CREAR SISTEMA DE HONORARIOS MÉDICOS
-- Clínica 2 de Mayo
-- Fecha: 22 de Octubre 2025
-- ====================================

-- 1. CREAR TABLA CONFIGURACIÓN DE HONORARIOS MÉDICOS
-- Esta tabla define los porcentajes de distribución entre clínica y médico
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
    
    -- Claves foráneas
    CONSTRAINT fk_configuracion_honorarios_medico FOREIGN KEY (medico_id) REFERENCES medicos(id) ON DELETE CASCADE,
    CONSTRAINT fk_configuracion_honorarios_tarifa FOREIGN KEY (tarifa_id) REFERENCES tarifas(id) ON DELETE CASCADE,
    
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

-- 2. CREAR TABLA MOVIMIENTOS DE HONORARIOS MÉDICOS
-- Registra cada honorario generado por consultas/procedimientos
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
    
    -- Claves foráneas
    CONSTRAINT fk_honorarios_movimientos_medico FOREIGN KEY (medico_id) REFERENCES medicos(id) ON DELETE CASCADE,
    CONSTRAINT fk_honorarios_movimientos_paciente FOREIGN KEY (paciente_id) REFERENCES pacientes(id) ON DELETE SET NULL,
    CONSTRAINT fk_honorarios_movimientos_tarifa FOREIGN KEY (tarifa_id) REFERENCES tarifas(id) ON DELETE CASCADE,
    
    -- Índices
    INDEX idx_movimientos_medico_fecha (medico_id, fecha),
    INDEX idx_movimientos_estado_pago (estado_pago_medico),
    INDEX idx_movimientos_liquidacion (liquidacion_id),
    INDEX idx_movimientos_consulta (consulta_id),
    
    -- Restricciones
    CONSTRAINT chk_montos_positivos CHECK (monto_clinica >= 0 AND monto_medico >= 0),
    CONSTRAINT chk_total_coherente CHECK (ABS(tarifa_total - (monto_clinica + monto_medico)) < 0.01)
);

-- 3. CREAR TABLA LIQUIDACIONES DE MÉDICOS
-- Para generar liquidaciones periódicas de honorarios
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
    
    -- Claves foráneas
    CONSTRAINT fk_liquidaciones_medico FOREIGN KEY (medico_id) REFERENCES medicos(id) ON DELETE CASCADE,
    
    -- Índices
    INDEX idx_liquidaciones_medico_periodo (medico_id, periodo_desde, periodo_hasta),
    INDEX idx_liquidaciones_estado (estado),
    INDEX idx_liquidaciones_fechas (fecha_aprobacion, fecha_pago),
    
    -- Restricciones
    CONSTRAINT chk_liquidacion_periodo CHECK (periodo_hasta >= periodo_desde),
    CONSTRAINT chk_liquidacion_montos CHECK (total_bruto >= 0 AND total_neto >= 0 AND descuentos >= 0)
);

-- 4. AGREGAR CAMPO A TABLA EGRESOS PARA REFERENCIAR HONORARIOS
-- Esto permite rastrear los egresos relacionados con honorarios médicos
ALTER TABLE egresos 
ADD COLUMN IF NOT EXISTS honorario_movimiento_id INT NULL AFTER observaciones,
ADD CONSTRAINT fk_egresos_honorario_movimiento 
    FOREIGN KEY (honorario_movimiento_id) REFERENCES honorarios_medicos_movimientos(id) ON DELETE SET NULL;

-- 5. DATOS DE EJEMPLO - CONFIGURACIONES DE HONORARIOS
-- Estos son los datos de muestra que ya se crearon en desarrollo
INSERT INTO configuracion_honorarios_medicos 
(medico_id, especialidad, tipo_servicio, porcentaje_clinica, porcentaje_medico, vigencia_desde, observaciones) 
VALUES 
-- Luis Pérez García - Pediatría
(1, 'Pediatría', 'consulta', 37.50, 62.50, '2024-01-01', 'Configuración inicial para consultas de pediatría'),

-- Rister Bunner Melendez - Endocrinólogo
(2, 'Endocrinologo', 'consulta', 33.33, 66.67, '2024-01-01', 'Configuración para especialista en endocrinología'),

-- Ulises Serna Barboza - Cirugía (Consultas)
(3, 'Cirugia', 'consulta', 30.00, 70.00, '2024-01-01', 'Consultas de cirugía general'),

-- Ulises Serna Barboza - Cirugía (Procedimientos quirúrgicos)
(3, 'Cirugia', 'cirugia', 20.00, 80.00, '2024-01-01', 'Procedimientos quirúrgicos menores')

ON DUPLICATE KEY UPDATE
porcentaje_clinica = VALUES(porcentaje_clinica),
porcentaje_medico = VALUES(porcentaje_medico),
observaciones = VALUES(observaciones);

-- ====================================
-- RESUMEN DE TABLAS MODIFICADAS/CREADAS:
-- ====================================

-- TABLAS NUEVAS:
-- 1. configuracion_honorarios_medicos - Configuración de porcentajes por médico/servicio
-- 2. honorarios_medicos_movimientos - Registro de cada honorario generado
-- 3. liquidaciones_medicos - Liquidaciones periódicas para médicos

-- TABLAS MODIFICADAS:
-- 1. egresos - Agregado campo honorario_movimiento_id para rastrear egresos por honorarios

-- FUNCIONALIDADES IMPLEMENTADAS:
-- - Configuración de porcentajes de honorarios por médico y tipo de servicio
-- - Integración con sistema de tarifas existente (NO duplica precios)
-- - Cálculo automático de honorarios basado en tarifas y porcentajes configurados
-- - Registro de movimientos de honorarios por cada consulta/procedimiento
-- - Sistema de liquidaciones periódicas para médicos
-- - Integración con sistema de egresos de la clínica
-- - Control de vigencias para configuraciones de honorarios
-- - Soporte para montos fijos o porcentuales
-- - Diferentes tipos de precio (particular, seguro, convenio)

-- APIS CREADAS:
-- 1. api_honorarios_medicos_v2.php - Gestión de configuraciones de honorarios
-- 2. api_movimientos_honorarios.php - Registro y consulta de movimientos de honorarios

-- CONTROL DE ACCESO POR ROLES:
-- ADMINISTRADOR: *** ACCESO COMPLETO A TODO ***
--   ✅ Configurar porcentajes de honorarios por médico/servicio
--   ✅ Crear/editar/eliminar configuraciones de honorarios
--   ✅ Ver/gestionar todos los movimientos de honorarios
--   ✅ Actualizar estados de pago (marcar como pagado/pendiente)
--   ✅ Registrar pagos a médicos directamente
--   ✅ Generar liquidaciones periódicas
--   ✅ Aprobar pagos a médicos
--   ✅ Acceso a reportes completos y análisis
--
-- RECEPCIONISTA: *** GESTIÓN DE PAGOS ÚNICAMENTE ***
--   ✅ Consultar configuraciones de honorarios (solo lectura)
--   ✅ Ver movimientos de honorarios por médico/fecha
--   ✅ Actualizar estados de pago (marcar como pagado/pendiente)
--   ✅ Registrar pagos directos a médicos
--   ✅ Acceso a métodos de pago y fechas de pago
--   ❌ NO puede modificar configuraciones de porcentajes
--   ❌ NO puede crear/eliminar configuraciones de honorarios
--
-- MÉDICO: *** CONSULTA PERSONAL ***
--   ✅ Consultar sus propios movimientos de honorarios
--   ✅ Ver historial de pagos recibidos
--   ✅ Consultar configuraciones aplicables a sus servicios
--   ❌ NO puede ver información de otros médicos

-- INTEGRACIÓN CON SISTEMA EXISTENTE:
-- - Las tarifas se gestionan desde GestionTarifasPage.jsx (NO se duplican)
-- - Los honorarios solo configuran porcentajes de distribución
-- - Se mantiene la integridad referencial con medicos, pacientes, tarifas
-- - Compatible con el sistema de cobros existente