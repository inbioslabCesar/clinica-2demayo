-- Script de actualización para Hostinger
-- Sincroniza la estructura con la base de datos de desarrollo
-- Fecha: 2025-10-26

-- 1. Agregar campo tipo_consulta a la tabla consultas
ALTER TABLE consultas
  ADD COLUMN tipo_consulta ENUM('programada','espontanea') DEFAULT 'programada' AFTER estado;

-- 2. Modificar campos en egresos (ajustar tipo y eliminar ENUM si es necesario)
ALTER TABLE egresos
  MODIFY COLUMN tipo VARCHAR(50) NOT NULL,
  MODIFY COLUMN estado VARCHAR(20) DEFAULT 'pendiente',
  MODIFY COLUMN categoria VARCHAR(100) NOT NULL,
  MODIFY COLUMN concepto VARCHAR(255) NOT NULL,
  MODIFY COLUMN responsable VARCHAR(100) NOT NULL;

-- 3. Agregar índice idx_historia_clinica en pacientes
CREATE INDEX idx_historia_clinica ON pacientes(historia_clinica);

-- 4. Modificar valores por defecto de campos DECIMAL en cajas
ALTER TABLE cajas
  MODIFY COLUMN monto_apertura DECIMAL(10,2) NOT NULL DEFAULT '0.00',
  MODIFY COLUMN total_efectivo DECIMAL(10,2) DEFAULT '0.00',
  MODIFY COLUMN total_tarjetas DECIMAL(10,2) DEFAULT '0.00',
  MODIFY COLUMN total_transferencias DECIMAL(10,2) DEFAULT '0.00',
  MODIFY COLUMN total_otros DECIMAL(10,2) DEFAULT '0.00',
  MODIFY COLUMN diferencia DECIMAL(10,2) DEFAULT '0.00';

-- 5. (Opcional) Modificar COLLATE en campos si tienes problemas de compatibilidad
-- Ejemplo:
-- ALTER TABLE pacientes MODIFY COLUMN nombre VARCHAR(100) COLLATE utf8mb4_general_ci NOT NULL;

-- Revisa cada bloque antes de ejecutar en producción. Haz backup antes de aplicar cambios.