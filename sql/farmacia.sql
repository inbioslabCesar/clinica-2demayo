-- Tabla principal de medicamentos

CREATE TABLE IF NOT EXISTS medicamentos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(30) UNIQUE,
    nombre VARCHAR(100) NOT NULL,
    presentacion VARCHAR(50),
    concentracion VARCHAR(50),
    laboratorio VARCHAR(100),
    stock INT DEFAULT 0,
    fecha_vencimiento DATE,
    estado ENUM('activo','inactivo','cuarentena') DEFAULT 'activo',
    fecha_cuarentena DATE DEFAULT NULL,
    motivo_cuarentena VARCHAR(255) DEFAULT NULL,
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP
);



-- Si la tabla ya existe y quieres agregar el campo 'codigo':
ALTER TABLE medicamentos ADD COLUMN codigo VARCHAR(30) UNIQUE AFTER id;
-- Si la tabla ya existe y quieres agregar el campo 'fecha_vencimiento':
ALTER TABLE medicamentos ADD COLUMN fecha_vencimiento DATE AFTER stock;
-- Si la tabla ya existe y quieres agregar el estado 'cuarentena':
ALTER TABLE medicamentos MODIFY COLUMN estado ENUM('activo','inactivo','cuarentena') DEFAULT 'activo';
-- Si la tabla ya existe y quieres agregar los campos de cuarentena:
ALTER TABLE medicamentos ADD COLUMN fecha_cuarentena DATE DEFAULT NULL AFTER estado;
ALTER TABLE medicamentos ADD COLUMN motivo_cuarentena VARCHAR(255) DEFAULT NULL AFTER fecha_cuarentena;

-- Tabla de movimientos de medicamentos (entradas/salidas)
CREATE TABLE IF NOT EXISTS movimientos_medicamento (
    id INT AUTO_INCREMENT PRIMARY KEY,
    medicamento_id INT NOT NULL,
    tipo ENUM('entrada','salida') NOT NULL,
    cantidad INT NOT NULL,
    usuario_id INT,
    observaciones VARCHAR(255),
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (medicamento_id) REFERENCES medicamentos(id)
);

-- Ejemplos de medicamentos
INSERT INTO medicamentos (codigo, nombre, presentacion, concentracion, laboratorio, stock, fecha_vencimiento, estado, fecha_cuarentena, motivo_cuarentena) VALUES
('PARA500', 'Paracetamol', 'Tabletas', '500mg', 'Genfar', 100, '2026-01-31', 'activo', NULL, NULL),
('IBU400', 'Ibuprofeno', 'Tabletas', '400mg', 'Bayer', 80, '2025-12-15', 'activo', NULL, NULL),
('AMOX500', 'Amoxicilina', 'Cápsulas', '500mg', 'Medifarma', 50, '2026-06-30', 'activo', NULL, NULL),
('LORA10', 'Loratadina', 'Tabletas', '10mg', 'La Santé', 60, '2025-10-01', 'activo', NULL, NULL),
('OMEP20', 'Omeprazol', 'Cápsulas', '20mg', 'Roche', 40, '2027-03-20', 'activo', NULL, NULL);


