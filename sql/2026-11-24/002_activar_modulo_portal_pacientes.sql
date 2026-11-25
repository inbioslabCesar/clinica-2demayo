-- 2026-11-24 | Activa el módulo 'portal_pacientes' en ESTA clínica | DATOS/CONFIGURACIÓN (1 fila)
-- Ejecutar solo en las clínicas que contraten el portal del paciente, DESPUÉS de crear las tablas (001 o el actualizador de esquema).
-- Alternativa: activarlo desde el panel Engineer (Módulos). No viaja en el build: es un cambio en la BD de cada clínica.
-- Idempotente: si la fila ya existe solo la deja habilitada, sin tocar plan, precio ni fechas.

INSERT INTO `modulos_instalacion` (`modulo`, `habilitado`, `estado`)
VALUES ('portal_pacientes', 1, 'activo')
ON DUPLICATE KEY UPDATE `habilitado` = 1;

-- Opcional (los valores por defecto ya son estos): liberación automática y bloqueo por deuda activado.
INSERT IGNORE INTO `paciente_portal_config` (`clave`, `valor`) VALUES
  ('modo_liberacion', 'automatico'),
  ('bloquear_deuda', '1');
