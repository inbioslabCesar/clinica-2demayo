-- 2026-11-26 | Seguimiento clínico (fase 3): consultas generadas desde el Panel del Médico | SOLO ADITIVO (1 tabla nueva)
-- Qué hace: crea seguimiento_clinico_consultas, que enlaza cada consulta generada desde Seguimiento clínico con su cotización y guarda
--   - modo: 'con_cobro' (cotización pendiente en recepción) o 'sin_cobro' (cotización EXONERADA, sin cobro ni honorario),
--   - motivo (obligatorio en sin_cobro), médico responsable y quién/cuándo/desde dónde,
--   - client_request_id: llave de idempotencia por médico (un doble clic o reintento no duplica consulta ni cotización).
-- No toca tablas existentes. Es seguro repetirlo (CREATE TABLE IF NOT EXISTS).
-- IMPORTANTE (no viaja en el build): se aplica a la BD de cada clínica (actualizador de esquema o este script) antes de activar el módulo.

CREATE TABLE IF NOT EXISTS seguimiento_clinico_consultas (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  consulta_id INT NOT NULL,
  cotizacion_id INT NOT NULL,
  paciente_id INT NOT NULL,
  medico_id INT NOT NULL,
  modo VARCHAR(12) NOT NULL,
  motivo VARCHAR(255) NULL,
  client_request_id VARCHAR(64) NOT NULL,
  creado_por_nombre VARCHAR(150) NULL,
  ip VARCHAR(45) NULL,
  fecha_hora DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_scc_consulta (consulta_id),
  UNIQUE KEY uq_scc_solicitud (medico_id, client_request_id),
  KEY idx_scc_cotizacion (cotizacion_id),
  KEY idx_scc_paciente (paciente_id, fecha_hora),
  KEY idx_scc_modo (modo, fecha_hora)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
