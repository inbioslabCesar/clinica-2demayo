-- ============================================================================
-- SEED: Plantillas Estándar de Informes de Imagenología
-- DESCRIPCIÓN: Plantillas iniciales para ecografía, rayos X y tomografía
--              con estructura de secciones y campos dinámicos
-- FECHA: 2026-06-23
-- ============================================================================

SET NAMES utf8mb4;
SET character_set_client = utf8mb4;
SET character_set_connection = utf8mb4;
SET character_set_results = utf8mb4;

-- Limpiar plantillas existentes (solo en desarrollo)
DELETE FROM imagenologia_plantillas WHERE tipo_examen IN ('ecografia', 'rayosx', 'tomografia');

-- ── Plantilla: Ecografía General ──────────────────────────────────────────
INSERT INTO imagenologia_plantillas (
  nombre, 
  tipo_examen, 
  descripcion,
  estructura_json,
  es_activa
) VALUES (
  'Ecografía General',
  'ecografia',
  'Plantilla estándar para informes de ecografía abdominal y general',
  JSON_OBJECT(
    'sections', JSON_ARRAY(
      JSON_OBJECT(
        'id', 'hallazgos',
        'nombre', 'Hallazgos',
        'campos', JSON_ARRAY(
          JSON_OBJECT(
            'id', 'higado',
            'label', 'Hígado',
            'type', 'textarea',
            'placeholder', 'Describe ecoestructura, tamaño, contornos, lesiones...',
            'required', FALSE
          ),
          JSON_OBJECT(
            'id', 'vesicula',
            'label', 'Vesícula Biliar',
            'type', 'textarea',
            'placeholder', 'Describe cálculos, engrosamiento, dilatación de vías...',
            'required', FALSE
          ),
          JSON_OBJECT(
            'id', 'pancreas',
            'label', 'Páncreas',
            'type', 'textarea',
            'placeholder', 'Describe ecoestructura, tamaño, conducto pancreático...',
            'required', FALSE
          ),
          JSON_OBJECT(
            'id', 'riñones',
            'label', 'Riñones',
            'type', 'textarea',
            'placeholder', 'Describe ambos riñones, cortical, pelvis, cálculos...',
            'required', FALSE
          ),
          JSON_OBJECT(
            'id', 'bazo',
            'label', 'Bazo',
            'type', 'textarea',
            'placeholder', 'Describe tamaño, contorno, ecoestructura...',
            'required', FALSE
          )
        )
      ),
      JSON_OBJECT(
        'id', 'conclusion',
        'nombre', 'Conclusión',
        'campos', JSON_ARRAY(
          JSON_OBJECT(
            'id', 'resumen_final',
            'label', 'Resumen y Conclusión',
            'type', 'textarea',
            'placeholder', 'Resumen de hallazgos, conclusión y recomendaciones...',
            'required', TRUE
          )
        )
      )
    )
  ),
  1
);

-- ── Plantilla: Ecografía Obstétrica ──────────────────────────────────────
INSERT INTO imagenologia_plantillas (
  nombre, 
  tipo_examen, 
  descripcion,
  estructura_json,
  es_activa
) VALUES (
  'Ecografía Obstétrica',
  'ecografia',
  'Plantilla especializada para ecografía de embarazo',
  JSON_OBJECT(
    'sections', JSON_ARRAY(
      JSON_OBJECT(
        'id', 'gestacion',
        'nombre', 'Datos de Gestación',
        'campos', JSON_ARRAY(
          JSON_OBJECT(
            'id', 'edad_gestacional',
            'label', 'Edad Gestacional',
            'type', 'text',
            'placeholder', 'Ej: 20 semanas y 3 días',
            'required', TRUE
          ),
          JSON_OBJECT(
            'id', 'numero_fetos',
            'label', 'Número de Fetos',
            'type', 'number',
            'required', TRUE
          )
        )
      ),
      JSON_OBJECT(
        'id', 'hallazgos_biometria',
        'nombre', 'Biometría Fetal',
        'campos', JSON_ARRAY(
          JSON_OBJECT(
            'id', 'biometria_detalles',
            'label', 'Medidas Biométricas',
            'type', 'textarea',
            'placeholder', 'DBP, LCC, AC, LF, según edad gestacional...',
            'required', TRUE
          )
        )
      ),
      JSON_OBJECT(
        'id', 'hallazgos_generales',
        'nombre', 'Hallazgos Generales',
        'campos', JSON_ARRAY(
          JSON_OBJECT(
            'id', 'placenta',
            'label', 'Placenta',
            'type', 'textarea',
            'placeholder', 'Localización, grado de madurez, aspecto...',
            'required', FALSE
          ),
          JSON_OBJECT(
            'id', 'liquido_amniotico',
            'label', 'Líquido Amniótico',
            'type', 'textarea',
            'placeholder', 'Volumen, claridad, presencia de sedimento...',
            'required', FALSE
          ),
          JSON_OBJECT(
            'id', 'cordón_umbilical',
            'label', 'Cordón Umbilical',
            'type', 'textarea',
            'placeholder', 'Número de vasos, inserciones, nudos...',
            'required', FALSE
          ),
          JSON_OBJECT(
            'id', 'anomalias',
            'label', 'Anomalías',
            'type', 'textarea',
            'placeholder', 'Presencia de anomalías fetales, si aplica...',
            'required', FALSE
          )
        )
      ),
      JSON_OBJECT(
        'id', 'conclusion',
        'nombre', 'Conclusión',
        'campos', JSON_ARRAY(
          JSON_OBJECT(
            'id', 'resumen_final',
            'label', 'Conclusión',
            'type', 'textarea',
            'placeholder', 'Resumen del estudio y recomendaciones...',
            'required', TRUE
          )
        )
      )
    )
  ),
  1
);

-- ── Plantilla: Rayos X de Tórax ─────────────────────────────────────────
INSERT INTO imagenologia_plantillas (
  nombre, 
  tipo_examen, 
  descripcion,
  estructura_json,
  es_activa
) VALUES (
  'Rayos X de Tórax',
  'rayosx',
  'Plantilla estándar para radiografía de tórax',
  JSON_OBJECT(
    'sections', JSON_ARRAY(
      JSON_OBJECT(
        'id', 'hallazgos_tecnica',
        'nombre', 'Técnica y Posición',
        'campos', JSON_ARRAY(
          JSON_OBJECT(
            'id', 'posicion_tecnica',
            'label', 'Posición y Técnica',
            'type', 'textarea',
            'placeholder', 'PA, lateral, decúbito, portátil, etc.',
            'required', TRUE
          )
        )
      ),
      JSON_OBJECT(
        'id', 'hallazgos_campos',
        'nombre', 'Hallazgos por Campos',
        'campos', JSON_ARRAY(
          JSON_OBJECT(
            'id', 'mediastino',
            'label', 'Mediastino',
            'type', 'textarea',
            'placeholder', 'Tamaño, contorno, silueta cardíaca...',
            'required', FALSE
          ),
          JSON_OBJECT(
            'id', 'hilios_vasculares',
            'label', 'Hilios Vasculares',
            'type', 'textarea',
            'placeholder', 'Tamaño, contorno, transparencia...',
            'required', FALSE
          ),
          JSON_OBJECT(
            'id', 'campos_pulmonares',
            'label', 'Campos Pulmonares',
            'type', 'textarea',
            'placeholder', 'Transparencia, infiltrados, consolidaciones...',
            'required', FALSE
          ),
          JSON_OBJECT(
            'id', 'bases_pulmonares',
            'label', 'Bases Pulmonares',
            'type', 'textarea',
            'placeholder', 'Presencia de derrames, atelectasias...',
            'required', FALSE
          )
        )
      ),
      JSON_OBJECT(
        'id', 'conclusion',
        'nombre', 'Conclusión',
        'campos', JSON_ARRAY(
          JSON_OBJECT(
            'id', 'resumen_final',
            'label', 'Conclusión',
            'type', 'textarea',
            'placeholder', 'Hallazgos relevantes y conclusión final...',
            'required', TRUE
          )
        )
      )
    )
  ),
  1
);

-- ── Plantilla: Tomografía General ───────────────────────────────────────
INSERT INTO imagenologia_plantillas (
  nombre, 
  tipo_examen, 
  descripcion,
  estructura_json,
  es_activa
) VALUES (
  'Tomografía General',
  'tomografia',
  'Plantilla estándar para informes de tomografía computarizada',
  JSON_OBJECT(
    'sections', JSON_ARRAY(
      JSON_OBJECT(
        'id', 'tecnica_protocolo',
        'nombre', 'Técnica y Protocolo',
        'campos', JSON_ARRAY(
          JSON_OBJECT(
            'id', 'protocolo_utilizado',
            'label', 'Protocolo de Exploración',
            'type', 'textarea',
            'placeholder', 'Tipo de cortes, contraste usado, técnica helicoidal, etc.',
            'required', TRUE
          )
        )
      ),
      JSON_OBJECT(
        'id', 'hallazgos',
        'nombre', 'Hallazgos',
        'campos', JSON_ARRAY(
          JSON_OBJECT(
            'id', 'hallazgos_detalles',
            'label', 'Descripción de Hallazgos',
            'type', 'textarea',
            'placeholder', 'Lesiones, masas, inflamación, anatomía anormal...',
            'required', FALSE
          ),
          JSON_OBJECT(
            'id', 'mediciones',
            'label', 'Mediciones Relevantes',
            'type', 'textarea',
            'placeholder', 'Tamaños de lesiones, diámetros, ubicación por nivel de corte...',
            'required', FALSE
          )
        )
      ),
      JSON_OBJECT(
        'id', 'conclusion',
        'nombre', 'Conclusión',
        'campos', JSON_ARRAY(
          JSON_OBJECT(
            'id', 'resumen_final',
            'label', 'Conclusión y Recomendaciones',
            'type', 'textarea',
            'placeholder', 'Diagnóstico radiológico y recomendaciones de seguimiento...',
            'required', TRUE
          )
        )
      )
    )
  ),
  1
);

-- ============================================================================
-- FIN DE SEED DE PLANTILLAS
-- ============================================================================
