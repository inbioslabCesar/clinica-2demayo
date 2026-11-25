-- 2026-11-25 · Reevaluación (Fase 1)
-- Reevaluación = continuación de la MISMA atención (máx. 7 días desde su creación).
-- Se distingue de "Próxima cita" (nuevo seguimiento, nueva consulta/HC).
-- Idempotente: se puede ejecutar más de una vez.
-- No altera tablas existentes: consultas.origen_creacion es VARCHAR(20) y 'hc_reevaluacion' (15) cabe.

CREATE TABLE IF NOT EXISTS hc_reevaluaciones (
  id                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  consulta_origen_id      INT NOT NULL,
  hc_id                   INT NOT NULL,
  paciente_id             INT NOT NULL,
  medico_id               INT NOT NULL,
  reevaluacion_previa_id  BIGINT UNSIGNED NULL,
  fecha_sugerida          DATE NOT NULL,
  hora_sugerida           TIME NULL,
  sin_hora_fija           TINYINT(1) NOT NULL DEFAULT 0,
  fecha_limite            DATE NOT NULL,
  tipo_motivo             VARCHAR(24) NOT NULL DEFAULT 'resultados',
  motivo                  VARCHAR(255) NULL,
  estado                  VARCHAR(20) NOT NULL DEFAULT 'pendiente',
  abierta                 TINYINT(1) NULL DEFAULT 1,
  consulta_visita_id      INT NULL,
  es_control              TINYINT(1) NOT NULL DEFAULT 1,
  estado_gestion          VARCHAR(30) NOT NULL DEFAULT 'pendiente',
  observacion_gestion     TEXT NULL,
  intentos                INT NOT NULL DEFAULT 0,
  fecha_proximo_contacto  DATETIME NULL,
  fecha_ultimo_contacto   DATETIME NULL,
  llegada_en              DATETIME NULL,
  inicio_en               DATETIME NULL,
  cierre_en               DATETIME NULL,
  motivo_cierre           VARCHAR(255) NULL,
  creado_por              INT NULL,
  actualizado_por         INT NULL,
  created_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_hcr_abierta (consulta_origen_id, abierta),
  KEY idx_hcr_medico_estado_fecha (medico_id, estado, fecha_sugerida),
  KEY idx_hcr_estado_fecha (estado, fecha_sugerida),
  KEY idx_hcr_paciente_estado (paciente_id, estado),
  KEY idx_hcr_hc (hc_id),
  KEY idx_hcr_visita (consulta_visita_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS hc_reevaluaciones_eventos (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  reevaluacion_id  BIGINT UNSIGNED NOT NULL,
  accion           VARCHAR(30) NOT NULL,
  estado_anterior  VARCHAR(20) NULL,
  estado_nuevo     VARCHAR(20) NULL,
  detalle          TEXT NULL,
  usuario_id       INT NULL,
  usuario_rol      VARCHAR(40) NULL,
  usuario_nombre   VARCHAR(120) NULL,
  ip               VARCHAR(45) NULL,
  creado_en        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_hcre_reev (reevaluacion_id, creado_en)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
