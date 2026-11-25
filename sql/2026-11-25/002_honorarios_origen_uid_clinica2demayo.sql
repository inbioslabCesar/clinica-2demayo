-- 2026-11-25 | SOLO clinica2demayo (u330560936_bd2DeMayo)
-- Alinea honorarios_por_cobrar con el resto de clientes: columna origen_uid + indice unico uk_hpc_origen_uid.
-- Version segura de 2026-09-28_honorarios_por_cobrar_origen_uid.sql: NO borra duplicados.
-- Verificado antes de aplicar: 16 filas, 0 grupos duplicados, uid maximo 90 caracteres.
-- Requiere respaldo previo. Idempotente.

ALTER TABLE honorarios_por_cobrar
  ADD COLUMN IF NOT EXISTS origen_uid VARCHAR(191) NULL;

UPDATE honorarios_por_cobrar
SET origen_uid = CASE
  WHEN COALESCE(consulta_id, 0) > 0 THEN
    CONCAT('cot:', cotizacion_id, '|con:', COALESCE(consulta_id, 0), '|tar:', COALESCE(tarifa_id, 0),
           '|med:', COALESCE(medico_id, 0), '|tip:', LOWER(TRIM(COALESCE(tipo_servicio, ''))))
  ELSE
    CONCAT('cot:', cotizacion_id, '|pac:', COALESCE(paciente_id, 0), '|tar:', COALESCE(tarifa_id, 0),
           '|med:', COALESCE(medico_id, 0), '|tip:', LOWER(TRIM(COALESCE(tipo_servicio, ''))),
           '|dsha:', SHA1(LOWER(TRIM(COALESCE(descripcion, '')))))
END
WHERE origen_uid IS NULL OR TRIM(origen_uid) = '';

-- Comprobaciones (deben dar 0 / sin filas antes de continuar):
-- SELECT COUNT(*) FROM honorarios_por_cobrar WHERE origen_uid IS NULL OR origen_uid = '';
-- SELECT origen_uid, COUNT(*) c FROM honorarios_por_cobrar GROUP BY origen_uid HAVING c > 1;

ALTER TABLE honorarios_por_cobrar MODIFY COLUMN origen_uid VARCHAR(191) NOT NULL;
ALTER TABLE honorarios_por_cobrar ADD UNIQUE KEY IF NOT EXISTS uk_hpc_origen_uid (origen_uid);

-- Verificacion:
-- SELECT COUNT(*) total, SUM(origen_uid IS NOT NULL AND origen_uid <> '') con_uid FROM honorarios_por_cobrar;
-- SHOW INDEX FROM honorarios_por_cobrar WHERE Key_name = 'uk_hpc_origen_uid';
