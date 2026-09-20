-- Seed idempotente: crea 3 examenes uniformes para flujo de Heces Seriado.
-- Base: clona parametros del examen existente "EXA. PARASITOLOGICO EN HECES SIMPLE (UNA MUESTRA)".

SET @base_nombre_like := '%PARASITOLOGICO%HECES%SIMPLE%MUESTRA%';

SET @base_id := (
    SELECT el.id
    FROM examenes_laboratorio el
    WHERE UPPER(TRIM(el.nombre)) LIKE UPPER(@base_nombre_like)
    ORDER BY el.id ASC
    LIMIT 1
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

-- Verificacion
SELECT
    id,
    nombre,
    categoria,
    activo
FROM examenes_laboratorio
WHERE UPPER(nombre) LIKE 'EXA. PARASITOLOGICO EN HECES SERIADO - MUESTRA %'
ORDER BY id ASC;