-- Migración: Agregar campo monto_final a la tabla cobros
-- Cambios para trazabilidad y control de descuentos en cobros 26-11-25

-- 1. Agregar campos a la tabla cobros
ALTER TABLE cobros
  ADD COLUMN total_original DECIMAL(10,2) AFTER total,
  ADD COLUMN descuento_monto DECIMAL(10,2) AFTER total_original,
  ADD COLUMN descuento_porcentaje DECIMAL(5,2) AFTER descuento_monto,
  ADD COLUMN usuario_descuento_id INT AFTER descuento_porcentaje,
  ADD COLUMN justificacion_descuento TEXT AFTER usuario_descuento_id;

-- 2. Agregar campos a la tabla cobros_detalle (opcional, si se requiere consultas SQL directas)
ALTER TABLE cobros_detalle
  ADD COLUMN valor_original DECIMAL(10,2) AFTER subtotal,
  ADD COLUMN descuento_monto DECIMAL(10,2) AFTER valor_original,
  ADD COLUMN descuento_porcentaje DECIMAL(5,2) AFTER descuento_monto,
  ADD COLUMN monto_final DECIMAL(10,2) AFTER descuento_porcentaje;

-- 3. Agregar campos a la tabla ingresos_diarios
ALTER TABLE ingresos_diarios
  ADD COLUMN monto_original DECIMAL(10,2) AFTER monto,
  ADD COLUMN descuento_monto DECIMAL(10,2) AFTER monto_original,
  ADD COLUMN descuento_porcentaje DECIMAL(5,2) AFTER descuento_monto,
  ADD COLUMN monto_final DECIMAL(10,2) AFTER descuento_porcentaje;

-- 4. Crear tabla de auditoría de descuentos
CREATE TABLE IF NOT EXISTS descuentos_aplicados (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cobro_id INT NOT NULL,
  usuario_id INT NOT NULL,
  fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  tipo_descuento ENUM('porcentaje','monto') NOT NULL,
  valor_descuento DECIMAL(10,2) NOT NULL,
  justificacion TEXT,
  INDEX (cobro_id),
  INDEX (usuario_id)
);
ALTER TABLE cobros
  ADD COLUMN monto_final DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER total;

  ALTER TABLE descuentos_aplicados
  ADD COLUMN motivo TEXT AFTER valor_descuento;

  ALTER TABLE descuentos_aplicados
  ADD COLUMN fecha_aplicacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER motivo;
