-- Script para crear las tablas del sistema de cobros
-- Ejecutar después de tener las tablas básicas del sistema

-- Tabla de tarifas (sin laboratorio ni farmacia ya que tienen sus propias tablas)
CREATE TABLE IF NOT EXISTS tarifas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    servicio_tipo ENUM('consulta','rayosx','ecografia','ocupacional','procedimientos','cirugias','tratamientos','emergencias') NOT NULL,
    servicio_id INT DEFAULT NULL, -- NULL para servicios generales, o ID específico del examen/medicamento
    descripcion VARCHAR(255) NOT NULL,
    precio_particular DECIMAL(10,2) NOT NULL,
    precio_seguro DECIMAL(10,2) DEFAULT NULL,
    precio_convenio DECIMAL(10,2) DEFAULT NULL,
    activo TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP
);

-- Tabla principal de cobros
CREATE TABLE IF NOT EXISTS cobros (
    id INT AUTO_INCREMENT PRIMARY KEY,
    paciente_id INT NOT NULL,
    usuario_id INT NOT NULL, -- recepcionista que cobra
    fecha_cobro DATETIME DEFAULT CURRENT_TIMESTAMP,
    total DECIMAL(10,2) NOT NULL,
    tipo_pago ENUM('efectivo','tarjeta','transferencia','seguro') NOT NULL,
    estado ENUM('pendiente','pagado','anulado','devolucion') DEFAULT 'pendiente',
    observaciones TEXT,
    FOREIGN KEY (paciente_id) REFERENCES pacientes(id) ON DELETE CASCADE,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

-- Tabla de detalle de cobros
CREATE TABLE IF NOT EXISTS cobros_detalle (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cobro_id INT NOT NULL,
    servicio_tipo VARCHAR(50) NOT NULL,
    servicio_id INT DEFAULT NULL,
    descripcion VARCHAR(255) NOT NULL,
    cantidad INT DEFAULT 1,
    precio_unitario DECIMAL(10,2) NOT NULL,
    subtotal DECIMAL(10,2) NOT NULL,
    FOREIGN KEY (cobro_id) REFERENCES cobros(id) ON DELETE CASCADE
);

-- Modificar tabla consultas para asociar con cobros
ALTER TABLE consultas ADD COLUMN cobro_id INT DEFAULT NULL;
ALTER TABLE consultas ADD FOREIGN KEY (cobro_id) REFERENCES cobros(id);

-- Insertar tarifas base para consultas
INSERT INTO tarifas (servicio_tipo, descripcion, precio_particular, precio_seguro, precio_convenio) VALUES
('consulta', 'Consulta Medicina General', 50.00, 0.00, 40.00),
('consulta', 'Consulta Especialista', 80.00, 0.00, 65.00),
('consulta', 'Consulta Pediatría', 60.00, 0.00, 50.00),
('consulta', 'Consulta Ginecología', 70.00, 0.00, 55.00);

-- Insertar tarifas base para otros servicios (sin laboratorio ni farmacia)
INSERT INTO tarifas (servicio_tipo, descripcion, precio_particular, precio_seguro, precio_convenio) VALUES
('rayosx', 'Radiografía de Tórax', 80.00, 0.00, 65.00),
('rayosx', 'Radiografía de Extremidades', 70.00, 0.00, 55.00),
('ecografia', 'Ecografía Abdominal', 120.00, 0.00, 95.00),
('ecografia', 'Ecografía Obstétrica', 100.00, 0.00, 80.00),
('ocupacional', 'Examen Médico Ocupacional', 90.00, 0.00, 75.00);

-- Insertar tarifas para procedimientos médicos
INSERT INTO tarifas (servicio_tipo, descripcion, precio_particular, precio_seguro, precio_convenio) VALUES
('procedimientos', 'Sutura Simple (hasta 3 cm)', 80.00, 0.00, 65.00),
('procedimientos', 'Sutura Compleja (más de 3 cm)', 150.00, 0.00, 120.00),
('procedimientos', 'Curación de Heridas', 40.00, 0.00, 30.00),
('procedimientos', 'Infiltración Intramuscular', 25.00, 0.00, 20.00),
('procedimientos', 'Nebulización', 35.00, 0.00, 25.00),
('procedimientos', 'Electrocardiograma', 50.00, 0.00, 40.00);

-- Insertar tarifas para cirugías menores
INSERT INTO tarifas (servicio_tipo, descripcion, precio_particular, precio_seguro, precio_convenio) VALUES
('cirugias', 'Extracción de Uña Encarnada', 200.00, 0.00, 160.00),
('cirugias', 'Extirpación de Lesión Cutánea Pequeña', 250.00, 0.00, 200.00),
('cirugias', 'Drenaje de Absceso', 300.00, 0.00, 240.00),
('cirugias', 'Biopsia de Piel', 180.00, 0.00, 145.00),
('cirugias', 'Cauterización de Verrugas', 120.00, 0.00, 95.00);

-- Insertar tarifas para tratamientos especializados
INSERT INTO tarifas (servicio_tipo, descripcion, precio_particular, precio_seguro, precio_convenio) VALUES
('tratamientos', 'Fisioterapia (Sesión)', 60.00, 0.00, 50.00),
('tratamientos', 'Terapia Respiratoria', 80.00, 0.00, 65.00),
('tratamientos', 'Vendaje Especializado', 45.00, 0.00, 35.00),
('tratamientos', 'Inmovilización con Yeso', 150.00, 0.00, 120.00),
('tratamientos', 'Retiro de Puntos', 30.00, 0.00, 25.00);

-- Insertar tarifas para emergencias
INSERT INTO tarifas (servicio_tipo, descripcion, precio_particular, precio_seguro, precio_convenio) VALUES
('emergencias', 'Atención de Emergencia Básica', 200.00, 0.00, 160.00),
('emergencias', 'Atención de Emergencia Compleja', 400.00, 0.00, 320.00),
('emergencias', 'Reanimación Cardiopulmonar', 500.00, 0.00, 400.00),
('emergencias', 'Estabilización de Trauma', 350.00, 0.00, 280.00);

-- Índices para optimizar consultas
CREATE INDEX idx_cobros_paciente ON cobros(paciente_id);
CREATE INDEX idx_cobros_fecha ON cobros(fecha_cobro);
CREATE INDEX idx_cobros_estado ON cobros(estado);
CREATE INDEX idx_tarifas_servicio ON tarifas(servicio_tipo, activo);