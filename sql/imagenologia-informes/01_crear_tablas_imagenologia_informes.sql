-- ============================================================================
-- MÓDULO: Informes Clínicos de Imagenología
-- DESCRIPCIÓN: Tablas para almacenamiento de informes de imagenología con
--              trazabilidad a órdenes, consultas e historia clínica
-- FECHA: 2026-06-23
-- ============================================================================

-- ── Tabla: imagenologia_plantillas ─────────────────────────────────────────
-- Almacena plantillas estándar para diferentes tipos de exámenes (ecografía,
-- rayos X, tomografía, etc.) con estructura JSON de secciones y campos dinámicos
-- ============================================================================

CREATE TABLE IF NOT EXISTS imagenologia_plantillas (
  id INT PRIMARY KEY AUTO_INCREMENT,
  
  -- Identificación de la plantilla
  nombre VARCHAR(255) NOT NULL,                    -- "Ecografía Obstétrica", "Rayos X Tórax", etc.
  tipo_examen VARCHAR(50) NOT NULL,                -- 'ecografia', 'rayosx', 'tomografia'
  descripcion TEXT,                                -- Descripción adicional
  
  -- Estructura de secciones (JSON array)
  -- Formato: { "sections": [{ "id": "hallazgos", "nombre": "Hallazgos", 
  --           "campos": [{ "id": "higado", "label": "Hígado", "type": "textarea" }] }]}
  estructura_json JSON NOT NULL,
  
  -- Control
  es_activa TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- Índices
  UNIQUE KEY uk_tipo_nombre (tipo_examen, nombre),
  INDEX idx_tipo (tipo_examen),
  INDEX idx_activa (es_activa)
  
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Tabla: imagenologia_informes ──────────────────────────────────────────
-- Almacena los informes redactados por médicos con trazabilidad completa
-- a órdenes, exámenes, consultas e historia clínica
-- ============================================================================

CREATE TABLE IF NOT EXISTS imagenologia_informes (
  id INT PRIMARY KEY AUTO_INCREMENT,
  
  -- Trazabilidad jerárquica (garantiza 1:1 informe por examen)
  orden_imagen_id INT NOT NULL UNIQUE,              -- FK → ordenes_imagen.id
  cotizacion_id INT,                                -- Desnormalización para acceso rápido
  paciente_id INT NOT NULL,
  consulta_id INT,                                  -- Para vincular a historia_clinica
  historia_clinica_id INT,                          -- FK directo a historia_clinica.id si existe
  
  -- Datos del informe
  medico_id INT NOT NULL,                           -- Médico que redactó el informe
  titulo VARCHAR(500),                              -- Ej: "ECOGRAFÍA ABDOMINAL COMPLETA"
  
  -- Contenido del informe
  -- Formato: { "hallazgos": "...", "conclusion": "...", ...otros campos por plantilla }
  contenido_json JSON NOT NULL,
  
  -- Metadatos de plantilla utilizada
  plantilla_json JSON,                              -- Snapshot de plantilla usada (para auditoría)
  
  -- Estado del informe
  estado ENUM('borrador', 'completado', 'archivado') DEFAULT 'borrador',
  
  -- Fechas de edición
  fecha_redaccion DATETIME,
  fecha_ultima_edicion DATETIME,
  
  -- PDF generado
  pdf_path VARCHAR(500),                            -- Ruta relativa a /uploads/informes_imagenologia/
  pdf_generado_at DATETIME,
  
  -- Auditoría
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- Índices para acceso rápido
  INDEX idx_orden_imagen_id (orden_imagen_id),
  INDEX idx_consulta_id (consulta_id),
  INDEX idx_paciente_id (paciente_id),
  INDEX idx_medico_id (medico_id),
  INDEX idx_estado (estado),
  INDEX idx_historia_clinica_id (historia_clinica_id)
  
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Tabla: imagenologia_informes_historial ───────────────────────────────
-- Auditoría: registra todos los cambios realizados a informes
-- Permite rastrear ediciones y revertir si es necesario
-- ============================================================================

CREATE TABLE IF NOT EXISTS imagenologia_informes_historial (
  id INT PRIMARY KEY AUTO_INCREMENT,
  
  -- Referencia al informe
  informe_id INT NOT NULL,
  
  -- Versión y cambios
  version INT NOT NULL DEFAULT 1,
  contenido_anterior JSON,                          -- Estado anterior
  contenido_nuevo JSON,                             -- Estado nuevo
  cambios_resumen TEXT,                             -- Descripción breve del cambio
  
  -- Quién hizo el cambio
  usuario_id INT NOT NULL,
  usuario_nombre VARCHAR(255),
  
  -- Tipo de cambio
  tipo_cambio ENUM(
    'redaccion_inicial',
    'edicion_contenido',
    'cambio_estado',
    'generacion_pdf',
    'archivado'
  ) DEFAULT 'edicion_contenido',
  
  -- Auditoría
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Índices
  INDEX idx_informe_id (informe_id),
  INDEX idx_usuario_id (usuario_id),
  INDEX idx_tipo_cambio (tipo_cambio),
  INDEX idx_created_at (created_at),
  
  FOREIGN KEY (informe_id) REFERENCES imagenologia_informes(id) 
    ON DELETE CASCADE ON UPDATE CASCADE
  
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- FIN DE CREACIÓN DE TABLAS PARA IMAGENOLOGIA_INFORMES
-- ============================================================================
