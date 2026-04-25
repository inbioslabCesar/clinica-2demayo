-- Tabla para gestión de tratamientos prescritos por el médico y ejecutados por enfermería.
-- Se crea automáticamente al guardar una Historia Clínica con receta o indicaciones.
--
-- Flujo de estados:
--   pendiente -> en_ejecucion -> completado
--   en_ejecucion -> suspendido  (si el médico edita la HC mientras enfermería la aplica)
--
CREATE TABLE IF NOT EXISTS tratamientos_enfermeria (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    consulta_id     INT          NOT NULL COMMENT 'FK a consultas.id',
    paciente_id     INT          NOT NULL COMMENT 'Copia desnormalizada para consultas rápidas',
    receta_snapshot JSON                  COMMENT 'Copia de historia_clinica.datos.receta al momento del guardado',
    tratamiento_texto TEXT                COMMENT 'Copia de historia_clinica.datos.tratamiento',
    estado          ENUM('pendiente','en_ejecucion','completado','suspendido') NOT NULL DEFAULT 'pendiente',
  version_num     INT          NOT NULL DEFAULT 1 COMMENT 'Versión incremental por consulta',
  origen_tratamiento_id INT     NULL COMMENT 'ID de tratamiento del cual deriva la nueva versión',
    creado_en       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Momento del guardado del HC',
    iniciado_en     DATETIME     NULL     COMMENT 'Cuando enfermería abre el registro',
    completado_en   DATETIME     NULL     COMMENT 'Cuando enfermería confirma administración',
    notas_enfermeria TEXT        NULL     COMMENT 'Observaciones de la enfermera al administrar',
    INDEX idx_te_estado      (estado),
    INDEX idx_te_paciente    (paciente_id),
  INDEX idx_te_consulta_version (consulta_id, version_num),
    INDEX idx_te_creado      (creado_en),
    CONSTRAINT fk_te_consulta FOREIGN KEY (consulta_id) REFERENCES consultas(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Tratamientos prescritos en HC que deben ser ejecutados por enfermería';
