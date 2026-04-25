-- 01_schema_contratos.sql
-- Flujo Contrato: esquema base de plantillas, contratos por paciente, agenda y cuenta corriente.

CREATE TABLE IF NOT EXISTS contratos_plantillas (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  codigo VARCHAR(30) NOT NULL,
  nombre VARCHAR(150) NOT NULL,
  descripcion TEXT NULL,
  estado ENUM('borrador','activo','inactivo','archivado') NOT NULL DEFAULT 'borrador',
  duracion_dias INT NULL,
  pago_unico_monto DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  requiere_liquidacion_anticipada TINYINT(1) NOT NULL DEFAULT 1,
  dias_anticipacion_liquidacion INT NOT NULL DEFAULT 7,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_contratos_plantillas_codigo (codigo),
  KEY idx_contratos_plantillas_estado (estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS contratos_plantillas_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  plantilla_id BIGINT UNSIGNED NOT NULL,
  servicio_tipo VARCHAR(30) NOT NULL,
  servicio_id BIGINT UNSIGNED NOT NULL,
  descripcion_snapshot VARCHAR(255) NOT NULL,
  cantidad_incluida DECIMAL(10,2) NOT NULL DEFAULT 1.00,
  orden_programado INT NOT NULL DEFAULT 1,
  regla_uso ENUM('programado','flexible') NOT NULL DEFAULT 'programado',
  activo TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_plantilla_items_plantilla (plantilla_id),
  KEY idx_plantilla_items_servicio (servicio_tipo, servicio_id),
  CONSTRAINT fk_contrato_plantilla_items_plantilla FOREIGN KEY (plantilla_id) REFERENCES contratos_plantillas(id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS contratos_plantillas_hitos (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  plantilla_item_id BIGINT UNSIGNED NOT NULL,
  nombre_hito VARCHAR(150) NOT NULL,
  tipo_programacion ENUM('fijo_fecha','rango_gestacional','relativo_inicio') NOT NULL DEFAULT 'fijo_fecha',
  semana_min INT NULL,
  semana_max INT NULL,
  dia_relativo_inicio INT NULL,
  obligatorio TINYINT(1) NOT NULL DEFAULT 1,
  orden INT NOT NULL DEFAULT 1,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_plantilla_hitos_item (plantilla_item_id),
  CONSTRAINT fk_contrato_plantilla_hitos_item FOREIGN KEY (plantilla_item_id) REFERENCES contratos_plantillas_items(id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS contratos_paciente (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  paciente_id BIGINT UNSIGNED NOT NULL,
  plantilla_id BIGINT UNSIGNED NOT NULL,
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE NOT NULL,
  monto_total DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  saldo_pendiente DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  estado ENUM('pendiente','activo','finalizado','liquidado','cancelado') NOT NULL DEFAULT 'pendiente',
  fecha_limite_liquidacion DATE NULL,
  observaciones TEXT NULL,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_contrato_paciente_paciente (paciente_id),
  KEY idx_contrato_paciente_estado (estado),
  KEY idx_contrato_paciente_fechas (fecha_inicio, fecha_fin),
  CONSTRAINT fk_contrato_paciente_plantilla FOREIGN KEY (plantilla_id) REFERENCES contratos_plantillas(id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS contratos_paciente_servicios (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  contrato_paciente_id BIGINT UNSIGNED NOT NULL,
  plantilla_item_id BIGINT UNSIGNED NOT NULL,
  servicio_tipo VARCHAR(30) NOT NULL,
  servicio_id BIGINT UNSIGNED NOT NULL,
  cantidad_total DECIMAL(10,2) NOT NULL DEFAULT 1.00,
  cantidad_consumida DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  estado ENUM('pendiente','en_uso','agotado') NOT NULL DEFAULT 'pendiente',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_contrato_servicio_unico (contrato_paciente_id, plantilla_item_id),
  KEY idx_contrato_servicio_match (contrato_paciente_id, servicio_tipo, servicio_id),
  CONSTRAINT fk_contrato_paciente_servicios_contrato FOREIGN KEY (contrato_paciente_id) REFERENCES contratos_paciente(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_contrato_paciente_servicios_item FOREIGN KEY (plantilla_item_id) REFERENCES contratos_plantillas_items(id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS agenda_contrato (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  contrato_paciente_id BIGINT UNSIGNED NOT NULL,
  plantilla_hito_id BIGINT UNSIGNED NULL,
  plantilla_item_id BIGINT UNSIGNED NULL,
  servicio_tipo VARCHAR(30) NOT NULL,
  servicio_id BIGINT UNSIGNED NOT NULL,
  titulo_evento VARCHAR(180) NOT NULL,
  fecha_programada DATETIME NOT NULL,
  estado_evento ENUM('pendiente','confirmado','atendido','reprogramado','cancelado') NOT NULL DEFAULT 'pendiente',
  semana_gestacional_objetivo DECIMAL(5,2) NULL,
  semana_gestacional_real DECIMAL(5,2) NULL,
  tolerancia_desde DATE NULL,
  tolerancia_hasta DATE NULL,
  consulta_id BIGINT UNSIGNED NULL,
  orden_imagen_id BIGINT UNSIGNED NULL,
  observaciones TEXT NULL,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_agenda_contrato_contrato (contrato_paciente_id),
  KEY idx_agenda_contrato_fecha (fecha_programada),
  KEY idx_agenda_contrato_estado (estado_evento),
  CONSTRAINT fk_agenda_contrato_contrato FOREIGN KEY (contrato_paciente_id) REFERENCES contratos_paciente(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_agenda_contrato_hito FOREIGN KEY (plantilla_hito_id) REFERENCES contratos_plantillas_hitos(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_agenda_contrato_item FOREIGN KEY (plantilla_item_id) REFERENCES contratos_plantillas_items(id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS agenda_contrato_medicos (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  agenda_contrato_id BIGINT UNSIGNED NOT NULL,
  medico_id BIGINT UNSIGNED NOT NULL,
  rol_medico ENUM('titular','apoyo','rotativo') NOT NULL DEFAULT 'rotativo',
  prioridad INT NOT NULL DEFAULT 1,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_agenda_contrato_medico (agenda_contrato_id, medico_id),
  KEY idx_agenda_contrato_medicos_agenda (agenda_contrato_id),
  KEY idx_agenda_contrato_medicos_medico (medico_id),
  CONSTRAINT fk_agenda_contrato_medicos_agenda FOREIGN KEY (agenda_contrato_id) REFERENCES agenda_contrato(id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS paciente_seguimiento_pagos (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  contrato_paciente_id BIGINT UNSIGNED NOT NULL,
  nro_cuota INT NOT NULL DEFAULT 1,
  fecha_programada DATE NULL,
  monto_programado DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  monto_pagado DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  fecha_pago DATETIME NULL,
  estado ENUM('pendiente','parcial','pagado','vencido') NOT NULL DEFAULT 'pendiente',
  metodo_pago VARCHAR(30) NULL,
  cobro_id BIGINT UNSIGNED NULL,
  observaciones VARCHAR(255) NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_pagos_contrato (contrato_paciente_id),
  KEY idx_pagos_estado (estado),
  CONSTRAINT fk_pagos_contrato FOREIGN KEY (contrato_paciente_id) REFERENCES contratos_paciente(id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS contratos_consumos (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  contrato_paciente_id BIGINT UNSIGNED NOT NULL,
  contrato_paciente_servicio_id BIGINT UNSIGNED NOT NULL,
  paciente_id BIGINT UNSIGNED NOT NULL,
  cotizacion_id BIGINT UNSIGNED NULL,
  cotizacion_detalle_id BIGINT UNSIGNED NULL,
  consulta_id BIGINT UNSIGNED NULL,
  fecha_consumo DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cantidad_consumida DECIMAL(10,2) NOT NULL DEFAULT 1.00,
  modo_cobertura ENUM('contrato','extra') NOT NULL DEFAULT 'contrato',
  monto_cubierto DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  monto_cobrado_extra DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  usuario_id BIGINT UNSIGNED NULL,
  observaciones VARCHAR(255) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_contrato_consumo_detalle (cotizacion_detalle_id),
  KEY idx_contrato_consumos_contrato (contrato_paciente_id),
  KEY idx_contrato_consumos_servicio (contrato_paciente_servicio_id),
  CONSTRAINT fk_contrato_consumos_contrato FOREIGN KEY (contrato_paciente_id) REFERENCES contratos_paciente(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_contrato_consumos_servicio FOREIGN KEY (contrato_paciente_servicio_id) REFERENCES contratos_paciente_servicios(id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
