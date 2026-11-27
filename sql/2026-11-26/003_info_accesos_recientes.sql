-- 2026-11-26 | Informativo (SOLO LECTURA): accesos recientes a historiales desde Seguimiento clínico (últimos 100).
SELECT a.fecha_hora, a.rol, COALESCE(a.actor_nombre, '') AS actor, a.paciente_id, a.consulta_id, a.accion, a.ip
FROM seguimiento_clinico_accesos a
ORDER BY a.id DESC
LIMIT 100;
