-- 02_schema_paquetes_perfiles.sql
-- Esquema base para paquetes/perfiles (sin tocar tablas actuales de flujo operativo)

CREATE TABLE IF NOT EXISTS paquetes_perfiles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  codigo VARCHAR(40) NOT NULL,
  nombre VARCHAR(160) NOT NULL,
  descripcion TEXT NULL,
  estado ENUM('borrador','activo','inactivo','archivado') NOT NULL DEFAULT 'borrador',
  tipo ENUM('paquete','perfil') NOT NULL DEFAULT 'paquete',
  moneda CHAR(3) NOT NULL DEFAULT 'PEN',
  precio_global_venta DECIMAL(12,2) NOT NULL,
  modo_precio ENUM('fijo_global','calculado_componentes') NOT NULL DEFAULT 'fijo_global',
  permite_descuento_adicional TINYINT(1) NOT NULL DEFAULT 1,
  vigencia_desde DATE NULL,
  vigencia_hasta DATE NULL,
  meta JSON NULL,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_paquetes_perfiles_codigo (codigo),
  KEY idx_paquetes_estado_tipo (estado, tipo),
  KEY idx_paquetes_vigencia (vigencia_desde, vigencia_hasta)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS paquetes_perfiles_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  paquete_id BIGINT UNSIGNED NOT NULL,
  item_orden INT NOT NULL DEFAULT 1,
  source_type ENUM('consulta','ecografia','rayosx','procedimiento','operacion','laboratorio','farmacia','otro') NOT NULL,
  source_id BIGINT UNSIGNED NULL,
  medico_id BIGINT UNSIGNED NULL,
  descripcion_snapshot VARCHAR(255) NOT NULL,
  cantidad DECIMAL(10,2) NOT NULL DEFAULT 1,
  precio_lista_snapshot DECIMAL(12,2) NOT NULL DEFAULT 0,
  subtotal_snapshot DECIMAL(12,2) NOT NULL DEFAULT 0,
  -- Datos para laboratorio de referencia cuando corresponda
  es_derivado TINYINT(1) NOT NULL DEFAULT 0,
  laboratorio_referencia VARCHAR(120) NULL,
  tipo_derivacion ENUM('monto','porcentaje') NULL,
  valor_derivacion DECIMAL(12,2) NULL,
  -- Datos libres por item para evolucion futura
  reglas_json JSON NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_paq_items_paquete (paquete_id),
  KEY idx_paq_items_source (source_type, source_id),
  KEY idx_paq_items_medico (medico_id),
  CONSTRAINT fk_paq_items_paquete FOREIGN KEY (paquete_id) REFERENCES paquetes_perfiles(id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Snapshot de venta/cotizacion del paquete para trazabilidad historica
CREATE TABLE IF NOT EXISTS paquetes_perfiles_ventas_snapshot (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  paquete_id BIGINT UNSIGNED NOT NULL,
  cotizacion_id BIGINT UNSIGNED NULL,
  cobro_id BIGINT UNSIGNED NULL,
  usuario_id BIGINT UNSIGNED NULL,
  paciente_id BIGINT UNSIGNED NULL,
  precio_global_base DECIMAL(12,2) NOT NULL DEFAULT 0,
  descuento_global_aplicado DECIMAL(12,2) NOT NULL DEFAULT 0,
  precio_global_final DECIMAL(12,2) NOT NULL DEFAULT 0,
  estado ENUM('cotizado','cobrado','anulado') NOT NULL DEFAULT 'cotizado',
  snapshot_json JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_paq_snap_paquete (paquete_id),
  KEY idx_paq_snap_cot (cotizacion_id),
  KEY idx_paq_snap_cobro (cobro_id),
  CONSTRAINT fk_paq_snap_paquete FOREIGN KEY (paquete_id) REFERENCES paquetes_perfiles(id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
