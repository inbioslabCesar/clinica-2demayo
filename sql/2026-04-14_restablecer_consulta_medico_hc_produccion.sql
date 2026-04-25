-- =====================================================
-- RESTABLECER CONSULTA / MEDICO / HC (PRODUCCION)
-- Caso validado en dump:
--   cotizacion_id = 7
--   detalle_consulta_id = 16
--   paciente_id = 7
--   medico_id = 2
--   consulta_id objetivo = 4
-- =====================================================

START TRANSACTION;

-- Parametros del caso
SET @paciente_id := 7;
SET @medico_id := 2;
SET @cotizacion_id := 7;
SET @detalle_id := 16;
SET @consulta_id := 4;
SET @fecha_consulta := '2026-04-14';
SET @hora_consulta := '09:00:00';

-- 1) Asegurar que la consulta exista
INSERT INTO consultas (
	id,
	paciente_id,
	medico_id,
	fecha,
	hora,
	estado,
	tipo_consulta,
	clasificacion,
	triaje_realizado,
	cobro_id,
	es_reprogramada,
	reprogramada_en,
	hc_origen_id,
	origen_creacion,
	es_control
)
SELECT
	@consulta_id,
	@paciente_id,
	@medico_id,
	@fecha_consulta,
	@hora_consulta,
	'pendiente',
	'programada',
	'No urgente',
	1,
	NULL,
	0,
	NULL,
	NULL,
	'cotizador',
	0
FROM dual
WHERE NOT EXISTS (
	SELECT 1 FROM consultas c WHERE c.id = @consulta_id
);

-- 2) Corregir llaves principales de la consulta (si ya existe)
UPDATE consultas
SET
	paciente_id = @paciente_id,
	medico_id = @medico_id,
	fecha = @fecha_consulta,
	hora = @hora_consulta,
	origen_creacion = 'cotizador'
WHERE id = @consulta_id;

-- 3) Restablecer vinculo detalle de cotizacion -> consulta + medico
UPDATE cotizaciones_detalle
SET
	consulta_id = @consulta_id,
	medico_id = @medico_id,
	estado_item = 'activo'
WHERE id = @detalle_id
	AND cotizacion_id = @cotizacion_id;

-- 4) No se inserta ni altera contenido de historia clinica en este script.
--    Solo se valida al final que exista registro HC vinculado a @consulta_id.

-- 5) Hacer visible en panel del medico (panel filtra solo_activas=1)
--    Solo cambia a pendiente si actualmente esta completada/cancelada
--    y no existe otra consulta activa del mismo medico en misma fecha/hora.
UPDATE consultas c
SET c.estado = 'pendiente'
WHERE c.id = @consulta_id
	AND LOWER(TRIM(COALESCE(c.estado, ''))) IN ('completada', 'cancelada')
	AND NOT EXISTS (
		SELECT 1
		FROM consultas c2
		WHERE c2.id <> c.id
			AND c2.medico_id = c.medico_id
			AND c2.fecha = c.fecha
			AND c2.hora = c.hora
			AND LOWER(TRIM(COALESCE(c2.estado, ''))) NOT IN ('cancelada', 'completada')
	);

COMMIT;

-- -------------------------
-- Verificacion post-ejecucion
-- -------------------------
SELECT
	c.id,
	c.paciente_id,
	c.medico_id,
	c.fecha,
	c.hora,
	c.estado,
	c.tipo_consulta,
	c.origen_creacion
FROM consultas c
WHERE c.id = @consulta_id;

SELECT
	cd.id,
	cd.cotizacion_id,
	cd.servicio_tipo,
	cd.consulta_id,
	cd.medico_id,
	cd.estado_item
FROM cotizaciones_detalle cd
WHERE cd.id = @detalle_id;

SELECT
	hc.id,
	hc.consulta_id,
	hc.fecha_registro
FROM historia_clinica hc
WHERE hc.consulta_id = @consulta_id
ORDER BY hc.id DESC;

SELECT
	c.id,
	c.estado,
	c.fecha,
	c.hora,
	p.nombre AS paciente,
	m.nombre AS medico
FROM consultas c
LEFT JOIN pacientes p ON p.id = c.paciente_id
LEFT JOIN medicos m ON m.id = c.medico_id
WHERE c.medico_id = @medico_id
	AND LOWER(TRIM(COALESCE(c.estado, ''))) NOT IN ('cancelada', 'completada')
ORDER BY c.fecha DESC, c.hora DESC;
