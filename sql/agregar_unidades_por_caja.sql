-- Agregar campo unidades_por_caja a la tabla medicamentos
ALTER TABLE medicamentos 
ADD COLUMN unidades_por_caja INT DEFAULT 30 AFTER stock;

-- Agregar campos de precios si no existen
ALTER TABLE medicamentos 
ADD COLUMN precio_compra DECIMAL(10,2) DEFAULT 0.00 AFTER fecha_vencimiento;

ALTER TABLE medicamentos 
ADD COLUMN margen_ganancia DECIMAL(5,2) DEFAULT 0.00 AFTER precio_compra;

-- Actualizar medicamentos existentes con valores por defecto
UPDATE medicamentos SET 
    unidades_por_caja = 30,
    precio_compra = 10.00,
    margen_ganancia = 50.00
WHERE unidades_por_caja IS NULL;