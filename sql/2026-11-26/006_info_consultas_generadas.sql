-- 2026-11-26 | Informativo (SOLO LECTURA): consultas generadas desde Seguimiento clínico y su modo (últimas 100).
-- Útil para auditar las exoneraciones (sin_cobro): quién las aplicó y con qué motivo.
SELECT s.fecha_hora, s.modo, s.consulta_id, s.cotizacion_id, s.paciente_id, s.medico_id, COALESCE(s.creado_por_nombre, '') AS creado_por, COALESCE(s.motivo, '') AS motivo
FROM seguimiento_clinico_consultas s
ORDER BY s.id DESC
LIMIT 100;
