-- ==============================================
-- MÓDULO DE CAJA E INGRESOS
-- Tablas para manejo de apertura/cierre de caja
-- y registro de ingresos diarios
-- ==============================================

-- Tabla principal de cajas (apertura/cierre diario)
CREATE TABLE IF NOT EXISTS cajas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    fecha DATE NOT NULL,
    usuario_id INT NOT NULL,
    estado ENUM('abierta', 'en_cierre', 'cerrada') DEFAULT 'abierta',
    
    -- Datos de apertura
    monto_apertura DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    hora_apertura TIME NOT NULL,
    observaciones_apertura TEXT,
    
    -- Datos de cierre
    monto_cierre DECIMAL(10,2) NULL,
    hora_cierre TIME NULL,
    observaciones_cierre TEXT,
    
    -- Totales del día
    total_efectivo DECIMAL(10,2) DEFAULT 0.00,
    total_tarjetas DECIMAL(10,2) DEFAULT 0.00,
    total_transferencias DECIMAL(10,2) DEFAULT 0.00,
    total_otros DECIMAL(10,2) DEFAULT 0.00,
    
    -- Control de diferencias
    diferencia DECIMAL(10,2) DEFAULT 0.00, -- positivo = sobrante, negativo = faltante
    
    -- Auditoría
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- Índices
    UNIQUE KEY unique_fecha_usuario (fecha, usuario_id),
    INDEX idx_fecha (fecha),
    INDEX idx_estado (estado),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

-- Tabla de ingresos diarios detallados
CREATE TABLE IF NOT EXISTS ingresos_diarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    caja_id INT NOT NULL,
    
    -- Tipo y área del ingreso
    tipo_ingreso ENUM('consulta', 'laboratorio', 'farmacia', 'ecografia', 'rayosx', 'procedimiento', 'otros') NOT NULL,
    area VARCHAR(100) NOT NULL, -- Ej: "Medicina General", "Cardiología", etc.
    
    -- Detalles del ingreso
    descripcion TEXT NOT NULL,
    monto DECIMAL(10,2) NOT NULL,
    metodo_pago ENUM('efectivo', 'tarjeta', 'transferencia', 'otros') NOT NULL,
    
    -- Referencias
    referencia_id INT NULL, -- ID de la consulta, orden de laboratorio, etc.
    referencia_tabla VARCHAR(50) NULL, -- Tabla de referencia
    
    -- Paciente (opcional, para reportes)
    paciente_id INT NULL,
    paciente_nombre VARCHAR(255) NULL,
    
    -- Auditoría
    fecha_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_id INT NOT NULL,
    
    -- Índices
    INDEX idx_caja_id (caja_id),
    INDEX idx_tipo_ingreso (tipo_ingreso),
    INDEX idx_fecha_hora (fecha_hora),
    INDEX idx_metodo_pago (metodo_pago),
    INDEX idx_paciente_id (paciente_id),
    
    FOREIGN KEY (caja_id) REFERENCES cajas(id) ON DELETE CASCADE,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
    FOREIGN KEY (paciente_id) REFERENCES pacientes(id)
);

-- Tabla de categorías de ingresos (configuración)
CREATE TABLE IF NOT EXISTS categorias_ingresos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE,
    tipo_ingreso ENUM('consulta', 'laboratorio', 'farmacia', 'ecografia', 'rayosx', 'procedimiento', 'otros') NOT NULL,
    descripcion TEXT,
    activo BOOLEAN DEFAULT TRUE,
    orden_visualizacion INT DEFAULT 0,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_tipo_ingreso (tipo_ingreso),
    INDEX idx_activo (activo)
);

-- Tabla de métodos de pago (configuración)
CREATE TABLE IF NOT EXISTS metodos_pago (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE,
    codigo VARCHAR(20) NOT NULL UNIQUE, -- efectivo, tarjeta, transferencia, etc.
    descripcion TEXT,
    requiere_referencia BOOLEAN DEFAULT FALSE, -- Si requiere número de operación
    activo BOOLEAN DEFAULT TRUE,
    orden_visualizacion INT DEFAULT 0,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_codigo (codigo),
    INDEX idx_activo (activo)
);

-- ==============================================
-- DATOS INICIALES
-- ==============================================

-- Insertar métodos de pago básicos
INSERT INTO metodos_pago (nombre, codigo, descripcion, requiere_referencia, orden_visualizacion) VALUES
('Efectivo', 'efectivo', 'Pago en efectivo', FALSE, 1),
('Tarjeta de Débito', 'tarjeta_debito', 'Pago con tarjeta de débito', TRUE, 2),
('Tarjeta de Crédito', 'tarjeta_credito', 'Pago con tarjeta de crédito', TRUE, 3),
('Transferencia Bancaria', 'transferencia', 'Transferencia bancaria', TRUE, 4),
('Yape', 'yape', 'Pago mediante Yape', TRUE, 5),
('Plin', 'plin', 'Pago mediante Plin', TRUE, 6),
('Otros', 'otros', 'Otros métodos de pago', FALSE, 7)
ON DUPLICATE KEY UPDATE 
    nombre = VALUES(nombre),
    descripcion = VALUES(descripcion);

-- Insertar categorías de ingresos básicas
INSERT INTO categorias_ingresos (nombre, tipo_ingreso, descripcion, orden_visualizacion) VALUES
-- CONSULTAS MÉDICAS
('Medicina General', 'consulta', 'Consultas de medicina general', 1),
('Cardiología', 'consulta', 'Consultas de cardiología', 2),
('Pediatría', 'consulta', 'Consultas de pediatría', 3),
('Ginecología', 'consulta', 'Consultas de ginecología', 4),
('Dermatología', 'consulta', 'Consultas de dermatología', 5),
('Traumatología', 'consulta', 'Consultas de traumatología', 6),

-- LABORATORIO
('Análisis Clínicos', 'laboratorio', 'Exámenes de laboratorio clínico', 7),
('Hemograma Completo', 'laboratorio', 'Exámenes de hemograma', 8),
('Bioquímica Sanguínea', 'laboratorio', 'Exámenes bioquímicos', 9),
('Orina Completa', 'laboratorio', 'Exámenes de orina', 10),
('Perfil Lipídico', 'laboratorio', 'Exámenes de colesterol y triglicéridos', 11),
('Glucosa', 'laboratorio', 'Exámenes de glucosa en sangre', 12),

-- FARMACIA
('Medicamentos', 'farmacia', 'Venta de medicamentos recetados', 13),
('Medicamentos de Venta Libre', 'farmacia', 'Venta de medicamentos sin receta', 14),
('Insumos Médicos', 'farmacia', 'Venta de insumos y material médico', 15),
('Productos de Higiene', 'farmacia', 'Productos de higiene y cuidado personal', 16),

-- ECOGRAFÍAS
('Ecografía Abdominal', 'ecografia', 'Ecografía del abdomen', 17),
('Ecografía Pélvica', 'ecografia', 'Ecografía pélvica ginecológica', 18),
('Ecografía Obstétrica', 'ecografia', 'Ecografía durante el embarazo', 19),
('Ecografía Renal', 'ecografia', 'Ecografía de riñones y vías urinarias', 20),
('Ecografía Tiroidea', 'ecografia', 'Ecografía de tiroides', 21),
('Ecografía Testicular', 'ecografia', 'Ecografía testicular', 22),

-- RAYOS X
('Radiografía de Tórax', 'rayosx', 'Radiografía del tórax', 23),
('Radiografía de Abdomen', 'rayosx', 'Radiografía abdominal', 24),
('Radiografía de Extremidades', 'rayosx', 'Radiografía de brazos y piernas', 25),
('Radiografía de Columna', 'rayosx', 'Radiografía de columna vertebral', 26),
('Radiografía de Cráneo', 'rayosx', 'Radiografía del cráneo', 27),

-- PROCEDIMIENTOS
('Curaciones', 'procedimiento', 'Procedimientos de curación y vendajes', 28),
('Inyectables', 'procedimiento', 'Aplicación de inyecciones', 29),
('Toma de Muestras', 'procedimiento', 'Toma de muestras para laboratorio', 30),
('Suturas', 'procedimiento', 'Procedimientos de sutura', 31),
('Retiro de Puntos', 'procedimiento', 'Retiro de suturas', 32),
('Nebulizaciones', 'procedimiento', 'Terapias respiratorias', 33),

-- OTROS SERVICIOS
('Certificados Médicos', 'otros', 'Emisión de certificados médicos', 34),
('Constancias Médicas', 'otros', 'Emisión de constancias médicas', 35),
('Servicios Especiales', 'otros', 'Otros servicios no clasificados', 36)
ON DUPLICATE KEY UPDATE 
    descripcion = VALUES(descripcion);

-- ==============================================
-- VISTAS ÚTILES PARA REPORTES
-- ==============================================

-- Vista resumen de caja actual
CREATE OR REPLACE VIEW vista_caja_actual AS
SELECT 
    c.id,
    c.fecha,
    c.estado,
    CONCAT(u.nombre, ' ', u.apellido) as responsable,
    c.monto_apertura,
    c.hora_apertura,
    c.total_efectivo,
    c.total_tarjetas,
    c.total_transferencias,
    c.total_otros,
    (c.total_efectivo + c.total_tarjetas + c.total_transferencias + c.total_otros) as total_dia,
    c.diferencia,
    c.monto_cierre,
    c.hora_cierre
FROM cajas c
JOIN usuarios u ON c.usuario_id = u.id
WHERE c.fecha = CURDATE() AND c.estado != 'cerrada'
ORDER BY c.created_at DESC
LIMIT 1;

-- Vista resumen de ingresos por área del día
CREATE OR REPLACE VIEW vista_ingresos_por_area_hoy AS
SELECT 
    i.tipo_ingreso,
    i.area,
    COUNT(*) as cantidad_transacciones,
    SUM(i.monto) as total_monto,
    SUM(CASE WHEN i.metodo_pago = 'efectivo' THEN i.monto ELSE 0 END) as total_efectivo,
    SUM(CASE WHEN i.metodo_pago IN ('tarjeta_debito', 'tarjeta_credito') THEN i.monto ELSE 0 END) as total_tarjetas,
    SUM(CASE WHEN i.metodo_pago IN ('transferencia', 'yape', 'plin') THEN i.monto ELSE 0 END) as total_transferencias
FROM ingresos_diarios i
JOIN cajas c ON i.caja_id = c.id
WHERE c.fecha = CURDATE()
GROUP BY i.tipo_ingreso, i.area
ORDER BY i.tipo_ingreso, total_monto DESC;

-- ==============================================
-- TRIGGERS PARA AUTOMATIZACIÓN
-- ==============================================

-- Trigger para actualizar totales en la tabla cajas cuando se inserta un ingreso
DELIMITER //
CREATE TRIGGER actualizar_totales_caja_insert
AFTER INSERT ON ingresos_diarios
FOR EACH ROW
BEGIN
    UPDATE cajas SET
        total_efectivo = total_efectivo + CASE WHEN NEW.metodo_pago = 'efectivo' THEN NEW.monto ELSE 0 END,
        total_tarjetas = total_tarjetas + CASE WHEN NEW.metodo_pago IN ('tarjeta_debito', 'tarjeta_credito') THEN NEW.monto ELSE 0 END,
        total_transferencias = total_transferencias + CASE WHEN NEW.metodo_pago IN ('transferencia', 'yape', 'plin') THEN NEW.monto ELSE 0 END,
        total_otros = total_otros + CASE WHEN NEW.metodo_pago = 'otros' THEN NEW.monto ELSE 0 END,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.caja_id;
END //

-- Trigger para actualizar totales cuando se actualiza un ingreso
CREATE TRIGGER actualizar_totales_caja_update
AFTER UPDATE ON ingresos_diarios
FOR EACH ROW
BEGIN
    -- Restar valores antiguos
    UPDATE cajas SET
        total_efectivo = total_efectivo - CASE WHEN OLD.metodo_pago = 'efectivo' THEN OLD.monto ELSE 0 END,
        total_tarjetas = total_tarjetas - CASE WHEN OLD.metodo_pago IN ('tarjeta_debito', 'tarjeta_credito') THEN OLD.monto ELSE 0 END,
        total_transferencias = total_transferencias - CASE WHEN OLD.metodo_pago IN ('transferencia', 'yape', 'plin') THEN OLD.monto ELSE 0 END,
        total_otros = total_otros - CASE WHEN OLD.metodo_pago = 'otros' THEN OLD.monto ELSE 0 END
    WHERE id = OLD.caja_id;
    
    -- Sumar valores nuevos
    UPDATE cajas SET
        total_efectivo = total_efectivo + CASE WHEN NEW.metodo_pago = 'efectivo' THEN NEW.monto ELSE 0 END,
        total_tarjetas = total_tarjetas + CASE WHEN NEW.metodo_pago IN ('tarjeta_debito', 'tarjeta_credito') THEN NEW.monto ELSE 0 END,
        total_transferencias = total_transferencias + CASE WHEN NEW.metodo_pago IN ('transferencia', 'yape', 'plin') THEN NEW.monto ELSE 0 END,
        total_otros = total_otros + CASE WHEN NEW.metodo_pago = 'otros' THEN NEW.monto ELSE 0 END,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.caja_id;
END //

-- Trigger para actualizar totales cuando se elimina un ingreso
CREATE TRIGGER actualizar_totales_caja_delete
AFTER DELETE ON ingresos_diarios
FOR EACH ROW
BEGIN
    UPDATE cajas SET
        total_efectivo = total_efectivo - CASE WHEN OLD.metodo_pago = 'efectivo' THEN OLD.monto ELSE 0 END,
        total_tarjetas = total_tarjetas - CASE WHEN OLD.metodo_pago IN ('tarjeta_debito', 'tarjeta_credito') THEN OLD.monto ELSE 0 END,
        total_transferencias = total_transferencias - CASE WHEN OLD.metodo_pago IN ('transferencia', 'yape', 'plin') THEN OLD.monto ELSE 0 END,
        total_otros = total_otros - CASE WHEN OLD.metodo_pago = 'otros' THEN OLD.monto ELSE 0 END,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = OLD.caja_id;
END //

DELIMITER ;

-- ==============================================
-- PROCEDIMIENTOS ALMACENADOS ÚTILES
-- ==============================================

DELIMITER //

-- Procedimiento para abrir caja
CREATE PROCEDURE abrir_caja(
    IN p_usuario_id INT,
    IN p_monto_apertura DECIMAL(10,2),
    IN p_observaciones TEXT
)
BEGIN
    DECLARE v_fecha_actual DATE DEFAULT CURDATE();
    DECLARE v_hora_actual TIME DEFAULT CURTIME();
    DECLARE v_caja_existente INT DEFAULT 0;
    
    -- Verificar si ya hay una caja abierta para este usuario hoy
    SELECT COUNT(*) INTO v_caja_existente 
    FROM cajas 
    WHERE fecha = v_fecha_actual AND usuario_id = p_usuario_id AND estado != 'cerrada';
    
    IF v_caja_existente > 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ya existe una caja abierta para este usuario en la fecha actual';
    ELSE
        INSERT INTO cajas (
            fecha, usuario_id, estado, monto_apertura, hora_apertura, observaciones_apertura
        ) VALUES (
            v_fecha_actual, p_usuario_id, 'abierta', p_monto_apertura, v_hora_actual, p_observaciones
        );
        
        SELECT LAST_INSERT_ID() as caja_id, 'Caja abierta exitosamente' as mensaje;
    END IF;
END //

-- Procedimiento para cerrar caja
CREATE PROCEDURE cerrar_caja(
    IN p_caja_id INT,
    IN p_monto_cierre DECIMAL(10,2),
    IN p_observaciones TEXT
)
BEGIN
    DECLARE v_total_sistema DECIMAL(10,2);
    DECLARE v_diferencia DECIMAL(10,2);
    
    -- Calcular total del sistema
    SELECT (total_efectivo + total_tarjetas + total_transferencias + total_otros) 
    INTO v_total_sistema
    FROM cajas 
    WHERE id = p_caja_id;
    
    -- Calcular diferencia (solo para efectivo)
    SELECT total_efectivo INTO v_diferencia FROM cajas WHERE id = p_caja_id;
    SET v_diferencia = p_monto_cierre - v_diferencia;
    
    -- Actualizar caja
    UPDATE cajas SET
        estado = 'cerrada',
        monto_cierre = p_monto_cierre,
        hora_cierre = CURTIME(),
        diferencia = v_diferencia,
        observaciones_cierre = p_observaciones,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_caja_id;
    
    SELECT 
        v_total_sistema as total_sistema,
        p_monto_cierre as monto_fisico,
        v_diferencia as diferencia,
        'Caja cerrada exitosamente' as mensaje;
END //

DELIMITER ;

-- ==============================================
-- COMENTARIOS FINALES
-- ==============================================

/*
ESTRUCTURA CREADA:

1. TABLAS PRINCIPALES:
   - cajas: Control de apertura/cierre diario
   - ingresos_diarios: Registro detallado de todos los ingresos
   - categorias_ingresos: Configuración de tipos de servicios
   - metodos_pago: Configuración de formas de pago

2. VISTAS:
   - vista_caja_actual: Estado actual de la caja
   - vista_ingresos_por_area_hoy: Resumen por área del día

3. TRIGGERS:
   - Actualización automática de totales en tabla cajas

4. PROCEDIMIENTOS:
   - abrir_caja(): Apertura controlada de caja
   - cerrar_caja(): Cierre con cálculo de diferencias

5. DATOS INICIALES:
   - Métodos de pago comunes en Perú
   - Categorías básicas por área médica

PRÓXIMO PASO: Crear APIs PHP para interactuar con estas tablas
*/