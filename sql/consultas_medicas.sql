-- Script de creación de tablas para gestión de consultas médicas y disponibilidad de médicos

-- 1. Tabla de médicos
CREATE TABLE medicos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    especialidad VARCHAR(100),
    usuario_id INT, -- Si el médico tiene usuario para login, FK a tabla usuarios
    UNIQUE KEY (usuario_id)
);

-- 2. Tabla de disponibilidad de médicos
CREATE TABLE disponibilidad_medicos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    medico_id INT NOT NULL,
    dia_semana ENUM('lunes','martes','miércoles','jueves','viernes','sábado','domingo') NOT NULL,
    hora_inicio TIME NOT NULL,
    hora_fin TIME NOT NULL,
    FOREIGN KEY (medico_id) REFERENCES medicos(id) ON DELETE CASCADE
);

-- 3. Tabla de consultas
CREATE TABLE consultas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    paciente_id INT NOT NULL,
    medico_id INT NOT NULL,
    fecha DATE NOT NULL,
    hora TIME NOT NULL,
    estado ENUM('pendiente','completada','cancelada') DEFAULT 'pendiente',
    FOREIGN KEY (paciente_id) REFERENCES pacientes(id) ON DELETE CASCADE,
    FOREIGN KEY (medico_id) REFERENCES medicos(id) ON DELETE CASCADE
);
