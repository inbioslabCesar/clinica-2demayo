-- Migración: Cotizaciones multiservicio v2
-- Fecha: 2026-03-03
-- Objetivo:
-- 1) Mantener cotización única por paciente con múltiples servicios
-- 2) Soportar estados: pendiente, parcial, pagado, anulada
-- 3) Registrar auditoría completa (ediciones, anulaciones, cobros, ajustes)
-- 4) Preparar edición de cotizaciones sin borrar histórico
--
-- IMPORTANTE:
-- - Ejecutar en staging primero.
-- - Este script agrega estructura; no rompe compatibilidad con el flujo actual.
-- - No elimina tablas existentes (incluyendo cotizaciones_farmacia).

START TRANSACTION;

-- =========================================================
-- 1) EXTENSIÓN DE TABLA PRINCIPAL cotizaciones
-- =========================================================
ALTER TABLE cotizaciones
  ADD COLUMN numero_comprobante VARCHAR(30) NULL AFTER id,
  ADD COLUMN total_pagado DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER total,
  ADD COLUMN saldo_pendiente DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER total_pagado,
  ADD COLUMN version_actual INT NOT NULL DEFAULT 1 AFTER estado,
  ADD COLUMN cotizacion_padre_id INT NULL AFTER version_actual,
  ADD COLUMN es_adenda TINYINT(1) NOT NULL DEFAULT 0 AFTER cotizacion_padre_id,
  ADD COLUMN anulado_por INT NULL AFTER observaciones,
  ADD COLUMN anulado_en DATETIME NULL AFTER anulado_por,
  ADD COLUMN motivo_anulacion VARCHAR(255) NULL AFTER anulado_en,
  ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER fecha;

-- Normalizar estado actual a catálogo operativo
UPDATE cotizaciones
SET estado = CASE
  WHEN LOWER(estado) IN ('anulado', 'cancelado', 'cancelada') THEN 'anulada'
  WHEN LOWER(estado) IN ('pagado', 'cobrada', 'cobrado') THEN 'pagado'
  WHEN LOWER(estado) IN ('parcial') THEN 'parcial'
  ELSE 'pendiente'
END;

-- Inicializar saldos
UPDATE cotizaciones
SET total_pagado = CASE WHEN estado = 'pagado' THEN total ELSE total_pagado END,
    saldo_pendiente = CASE WHEN estado = 'pagado' THEN 0 ELSE total END
WHERE (total_pagado = 0 AND saldo_pendiente = 0);

-- Índices operativos
ALTER TABLE cotizaciones
  ADD UNIQUE KEY uk_cotizaciones_numero_comprobante (numero_comprobante),
  ADD KEY idx_cotizaciones_estado_fecha (estado, fecha),
  ADD KEY idx_cotizaciones_usuario_fecha (usuario_id, fecha),
  ADD KEY idx_cotizaciones_paciente_fecha (paciente_id, fecha),
  ADD KEY idx_cotizaciones_padre (cotizacion_padre_id);

-- =========================================================
-- 2) DETALLE: CAMPOS PARA CONTROL DE EDICIÓN POR ITEM
-- =========================================================
ALTER TABLE cotizaciones_detalle
  ADD COLUMN estado_item VARCHAR(20) NOT NULL DEFAULT 'activo' AFTER subtotal,
  ADD COLUMN version_item INT NOT NULL DEFAULT 1 AFTER estado_item,
  ADD COLUMN detalle_padre_id INT NULL AFTER version_item,
  ADD COLUMN editado_por INT NULL AFTER detalle_padre_id,
  ADD COLUMN editado_en DATETIME NULL AFTER editado_por,
  ADD COLUMN motivo_edicion VARCHAR(255) NULL AFTER editado_en;

ALTER TABLE cotizaciones_detalle
  ADD KEY idx_cot_detalle_estado (estado_item),
  ADD KEY idx_cot_detalle_servicio (servicio_tipo, servicio_id),
  ADD KEY idx_cot_detalle_padre (detalle_padre_id);

-- =========================================================
-- 3) TABLA DE EVENTOS/AUDITORÍA DE COTIZACIÓN
-- =========================================================
CREATE TABLE cotizacion_eventos (
  id INT(11) NOT NULL AUTO_INCREMENT,
  cotizacion_id INT(11) NOT NULL,
  version INT(11) NOT NULL DEFAULT 1,
  evento_tipo ENUM(
    'creada',
    'editada',
    'item_agregado',
    'item_modificado',
    'item_eliminado',
    'anulada',
    'reactivada',
    'cobro_registrado',
    'devolucion_parcial',
    'saldo_actualizado',
    'adenda_creada'
  ) NOT NULL,
  usuario_id INT(11) NOT NULL,
  motivo VARCHAR(255) DEFAULT NULL,
  payload_json LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(payload_json)),
  ip_origen VARCHAR(45) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_cotizacion_eventos_cotizacion (cotizacion_id, created_at),
  KEY idx_cotizacion_eventos_tipo (evento_tipo),
  KEY idx_cotizacion_eventos_usuario (usuario_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================================================
-- 4) MOVIMIENTOS DE COBRO / SALDO POR COTIZACIÓN
-- =========================================================
CREATE TABLE cotizacion_movimientos (
  id INT(11) NOT NULL AUTO_INCREMENT,
  cotizacion_id INT(11) NOT NULL,
  cobro_id INT(11) DEFAULT NULL,
  tipo_movimiento ENUM('cargo','abono','devolucion','ajuste') NOT NULL,
  monto DECIMAL(10,2) NOT NULL,
  saldo_anterior DECIMAL(10,2) NOT NULL,
  saldo_nuevo DECIMAL(10,2) NOT NULL,
  descripcion VARCHAR(255) DEFAULT NULL,
  usuario_id INT(11) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_cot_mov_cotizacion (cotizacion_id, created_at),
  KEY idx_cot_mov_cobro (cobro_id),
  KEY idx_cot_mov_tipo (tipo_movimiento)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================================================
-- 5) AJUSTES POR ITEM (CUANDO YA ESTÁ COBRADO)
-- =========================================================
CREATE TABLE cotizacion_item_ajustes (
  id INT(11) NOT NULL AUTO_INCREMENT,
  cotizacion_id INT(11) NOT NULL,
  cotizacion_detalle_id INT(11) DEFAULT NULL,
  servicio_tipo VARCHAR(30) NOT NULL,
  servicio_id INT(11) DEFAULT NULL,
  accion ENUM('quitar','agregar','modificar_cantidad','modificar_precio') NOT NULL,
  cantidad_anterior INT(11) DEFAULT NULL,
  cantidad_nueva INT(11) DEFAULT NULL,
  precio_anterior DECIMAL(10,2) DEFAULT NULL,
  precio_nuevo DECIMAL(10,2) DEFAULT NULL,
  subtotal_anterior DECIMAL(10,2) DEFAULT NULL,
  subtotal_nuevo DECIMAL(10,2) DEFAULT NULL,
  motivo VARCHAR(255) NOT NULL,
  usuario_id INT(11) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_cot_item_ajustes_cotizacion (cotizacion_id, created_at),
  KEY idx_cot_item_ajustes_servicio (servicio_tipo, servicio_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================================================
-- 6) RELACIÓN OPCIONAL PARA UNIFICAR FARMACIA CON COTIZACIÓN GENERAL
-- =========================================================
CREATE TABLE cotizacion_farmacia_vinculos (
  id INT(11) NOT NULL AUTO_INCREMENT,
  cotizacion_id INT(11) NOT NULL,
  cotizacion_farmacia_id INT(11) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_cot_farm_vinculo (cotizacion_id, cotizacion_farmacia_id),
  KEY idx_cot_farm_cotizacion (cotizacion_id),
  KEY idx_cot_farm_farmacia (cotizacion_farmacia_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================================================
-- 7) VISTA PARA TABLA GENERAL DIARIA DE COTIZACIONES
-- =========================================================
CREATE OR REPLACE VIEW vw_cotizaciones_resumen_diario AS
SELECT
  c.id,
  c.numero_comprobante,
  c.fecha,
  DATE(c.fecha) AS fecha_dia,
  c.estado,
  c.total,
  c.total_pagado,
  c.saldo_pendiente,
  c.version_actual,
  c.paciente_id,
  CONCAT(COALESCE(p.nombre, ''), ' ', COALESCE(p.apellido, '')) AS paciente_nombre,
  p.dni AS paciente_dni,
  p.historia_clinica,
  c.usuario_id,
  u.nombre AS usuario_cotizo,
  COUNT(cd.id) AS total_items,
  COUNT(DISTINCT cd.servicio_tipo) AS total_servicios
FROM cotizaciones c
LEFT JOIN pacientes p ON p.id = c.paciente_id
LEFT JOIN usuarios u ON u.id = c.usuario_id
LEFT JOIN cotizaciones_detalle cd ON cd.cotizacion_id = c.id
GROUP BY
  c.id,
  c.numero_comprobante,
  c.fecha,
  DATE(c.fecha),
  c.estado,
  c.total,
  c.total_pagado,
  c.saldo_pendiente,
  c.version_actual,
  c.paciente_id,
  CONCAT(COALESCE(p.nombre, ''), ' ', COALESCE(p.apellido, '')),
  p.dni,
  p.historia_clinica,
  c.usuario_id,
  u.nombre;

-- =========================================================
-- 8) DATOS BASE DE EVENTOS PARA HISTÓRICO ACTUAL
-- =========================================================
INSERT INTO cotizacion_eventos (cotizacion_id, version, evento_tipo, usuario_id, motivo, payload_json)
SELECT
  c.id,
  COALESCE(c.version_actual, 1),
  'creada',
  c.usuario_id,
  'Migración inicial a cotizaciones v2',
  JSON_OBJECT(
    'estado', c.estado,
    'total', c.total,
    'total_pagado', c.total_pagado,
    'saldo_pendiente', c.saldo_pendiente,
    'fecha', c.fecha
  )
FROM cotizaciones c;

COMMIT;

-- Fin de migración
