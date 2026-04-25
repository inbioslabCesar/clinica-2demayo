-- Migracion idempotente para produccion: tratamientos multidia + optimizaciones.
-- Ejecutar sobre una base existente sin perder datos.

SET NAMES utf8mb4;

-- 1) Crear tablas si no existen (estructura actual)
CREATE TABLE IF NOT EXISTS tratamientos_enfermeria_items (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tratamiento_id INT NOT NULL,
    item_idx INT NOT NULL DEFAULT 0 COMMENT 'Posicion del item en receta_snapshot',
    medicamento_codigo VARCHAR(64) NULL,
    medicamento_nombre VARCHAR(255) NOT NULL,
    dosis_texto VARCHAR(255) NULL,
    frecuencia_texto VARCHAR(255) NULL,
    frecuencia_tipo VARCHAR(32) NULL COMMENT 'intervalo_horas|veces_dia|horarios_fijos|prn',
    frecuencia_valor INT NULL COMMENT 'Horas o veces segun frecuencia_tipo',
    frecuencia_horas_json JSON NULL COMMENT 'Lista de HH:MM para horarios fijos',
    duracion_texto VARCHAR(255) NULL,
    duracion_valor INT NULL COMMENT 'Valor numerico estructurado',
    duracion_unidad VARCHAR(16) NULL COMMENT 'dias|semanas',
    duracion_dias INT NOT NULL DEFAULT 1,
    observaciones TEXT NULL,
    iniciado_en DATETIME NULL COMMENT 'Inicio real por medicamento',
    completado_en DATETIME NULL COMMENT 'Cierre por medicamento',
    orden INT NOT NULL DEFAULT 0,
    creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_te_items_tratamiento (tratamiento_id),
    INDEX idx_te_items_orden (tratamiento_id, orden),
    INDEX idx_te_items_codigo (medicamento_codigo),
    INDEX idx_te_items_inicio (tratamiento_id, iniciado_en, completado_en),
    CONSTRAINT fk_te_items_tratamiento
      FOREIGN KEY (tratamiento_id) REFERENCES tratamientos_enfermeria(id)
      ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tratamientos_ejecucion_diaria (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tratamiento_id INT NOT NULL,
    tratamiento_item_id BIGINT UNSIGNED NOT NULL,
    dia_nro INT NOT NULL,
    fecha_programada DATE NOT NULL,
    dosis_planificadas INT NOT NULL DEFAULT 1,
    dosis_administradas INT NOT NULL DEFAULT 0,
    estado_dia ENUM('pendiente','parcial','completo','omitido') NOT NULL DEFAULT 'pendiente',
    notas_dia TEXT NULL,
    actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_te_dia_item (tratamiento_item_id, dia_nro),
    INDEX idx_te_dia_tratamiento_estado (tratamiento_id, estado_dia),
    INDEX idx_te_dia_tratamiento_numero (tratamiento_id, dia_nro),
    INDEX idx_te_dia_fecha (fecha_programada),
    INDEX idx_te_dia_item_estado (tratamiento_item_id, estado_dia),
    CONSTRAINT fk_te_dia_tratamiento
      FOREIGN KEY (tratamiento_id) REFERENCES tratamientos_enfermeria(id)
      ON DELETE CASCADE,
    CONSTRAINT fk_te_dia_item
      FOREIGN KEY (tratamiento_item_id) REFERENCES tratamientos_enfermeria_items(id)
      ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tratamientos_ejecucion_dosis (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tratamiento_id INT NOT NULL,
    tratamiento_item_id BIGINT UNSIGNED NOT NULL,
    ejecucion_diaria_id BIGINT UNSIGNED NOT NULL,
    dia_nro INT NOT NULL,
    dosis_nro INT NOT NULL DEFAULT 1,
    fecha_hora_programada DATETIME NOT NULL COMMENT 'Hora exacta calculada desde el inicio real',
    estado_dosis ENUM('pendiente','administrada','omitida') NOT NULL DEFAULT 'pendiente',
    fecha_hora_ejecucion DATETIME NULL,
    observacion TEXT NULL,
    creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_te_dosis_item_dia_nro (tratamiento_item_id, dia_nro, dosis_nro),
    INDEX idx_te_dosis_tratamiento_fecha (tratamiento_id, fecha_hora_programada),
    INDEX idx_te_dosis_diaria_estado (ejecucion_diaria_id, estado_dosis),
    INDEX idx_te_dosis_item_estado_fecha (tratamiento_item_id, estado_dosis, fecha_hora_programada),
    CONSTRAINT fk_te_dosis_tratamiento
      FOREIGN KEY (tratamiento_id) REFERENCES tratamientos_enfermeria(id)
      ON DELETE CASCADE,
    CONSTRAINT fk_te_dosis_item
      FOREIGN KEY (tratamiento_item_id) REFERENCES tratamientos_enfermeria_items(id)
      ON DELETE CASCADE,
    CONSTRAINT fk_te_dosis_diaria
      FOREIGN KEY (ejecucion_diaria_id) REFERENCES tratamientos_ejecucion_diaria(id)
      ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tratamientos_ejecucion_eventos (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    ejecucion_diaria_id BIGINT UNSIGNED NOT NULL,
    tratamiento_id INT NOT NULL,
    dosis_programada_id BIGINT UNSIGNED NULL,
    tipo_evento ENUM('administrada','omitida','reprogramada','observacion') NOT NULL DEFAULT 'administrada',
    cantidad DECIMAL(10,2) NOT NULL DEFAULT 1.00,
    fecha_hora_evento DATETIME NOT NULL,
    usuario_id INT NULL,
    observacion TEXT NULL,
    metadata_json JSON NULL,
    creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_te_evt_dia_fecha (ejecucion_diaria_id, fecha_hora_evento),
    INDEX idx_te_evt_trat_fecha (tratamiento_id, fecha_hora_evento),
    INDEX idx_te_evt_usuario_fecha (usuario_id, fecha_hora_evento),
    INDEX idx_te_evt_dosis (dosis_programada_id),
    CONSTRAINT fk_te_evt_dia
      FOREIGN KEY (ejecucion_diaria_id) REFERENCES tratamientos_ejecucion_diaria(id)
      ON DELETE CASCADE,
    CONSTRAINT fk_te_evt_trat
      FOREIGN KEY (tratamiento_id) REFERENCES tratamientos_enfermeria(id)
      ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2) Asegurar columnas e indices en instalaciones previas
-- Version compatible con hosting compartido (sin routines ni consultas a information_schema).

ALTER TABLE tratamientos_enfermeria_items
  ADD COLUMN IF NOT EXISTS iniciado_en DATETIME NULL AFTER observaciones,
  ADD COLUMN IF NOT EXISTS completado_en DATETIME NULL AFTER iniciado_en;

ALTER TABLE tratamientos_enfermeria_items
  ADD INDEX IF NOT EXISTS idx_te_items_inicio (tratamiento_id, iniciado_en, completado_en);

ALTER TABLE tratamientos_ejecucion_diaria
  ADD INDEX IF NOT EXISTS idx_te_dia_item_estado (tratamiento_item_id, estado_dia);

ALTER TABLE tratamientos_ejecucion_dosis
  ADD INDEX IF NOT EXISTS idx_te_dosis_item_estado_fecha (tratamiento_item_id, estado_dosis, fecha_hora_programada);

-- Indices de cabecera para listado y filtros del API
ALTER TABLE tratamientos_enfermeria
  ADD INDEX IF NOT EXISTS idx_te_estado_creado (estado, creado_en),
  ADD INDEX IF NOT EXISTS idx_te_paciente_estado (paciente_id, estado),
  ADD INDEX IF NOT EXISTS idx_te_consulta (consulta_id);

-- 3) Verificacion rapida (sin information_schema)
SHOW COLUMNS FROM tratamientos_enfermeria_items LIKE 'iniciado_en';
SHOW COLUMNS FROM tratamientos_enfermeria_items LIKE 'completado_en';

SHOW INDEX FROM tratamientos_enfermeria_items WHERE Key_name = 'idx_te_items_inicio';
SHOW INDEX FROM tratamientos_ejecucion_diaria WHERE Key_name = 'idx_te_dia_item_estado';
SHOW INDEX FROM tratamientos_ejecucion_dosis WHERE Key_name = 'idx_te_dosis_item_estado_fecha';
SHOW INDEX FROM tratamientos_enfermeria WHERE Key_name = 'idx_te_estado_creado';
SHOW INDEX FROM tratamientos_enfermeria WHERE Key_name = 'idx_te_paciente_estado';
SHOW INDEX FROM tratamientos_enfermeria WHERE Key_name = 'idx_te_consulta';
