-- Cotizaciones de farmacia
CREATE TABLE cotizaciones_farmacia (
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

CREATE TABLE cotizaciones_farmacia_detalle (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cotizacion_id INT NOT NULL,
  medicamento_id INT NOT NULL,
  descripcion VARCHAR(255),
  cantidad INT DEFAULT 1,
  precio_unitario DECIMAL(10,2) NOT NULL,
  subtotal DECIMAL(10,2) NOT NULL,
  FOREIGN KEY (cotizacion_id) REFERENCES cotizaciones_farmacia(id),
  FOREIGN KEY (medicamento_id) REFERENCES medicamentos(id)
);

-- Movimientos de medicamentos (salidas, entradas, ajustes)
CREATE TABLE movimientos_medicamento (
  id INT AUTO_INCREMENT PRIMARY KEY,
  medicamento_id INT NOT NULL,
  usuario_id INT NOT NULL,
  cantidad INT NOT NULL,
  tipo_movimiento VARCHAR(20) NOT NULL, -- salida, entrada, ajuste
  fecha_hora DATETIME DEFAULT CURRENT_TIMESTAMP,
  observaciones VARCHAR(255),
  FOREIGN KEY (medicamento_id) REFERENCES medicamentos(id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);
