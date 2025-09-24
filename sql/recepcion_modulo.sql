-- Tablas requeridas para el flujo de atención en recepción

-- Tabla de pacientes
CREATE TABLE IF NOT EXISTS pacientes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  dni VARCHAR(15) NOT NULL UNIQUE,
  nombre VARCHAR(100) NOT NULL,
  apellido VARCHAR(100) NOT NULL,
  historia_clinica VARCHAR(30) NOT NULL UNIQUE,
  fecha_nacimiento DATE,
  sexo ENUM('M','F','Otro'),
  direccion VARCHAR(255),
  telefono VARCHAR(30),
  email VARCHAR(100),
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de atenciones (registro de cada atención en recepción)
CREATE TABLE IF NOT EXISTS atenciones (
  id INT AUTO_INCREMENT PRIMARY KEY,
  paciente_id INT NOT NULL,
  usuario_id INT NOT NULL, -- recepcionista que atiende
  fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  servicio ENUM('consulta','laboratorio','farmacia','rayosx','ecografia','ocupacional') NOT NULL,
  estado ENUM('pendiente','en_proceso','finalizado') NOT NULL DEFAULT 'pendiente',
  observaciones TEXT,
  FOREIGN KEY (paciente_id) REFERENCES pacientes(id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

-- Índices para búsqueda rápida
CREATE INDEX idx_pacientes_apellido_nombre ON pacientes(apellido, nombre);
CREATE INDEX idx_pacientes_historia ON pacientes(historia_clinica);
