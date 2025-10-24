-- =========================================
-- SCRIPT PARA AGREGAR TABLAS FALTANTES
-- SISTEMA DE HONORARIOS MÉDICOS - HOSTINGER
-- =========================================

-- ⚠️  INSTRUCCIONES:
-- 1. Ejecuta cada CREATE TABLE por separado en phpMyAdmin
-- 2. Copia y pega una tabla a la vez
-- 3. Si una tabla ya existe, omítela y continúa con la siguiente

-- =========================================
-- TABLA 1: CONFIGURACIÓN DE HONORARIOS
-- =========================================
-- Ejecutar SOLO si no existe la tabla configuracion_honorarios_medicos

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
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- =========================================
-- TABLA 2: MOVIMIENTOS DE HONORARIOS
-- =========================================
-- Ejecutar SOLO si no existe la tabla honorarios_medicos_movimientos

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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =========================================
-- TABLA 3: LIQUIDACIONES DE MÉDICOS
-- =========================================
-- Ejecutar SOLO si no existe la tabla liquidaciones_medicos

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

-- =========================================
-- TABLA 4: EGRESOS (SI NO EXISTE)
-- =========================================
-- Ejecutar SOLO si no existe la tabla egresos

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
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- =========================================
-- VERIFICACIÓN DE TABLAS EXISTENTES
-- =========================================
-- Ejecuta estas consultas para verificar qué tablas YA EXISTEN:

-- SHOW TABLES LIKE 'configuracion_honorarios_medicos';
-- SHOW TABLES LIKE 'honorarios_medicos_movimientos';
-- SHOW TABLES LIKE 'liquidaciones_medicos';
-- SHOW TABLES LIKE 'egresos';

-- =========================================
-- RESUMEN DE TABLAS NECESARIAS:
-- =========================================

/*
🔍 VERIFICAR PRIMERO - Ejecuta en phpMyAdmin:
   SHOW TABLES LIKE '%honorarios%';
   SHOW TABLES LIKE 'egresos';

📋 TABLAS REQUERIDAS:
   ✅ configuracion_honorarios_medicos
   ✅ honorarios_medicos_movimientos  
   ✅ liquidaciones_medicos
   ✅ egresos

🚀 INSTRUCCIONES:
   1. Verifica qué tablas faltan
   2. Ejecuta solo las CREATE TABLE de las tablas faltantes
   3. Una tabla a la vez para evitar errores
   4. Si todas se crean correctamente, el error 500 debería desaparecer

⚠️  NOTA: 
   - Las tablas se crean SIN foreign keys para evitar errores
   - El sistema funcionará inmediatamente después de crear las tablas
   - Los foreign keys se pueden agregar después si es necesario
*/