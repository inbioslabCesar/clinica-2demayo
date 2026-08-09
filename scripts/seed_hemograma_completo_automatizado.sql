-- Crea el examen una sola vez. Ajuste los precios segun el tarifario de la clinica.
SET @nombre_examen := 'HEMOGRAMA COMPLETO AUTOMATIZADO';

INSERT INTO examenes_laboratorio (
    nombre,
    categoria,
    metodologia,
    valores_referenciales,
    precio_publico,
    precio_convenio,
    tipo_tubo,
    tipo_frasco,
    tiempo_resultado,
    condicion_paciente,
    preanalitica,
    activo
)
SELECT
    @nombre_examen,
    'Hematologia',
    'Analizador hematologico automatizado',
    JSON_ARRAY(
        JSON_OBJECT('tipo', 'Titulo', 'nombre', 'HEMOGRAMA COMPLETO AUTOMATIZADO', 'negrita', TRUE, 'cursiva', TRUE, 'alineacion', 'left', 'orden', 1),
        JSON_OBJECT('tipo', 'Parametro', 'nombre', 'HEMOGLOBINA', 'codigo_interno', 'hemoglobina', 'unidad', 'g/dL', 'decimales', 1, 'referencias', JSON_ARRAY(
            JSON_OBJECT('valor_min', '13.5', 'valor_max', '17.5', 'sexo', 'masculino', 'edad_min', '18', 'edad_max', '', 'desc', 'Hombres'),
            JSON_OBJECT('valor_min', '12.3', 'valor_max', '15.3', 'sexo', 'femenino', 'edad_min', '18', 'edad_max', '', 'desc', 'Mujeres')
        ), 'orden', 2),
        JSON_OBJECT('tipo', 'Parametro', 'nombre', 'HEMATOCRITO', 'codigo_interno', 'hematocrito', 'unidad', '%', 'decimales', 1, 'referencias', JSON_ARRAY(
            JSON_OBJECT('valor_min', '40', 'valor_max', '54', 'sexo', 'masculino', 'edad_min', '18', 'edad_max', '', 'desc', 'Hombres'),
            JSON_OBJECT('valor_min', '36', 'valor_max', '48', 'sexo', 'femenino', 'edad_min', '18', 'edad_max', '', 'desc', 'Mujeres')
        ), 'orden', 3),
        JSON_OBJECT('tipo', 'Subtitulo', 'nombre', 'RECUENTO CELULAR', 'negrita', TRUE, 'orden', 4),
        JSON_OBJECT('tipo', 'Parametro', 'nombre', 'R_GLOBULOS_BLANCOS', 'codigo_interno', 'r_globulos_blancos', 'unidad', 'cel/mm^3', 'decimales', 0, 'referencias', JSON_ARRAY(JSON_OBJECT('valor_min', '5000', 'valor_max', '10000', 'sexo', 'cualquiera', 'edad_min', '18', 'edad_max', '', 'desc', 'Adultos')), 'orden', 5),
        JSON_OBJECT('tipo', 'Parametro', 'nombre', 'R_GLOBULOS_ROJOS', 'codigo_interno', 'r_globulos_rojos', 'unidad', 'x10^6/uL', 'decimales', 2, 'referencias', JSON_ARRAY(
            JSON_OBJECT('valor_min', '4.5', 'valor_max', '5.9', 'sexo', 'masculino', 'edad_min', '18', 'edad_max', '', 'desc', 'Hombres'),
            JSON_OBJECT('valor_min', '4.0', 'valor_max', '5.2', 'sexo', 'femenino', 'edad_min', '18', 'edad_max', '', 'desc', 'Mujeres')
        ), 'orden', 6),
        JSON_OBJECT('tipo', 'Parametro', 'nombre', 'PLAQUETAS', 'codigo_interno', 'plaquetas', 'unidad', 'cel/mm^3', 'decimales', 0, 'referencias', JSON_ARRAY(JSON_OBJECT('valor_min', '150000', 'valor_max', '450000', 'sexo', 'cualquiera', 'edad_min', '18', 'edad_max', '', 'desc', 'Adultos')), 'orden', 7),
        JSON_OBJECT('tipo', 'Subtitulo', 'nombre', 'CONSTANTES CORPUSCULARES', 'negrita', TRUE, 'orden', 8),
        JSON_OBJECT('tipo', 'Parametro', 'nombre', 'VCM', 'codigo_interno', 'vcm', 'unidad', 'fL', 'decimales', 1, 'referencias', JSON_ARRAY(JSON_OBJECT('valor_min', '80', 'valor_max', '100', 'sexo', 'cualquiera', 'edad_min', '18', 'edad_max', '', 'desc', 'Adultos')), 'orden', 9),
        JSON_OBJECT('tipo', 'Parametro', 'nombre', 'HCM', 'codigo_interno', 'hcm', 'unidad', 'pg', 'decimales', 1, 'referencias', JSON_ARRAY(JSON_OBJECT('valor_min', '25', 'valor_max', '33', 'sexo', 'cualquiera', 'edad_min', '18', 'edad_max', '', 'desc', 'Adultos')), 'orden', 10),
        JSON_OBJECT('tipo', 'Parametro', 'nombre', 'CHCM', 'codigo_interno', 'chcm', 'unidad', 'g/dL', 'decimales', 1, 'referencias', JSON_ARRAY(JSON_OBJECT('valor_min', '32', 'valor_max', '36', 'sexo', 'cualquiera', 'edad_min', '18', 'edad_max', '', 'desc', 'Adultos')), 'orden', 11),
        JSON_OBJECT('tipo', 'Parametro', 'nombre', 'RDW-CV', 'codigo_interno', 'rdw_cv', 'unidad', '%', 'decimales', 1, 'referencias', JSON_ARRAY(JSON_OBJECT('valor_min', '11.5', 'valor_max', '14.5', 'sexo', 'cualquiera', 'edad_min', '18', 'edad_max', '', 'desc', 'Adultos')), 'orden', 12),
        JSON_OBJECT('tipo', 'Subtitulo', 'nombre', 'FORMULA DIFERENCIAL PORCENTUAL', 'negrita', TRUE, 'orden', 13),
        JSON_OBJECT('tipo', 'Parametro', 'nombre', 'ABASTONADOS', 'codigo_interno', 'abastonados', 'unidad', '%', 'decimales', 1, 'referencias', JSON_ARRAY(JSON_OBJECT('valor_min', '0', 'valor_max', '5', 'sexo', 'cualquiera', 'edad_min', '18', 'edad_max', '', 'desc', 'Adultos')), 'orden', 14),
        JSON_OBJECT('tipo', 'Parametro', 'nombre', 'SEGMENTADOS', 'codigo_interno', 'segmentados', 'unidad', '%', 'decimales', 1, 'referencias', JSON_ARRAY(JSON_OBJECT('valor_min', '40', 'valor_max', '60', 'sexo', 'cualquiera', 'edad_min', '18', 'edad_max', '', 'desc', 'Adultos')), 'orden', 15),
        JSON_OBJECT('tipo', 'Parametro', 'nombre', 'LINFOCITOS', 'codigo_interno', 'linfocitos', 'unidad', '%', 'decimales', 1, 'referencias', JSON_ARRAY(JSON_OBJECT('valor_min', '20', 'valor_max', '40', 'sexo', 'cualquiera', 'edad_min', '18', 'edad_max', '', 'desc', 'Adultos')), 'orden', 16),
        JSON_OBJECT('tipo', 'Parametro', 'nombre', 'MONOCITOS', 'codigo_interno', 'monocitos', 'unidad', '%', 'decimales', 1, 'referencias', JSON_ARRAY(JSON_OBJECT('valor_min', '2', 'valor_max', '8', 'sexo', 'cualquiera', 'edad_min', '18', 'edad_max', '', 'desc', 'Adultos')), 'orden', 17),
        JSON_OBJECT('tipo', 'Parametro', 'nombre', 'EOSINOFILOS', 'codigo_interno', 'eosinofilos', 'unidad', '%', 'decimales', 1, 'referencias', JSON_ARRAY(JSON_OBJECT('valor_min', '0', 'valor_max', '4', 'sexo', 'cualquiera', 'edad_min', '18', 'edad_max', '', 'desc', 'Adultos')), 'orden', 18),
        JSON_OBJECT('tipo', 'Parametro', 'nombre', 'BASOFILOS', 'codigo_interno', 'basofilos', 'unidad', '%', 'decimales', 1, 'referencias', JSON_ARRAY(JSON_OBJECT('valor_min', '0', 'valor_max', '1', 'sexo', 'cualquiera', 'edad_min', '18', 'edad_max', '', 'desc', 'Adultos')), 'orden', 19),
        JSON_OBJECT('tipo', 'Subtitulo', 'nombre', 'FORMULA DIFERENCIAL ABSOLUTA', 'negrita', TRUE, 'orden', 20),
        JSON_OBJECT('tipo', 'Parametro', 'nombre', 'ABASTONADOS_ABS', 'codigo_interno', 'abastonados_abs', 'unidad', 'cel/mm^3', 'decimales', 1, 'referencias', JSON_ARRAY(JSON_OBJECT('valor_min', '0', 'valor_max', '350', 'sexo', 'cualquiera', 'edad_min', '18', 'edad_max', '', 'desc', 'Adultos')), 'orden', 21),
        JSON_OBJECT('tipo', 'Parametro', 'nombre', 'SEGMENTADOS_ABS', 'codigo_interno', 'segmentados_abs', 'unidad', 'cel/mm^3', 'decimales', 1, 'referencias', JSON_ARRAY(JSON_OBJECT('valor_min', '1800', 'valor_max', '7700', 'sexo', 'cualquiera', 'edad_min', '18', 'edad_max', '', 'desc', 'Adultos')), 'orden', 22),
        JSON_OBJECT('tipo', 'Parametro', 'nombre', 'LINFOCITOS_ABS', 'codigo_interno', 'linfocitos_abs', 'unidad', 'cel/mm^3', 'decimales', 1, 'referencias', JSON_ARRAY(JSON_OBJECT('valor_min', '1000', 'valor_max', '4800', 'sexo', 'cualquiera', 'edad_min', '18', 'edad_max', '', 'desc', 'Adultos')), 'orden', 23),
        JSON_OBJECT('tipo', 'Parametro', 'nombre', 'MONOCITOS_ABS', 'codigo_interno', 'monocitos_abs', 'unidad', 'cel/mm^3', 'decimales', 1, 'referencias', JSON_ARRAY(JSON_OBJECT('valor_min', '200', 'valor_max', '800', 'sexo', 'cualquiera', 'edad_min', '18', 'edad_max', '', 'desc', 'Adultos')), 'orden', 24),
        JSON_OBJECT('tipo', 'Parametro', 'nombre', 'EOSINOFILOS_ABS', 'codigo_interno', 'eosinofilos_abs', 'unidad', 'cel/mm^3', 'decimales', 1, 'referencias', JSON_ARRAY(JSON_OBJECT('valor_min', '0', 'valor_max', '500', 'sexo', 'cualquiera', 'edad_min', '18', 'edad_max', '', 'desc', 'Adultos')), 'orden', 25),
        JSON_OBJECT('tipo', 'Parametro', 'nombre', 'BASOFILOS_ABS', 'codigo_interno', 'basofilos_abs', 'unidad', 'cel/mm^3', 'decimales', 1, 'referencias', JSON_ARRAY(JSON_OBJECT('valor_min', '0', 'valor_max', '200', 'sexo', 'cualquiera', 'edad_min', '18', 'edad_max', '', 'desc', 'Adultos')), 'orden', 26),
        JSON_OBJECT('tipo', 'Texto Largo', 'nombre', 'OBSERVACIONES', 'codigo_interno', 'observaciones', 'rows', 3, 'orden', 27)
    ),
    NULL,
    NULL,
    'Tubo con EDTA',
    '',
    '2 a 4 horas',
    'Ayuno no requerido',
    'Mezclar suavemente el tubo con EDTA. Procesar la muestra dentro de las 6 horas posteriores a la toma.',
    1
WHERE NOT EXISTS (
    SELECT 1
    FROM examenes_laboratorio
    WHERE UPPER(TRIM(nombre)) = @nombre_examen COLLATE utf8mb4_general_ci
);

SELECT id, nombre, activo
FROM examenes_laboratorio
WHERE UPPER(TRIM(nombre)) = @nombre_examen COLLATE utf8mb4_general_ci;