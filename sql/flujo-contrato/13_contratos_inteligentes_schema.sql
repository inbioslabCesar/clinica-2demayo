-- ============================================================
-- Migracion 13: contratos inteligentes (schema base)
-- Fecha: 2026-04-19
-- Objetivo:
--   1) Definir sub-servicios por evento de plantilla
--   2) Agregar trazabilidad/idempotencia de ejecucion en agenda_contrato
--   3) Crear snapshot opcional de sub-servicios por evento de agenda
-- Version compatible con hosting restringido (sin information_schema)
-- ============================================================

/* ------------------------------------------------------------------
   1) Tabla: contratos_plantillas_evento_subservicios
   ------------------------------------------------------------------ */
CREATE TABLE IF NOT EXISTS contratos_plantillas_evento_subservicios (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  plantilla_item_id BIGINT UNSIGNED NOT NULL,
  servicio_tipo ENUM('consulta','ecografia','rayosx','procedimiento','operacion','laboratorio','farmacia') NOT NULL,
  servicio_id BIGINT UNSIGNED NOT NULL,
  descripcion_snapshot VARCHAR(255) NULL,
  cantidad DECIMAL(10,2) NOT NULL DEFAULT 1.00,
  orden_inyeccion INT NOT NULL DEFAULT 1,
  origen_cobro_default ENUM('contrato','extra') NOT NULL DEFAULT 'contrato',
  requiere_orden TINYINT(1) NOT NULL DEFAULT 1,
  laboratorio_referencia TINYINT(1) NOT NULL DEFAULT 0,
  tipo_derivacion ENUM('monto_fijo','porcentaje') NULL,
  valor_derivacion DECIMAL(10,2) NULL,
  estado ENUM('activo','inactivo') NOT NULL DEFAULT 'activo',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_cp_evento_sub_item (plantilla_item_id),
  KEY idx_cp_evento_sub_servicio (servicio_tipo, servicio_id),
  CONSTRAINT fk_cp_evento_sub_item
    FOREIGN KEY (plantilla_item_id) REFERENCES contratos_plantillas_items(id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

/* ------------------------------------------------------------------
   2) Alter: agenda_contrato (idempotencia y trazabilidad)
   ------------------------------------------------------------------ */
ALTER TABLE agenda_contrato
  ADD COLUMN IF NOT EXISTS cotizacion_id_ejecucion BIGINT UNSIGNED NULL AFTER consulta_id;

ALTER TABLE agenda_contrato
  ADD COLUMN IF NOT EXISTS ejecucion_token VARCHAR(64) NULL AFTER cotizacion_id_ejecucion;

ALTER TABLE agenda_contrato
  ADD COLUMN IF NOT EXISTS ejecucion_estado ENUM('pendiente','ejecutado','revertido','error') NOT NULL DEFAULT 'pendiente' AFTER ejecucion_token;

ALTER TABLE agenda_contrato
  ADD COLUMN IF NOT EXISTS ejecucion_error TEXT NULL AFTER ejecucion_estado;

ALTER TABLE agenda_contrato
  ADD COLUMN IF NOT EXISTS ejecutado_en DATETIME NULL AFTER ejecucion_error;

ALTER TABLE agenda_contrato
  ADD COLUMN IF NOT EXISTS ejecutado_por BIGINT UNSIGNED NULL AFTER ejecutado_en;

-- Ejecutar una sola vez en produccion. Si ya existen, puede devolver error de indice duplicado.
ALTER TABLE agenda_contrato ADD INDEX idx_agenda_consulta (consulta_id);
ALTER TABLE agenda_contrato ADD INDEX idx_agenda_cotizacion_ejecucion (cotizacion_id_ejecucion);
ALTER TABLE agenda_contrato ADD UNIQUE INDEX uq_agenda_ejecucion_token (ejecucion_token);

/* ------------------------------------------------------------------
   3) Tabla opcional recomendada: snapshot por evento de agenda
   ------------------------------------------------------------------ */
CREATE TABLE IF NOT EXISTS agenda_contrato_subservicios_snapshot (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  agenda_evento_id BIGINT UNSIGNED NOT NULL,
  plantilla_subservicio_id BIGINT UNSIGNED NULL,
  servicio_tipo ENUM('consulta','ecografia','rayosx','procedimiento','operacion','laboratorio','farmacia') NOT NULL,
  servicio_id BIGINT UNSIGNED NOT NULL,
  descripcion_snapshot VARCHAR(255) NULL,
  cantidad DECIMAL(10,2) NOT NULL DEFAULT 1.00,
  orden_inyeccion INT NOT NULL DEFAULT 1,
  origen_cobro_default ENUM('contrato','extra') NOT NULL DEFAULT 'contrato',
  requiere_orden TINYINT(1) NOT NULL DEFAULT 1,
  laboratorio_referencia TINYINT(1) NOT NULL DEFAULT 0,
  tipo_derivacion ENUM('monto_fijo','porcentaje') NULL,
  valor_derivacion DECIMAL(10,2) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_agenda_snap_evento (agenda_evento_id),
  CONSTRAINT fk_agenda_snap_evento
    FOREIGN KEY (agenda_evento_id) REFERENCES agenda_contrato(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_agenda_snap_plantilla_sub
    FOREIGN KEY (plantilla_subservicio_id) REFERENCES contratos_plantillas_evento_subservicios(id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

/* ------------------------------------------------------------------
   4) Verificaciones rapidas (sin information_schema)
   ------------------------------------------------------------------ */
SHOW COLUMNS FROM agenda_contrato LIKE 'consulta_id';
SHOW COLUMNS FROM agenda_contrato LIKE 'cotizacion_id_ejecucion';
SHOW COLUMNS FROM agenda_contrato LIKE 'ejecucion_token';
SHOW COLUMNS FROM agenda_contrato LIKE 'ejecucion_estado';
SHOW COLUMNS FROM agenda_contrato LIKE 'ejecucion_error';
SHOW COLUMNS FROM agenda_contrato LIKE 'ejecutado_en';
SHOW COLUMNS FROM agenda_contrato LIKE 'ejecutado_por';

SHOW INDEX FROM agenda_contrato WHERE Key_name IN ('idx_agenda_consulta','idx_agenda_cotizacion_ejecucion','uq_agenda_ejecucion_token');
SHOW TABLES LIKE 'contratos_plantillas_evento_subservicios';
SHOW TABLES LIKE 'agenda_contrato_subservicios_snapshot';
