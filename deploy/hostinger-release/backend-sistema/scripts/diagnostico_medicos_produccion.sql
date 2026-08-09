-- Diagnóstico de solo lectura para ejecutar en phpMyAdmin de producción.
-- No modifica médicos ni condiciones de pago.
-- Base de datos de producción Nutrimend Perú.
SET @base_datos := 'u330560936_nutrimed_bd';

SELECT VERSION() AS version_mysql, @base_datos AS base_diagnosticada, DATABASE() AS base_seleccionada, @@sql_mode AS sql_mode;

SELECT
        table_name,
        engine,
        table_collation,
        table_rows
FROM information_schema.tables
WHERE table_schema = @base_datos
    AND table_name IN ('medicos', 'medico_condiciones_pago');

SELECT
        table_name,
        column_name,
        column_type,
        is_nullable,
        column_default
FROM information_schema.columns
WHERE table_schema = @base_datos
    AND table_name IN ('medicos', 'medico_condiciones_pago')
ORDER BY table_name, ordinal_position;

SET @tiene_condiciones := EXISTS(
    SELECT 1
    FROM information_schema.tables
        WHERE table_schema = @base_datos
      AND table_name = 'medico_condiciones_pago'
);

SET @sql_correos := IF(
    @tiene_condiciones,
    CONCAT('SELECT m.id, CONCAT_WS('' '', m.nombre, m.apellido) AS medico, m.email, HEX(m.email) AS email_hex, c.id AS condicion_id, c.modalidad_pago, c.frecuencia_pago, c.vigencia_desde, c.activo FROM `', @base_datos, '`.medicos AS m LEFT JOIN `', @base_datos, '`.medico_condiciones_pago AS c ON c.medico_id = m.id AND c.activo = 1 WHERE m.email LIKE ''%xn--%'' OR m.email LIKE ''%clínica%'' OR m.email LIKE ''%nutrimed%'' ORDER BY m.id'),
    CONCAT('SELECT m.id, CONCAT_WS('' '', m.nombre, m.apellido) AS medico, m.email, HEX(m.email) AS email_hex, ''Falta medico_condiciones_pago'' AS diagnostico FROM `', @base_datos, '`.medicos AS m WHERE m.email LIKE ''%xn--%'' OR m.email LIKE ''%clínica%'' OR m.email LIKE ''%nutrimed%'' ORDER BY m.id')
);
PREPARE consulta_correos FROM @sql_correos;
EXECUTE consulta_correos;
DEALLOCATE PREPARE consulta_correos;

SET @sql_duplicados := IF(
    @tiene_condiciones,
    CONCAT('SELECT medico_id, activo, COUNT(*) AS cantidad FROM `', @base_datos, '`.medico_condiciones_pago GROUP BY medico_id, activo HAVING COUNT(*) > 1'),
    'SELECT ''Falta medico_condiciones_pago'' AS diagnostico'
);
PREPARE consulta_duplicados FROM @sql_duplicados;
EXECUTE consulta_duplicados;
DEALLOCATE PREPARE consulta_duplicados;