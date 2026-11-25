-- 2026-11-24 | Verificación (SOLO LECTURA) del portal del paciente.
-- 1) Deben existir las 4 tablas.
SELECT TABLE_NAME FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME LIKE 'paciente\_portal\_%' ORDER BY TABLE_NAME;
-- 2) Estado del módulo en esta clínica (habilitado = 1 solo donde se contrató).
SELECT modulo, habilitado, estado, fecha_fin FROM modulos_instalacion WHERE modulo = 'portal_pacientes';
-- 3) Opciones vigentes (sin filas = valores por defecto: modo automático y bloqueo por deuda).
SELECT clave, valor FROM paciente_portal_config ORDER BY clave;
-- 4) Accesos creados y último ingreso.
SELECT COUNT(*) AS accesos, SUM(estado = 'activo') AS activos, MAX(ultimo_login_at) AS ultimo_login FROM paciente_portal_accesos;
