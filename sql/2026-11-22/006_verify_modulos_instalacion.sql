-- 2026-11-22 | Verificación (SOLO LECTURA) del módulo de licencias por instalación.
-- Debe devolver 3 filas: clinico=1, ocupacional=0, portal_empresas=0 (salvo que ya se hayan activado).
SELECT modulo, habilitado, estado, plan, fecha_fin FROM modulos_instalacion ORDER BY id;
SELECT COUNT(*) AS filas_historial FROM modulos_instalacion_historial;
