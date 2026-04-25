-- ============================================================
-- Migracion 12: extender estados de agenda para flujo operativo
-- Fecha: 2026-04-19
-- ============================================================

ALTER TABLE agenda_contrato
  MODIFY COLUMN estado_evento ENUM(
    'pendiente',
    'confirmado',
    'atendido',
    'reprogramado',
    'cancelado',
    'espontaneo',
    'no_asistio_justificado'
  ) NOT NULL DEFAULT 'pendiente';

-- Verificacion rapida
SHOW COLUMNS FROM agenda_contrato LIKE 'estado_evento';
