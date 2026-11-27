-- 2026-11-26 | Seguimiento clínico (fase 2): registro de accesos a historiales | SOLO ADITIVO (1 tabla nueva)
-- Qué hace: crea seguimiento_clinico_accesos, donde queda constancia de quién abrió el historial (o el detalle de una consulta) de qué paciente.
-- El médico puede consultar pacientes de toda la clínica; este registro es la contrapartida de privacidad. No toca tablas existentes.
-- Es seguro repetirlo (CREATE TABLE IF NOT EXISTS). El código también la crea al primer uso, pero conviene aplicarla antes de activar el módulo.
-- IMPORTANTE (no viaja en el build): se aplica a la BD de cada clínica (actualizador de esquema o este script).

CREATE TABLE IF NOT EXISTS seguimiento_clinico_accesos (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  fecha_hora DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  rol VARCHAR(20) NOT NULL,
  medico_id INT NULL,
  usuario_id INT NULL,
  actor_nombre VARCHAR(150) NULL,
  paciente_id INT NOT NULL,
  consulta_id INT NULL,
  accion VARCHAR(30) NOT NULL,
  ip VARCHAR(45) NULL,
  PRIMARY KEY (id),
  KEY idx_sca_paciente (paciente_id, fecha_hora),
  KEY idx_sca_medico (medico_id, fecha_hora),
  KEY idx_sca_fecha (fecha_hora)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
