-- Seed idempotente: crea o corrige 3 examenes uniformes para flujo de Heces Seriado.
-- Importante: evita tomar como base examenes de inmunocromatografia (H. pylori, sangre oculta, rotavirus).

-- Si conoces el id exacto del examen base (por ejemplo EXAMEN DE HECES SIMPLE), colocalo aqui.
-- Dejar en NULL para auto-deteccion segura.
SET @base_id_forzado := NULL;
SET @base_id := NULL;

-- 0) Prioridad absoluta: base forzada
SET @base_id := (
        SELECT el.id
        FROM examenes_laboratorio el
        WHERE @base_id_forzado IS NOT NULL
            AND @base_id_forzado > 0
            AND el.id = @base_id_forzado
        LIMIT 1
);

-- 1) Preferencia: examen de heces simple en area parasitologia y metodologia manual/microscopica
SET @base_id := COALESCE(
        @base_id,
        (
                SELECT el.id
                FROM examenes_laboratorio el
                WHERE UPPER(TRIM(el.nombre)) LIKE '%HECES%'
                    AND UPPER(TRIM(el.nombre)) LIKE '%SIMPLE%'
                    AND UPPER(TRIM(COALESCE(el.categoria, ''))) LIKE '%PARASITO%'
                    AND (
                                UPPER(TRIM(COALESCE(el.metodologia, ''))) LIKE '%MANUAL%'
                                OR UPPER(TRIM(COALESCE(el.metodologia, ''))) LIKE '%MICROSCOP%'
                            )
                    AND UPPER(TRIM(el.nombre)) NOT LIKE '%SERIADO%'
                    AND UPPER(TRIM(el.nombre)) NOT LIKE '%PYLORI%'
                    AND UPPER(TRIM(el.nombre)) NOT LIKE '%SANGRE%'
                    AND UPPER(TRIM(el.nombre)) NOT LIKE '%ROTAVIRUS%'
                ORDER BY el.id ASC
                LIMIT 1
        )
);

-- 2) Fallback controlado: heces + simple, excluyendo inmunocromatografia por nombre/metodologia
SET @base_id := COALESCE(
        @base_id,
        (
                SELECT el.id
                FROM examenes_laboratorio el
                WHERE UPPER(TRIM(el.nombre)) LIKE '%HECES%'
                    AND UPPER(TRIM(el.nombre)) LIKE '%SIMPLE%'
                    AND UPPER(TRIM(el.nombre)) NOT LIKE '%SERIADO%'
                    AND UPPER(TRIM(el.nombre)) NOT LIKE '%PYLORI%'
                    AND UPPER(TRIM(el.nombre)) NOT LIKE '%SANGRE%'
                    AND UPPER(TRIM(el.nombre)) NOT LIKE '%ROTAVIRUS%'
                    AND UPPER(TRIM(COALESCE(el.metodologia, ''))) NOT LIKE '%INMUNOCROMAT%'
                ORDER BY el.id ASC
                LIMIT 1
        )
);

-- Si no existe examen base, no inserta nada.
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
    CONCAT('EXA. PARASITOLOGICO EN HECES SERIADO - MUESTRA ', muestras.n) AS nombre,
    COALESCE(base.categoria, 'Laboratorio') AS categoria,
    COALESCE(base.metodologia, '') AS metodologia,
    COALESCE(base.valores_referenciales, '[]') AS valores_referenciales,
    COALESCE(base.precio_publico, 0) AS precio_publico,
    COALESCE(base.precio_convenio, 0) AS precio_convenio,
    COALESCE(base.tipo_tubo, '') AS tipo_tubo,
    COALESCE(base.tipo_frasco, '') AS tipo_frasco,
    COALESCE(base.tiempo_resultado, '') AS tiempo_resultado,
    COALESCE(base.condicion_paciente, '') AS condicion_paciente,
    COALESCE(base.preanalitica, '') AS preanalitica,
    1 AS activo
FROM (
    SELECT 1 AS n
    UNION ALL SELECT 2
    UNION ALL SELECT 3
) AS muestras
CROSS JOIN examenes_laboratorio base
WHERE @base_id IS NOT NULL
    AND base.id = @base_id
    AND NOT EXISTS (
            SELECT 1
            FROM examenes_laboratorio ex
            WHERE UPPER(TRIM(ex.nombre)) = UPPER(CONCAT('EXA. PARASITOLOGICO EN HECES SERIADO - MUESTRA ', muestras.n))
    );

-- Si ya existen los examenes seriados, los corrige en sitio (mantiene IDs y referencias)
UPDATE examenes_laboratorio t
JOIN examenes_laboratorio base ON base.id = @base_id
SET
        t.categoria = COALESCE(base.categoria, t.categoria),
        t.metodologia = COALESCE(base.metodologia, t.metodologia),
        t.valores_referenciales = COALESCE(base.valores_referenciales, t.valores_referenciales),
        t.precio_publico = COALESCE(base.precio_publico, t.precio_publico),
        t.precio_convenio = COALESCE(base.precio_convenio, t.precio_convenio),
        t.tipo_tubo = COALESCE(base.tipo_tubo, t.tipo_tubo),
        t.tipo_frasco = COALESCE(base.tipo_frasco, t.tipo_frasco),
        t.tiempo_resultado = COALESCE(base.tiempo_resultado, t.tiempo_resultado),
        t.condicion_paciente = COALESCE(base.condicion_paciente, t.condicion_paciente),
        t.preanalitica = COALESCE(base.preanalitica, t.preanalitica),
        t.activo = 1
WHERE @base_id IS NOT NULL
    AND UPPER(TRIM(t.nombre)) IN (
            'EXA. PARASITOLOGICO EN HECES SERIADO - MUESTRA 1',
            'EXA. PARASITOLOGICO EN HECES SERIADO - MUESTRA 2',
            'EXA. PARASITOLOGICO EN HECES SERIADO - MUESTRA 3'
    );

-- Verificacion
SELECT
    id,
    nombre,
    categoria,
    metodologia,
    activo
FROM examenes_laboratorio
WHERE UPPER(nombre) LIKE 'EXA.%HECES%SERIADO%MUESTRA %'
ORDER BY id ASC;

-- Diagnostico rapido para produccion: confirma base usada y candidatos de heces
SELECT @base_id AS base_id_usado;

SELECT id, nombre, categoria, activo
FROM examenes_laboratorio
WHERE UPPER(nombre) LIKE '%HECES%'
ORDER BY id ASC
LIMIT 30;

-- Diagnostico extra: posibles bases recomendadas
SELECT id, nombre, categoria, metodologia, activo
FROM examenes_laboratorio
WHERE UPPER(TRIM(nombre)) LIKE '%HECES%'
    AND UPPER(TRIM(nombre)) LIKE '%SIMPLE%'
    AND UPPER(TRIM(nombre)) NOT LIKE '%SERIADO%'
ORDER BY id ASC
LIMIT 20;