-- Tabla principal de cotizaciones
CREATE TABLE cotizaciones (
  id INT AUTO_INCREMENT PRIMARY KEY,
  paciente_id INT NOT NULL,
  usuario_id INT NOT NULL,
  total DECIMAL(10,2) NOT NULL,
  fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
  estado VARCHAR(20) DEFAULT 'pendiente',
  observaciones VARCHAR(255),
  FOREIGN KEY (paciente_id) REFERENCES pacientes(id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

-- Detalle de cotizaciones
CREATE TABLE cotizaciones_detalle (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cotizacion_id INT NOT NULL,
  servicio_tipo VARCHAR(30) NOT NULL,
  servicio_id INT,
  descripcion VARCHAR(255),
  cantidad INT DEFAULT 1,
  precio_unitario DECIMAL(10,2) NOT NULL,
  subtotal DECIMAL(10,2) NOT NULL,
  FOREIGN KEY (cotizacion_id) REFERENCES cotizaciones(id)
);

-- Para convertir cotización en cobro, solo se debe crear el registro en cobros y cobros_detalle usando los datos de cotización.