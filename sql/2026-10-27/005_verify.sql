-- 005_verify.sql
-- Verificación rápida post-aplicación

SHOW TABLES LIKE 'agenda_reprogramaciones_auditoria';
SHOW TABLES LIKE 'laboratorio_procesamiento_anticipado_auditoria';
SHOW TABLES LIKE 'triaje_procesamiento_anticipado_auditoria';

SHOW COLUMNS FROM triaje LIKE 'creado_por_id';
SHOW COLUMNS FROM triaje LIKE 'creado_por_rol';
SHOW COLUMNS FROM triaje LIKE 'creado_por_nombre';
SHOW COLUMNS FROM triaje LIKE 'actualizado_por_id';
SHOW COLUMNS FROM triaje LIKE 'actualizado_por_rol';
SHOW COLUMNS FROM triaje LIKE 'actualizado_por_nombre';
SHOW COLUMNS FROM triaje LIKE 'origen_registro';

