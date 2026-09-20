-- Seed idempotente: crea paquete de laboratorio Heces Seriado con 3 muestras.
-- Requiere que existan los examenes:
-- EXA. PARASITOLOGICO EN HECES SERIADO - MUESTRA 1/2/3

START TRANSACTION;

SET @codigo_paquete := 'PAK-HECES-SERIADO';
SET @nombre_paquete := 'HECES SERIADO (3 MUESTRAS)';

SET @id_m1 := (
  SELECT id FROM examenes_laboratorio
  WHERE UPPER(TRIM(nombre)) = 'EXA. PARASITOLOGICO EN HECES SERIADO - MUESTRA 1'
  LIMIT 1
);
SET @id_m2 := (
  SELECT id FROM examenes_laboratorio
  WHERE UPPER(TRIM(nombre)) = 'EXA. PARASITOLOGICO EN HECES SERIADO - MUESTRA 2'
  LIMIT 1
);
SET @id_m3 := (
  SELECT id FROM examenes_laboratorio
  WHERE UPPER(TRIM(nombre)) = 'EXA. PARASITOLOGICO EN HECES SERIADO - MUESTRA 3'
  LIMIT 1
);

-- Crear paquete solo si no existe por codigo.
INSERT INTO paquetes_perfiles (
  codigo,
  nombre,
  descripcion,
  estado,
  tipo,
  moneda,
  precio_global_venta,
  modo_precio,
  permite_descuento_adicional,
  vigencia_desde,
  vigencia_hasta,
  meta,
  created_by,
  updated_by
)
SELECT
  @codigo_paquete,
  @nombre_paquete,
  'Perfil seriado de parasitologico en heces con 3 muestras independientes.',
  'activo',
  'paquete',
  'PEN',
  ROUND(COALESCE((SELECT precio_publico FROM examenes_laboratorio WHERE id = @id_m1), 0)
      + COALESCE((SELECT precio_publico FROM examenes_laboratorio WHERE id = @id_m2), 0)
      + COALESCE((SELECT precio_publico FROM examenes_laboratorio WHERE id = @id_m3), 0), 2),
  'fijo_global',
  1,
  CURDATE(),
  NULL,
  JSON_OBJECT('seed', 'heces_seriado_3_muestras'),
  NULL,
  NULL
WHERE @id_m1 IS NOT NULL AND @id_m2 IS NOT NULL AND @id_m3 IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM paquetes_perfiles p WHERE UPPER(TRIM(p.codigo)) = UPPER(@codigo_paquete)
  );

SET @paquete_id := (
  SELECT id FROM paquetes_perfiles WHERE UPPER(TRIM(codigo)) = UPPER(@codigo_paquete) LIMIT 1
);

-- Limpiar items previos del paquete para mantener uniformidad idempotente.
DELETE FROM paquetes_perfiles_items WHERE paquete_id = @paquete_id;

INSERT INTO paquetes_perfiles_items (
  paquete_id,
  item_orden,
  source_type,
  source_id,
  medico_id,
  descripcion_snapshot,
  cantidad,
  precio_lista_snapshot,
  subtotal_snapshot,
  es_derivado,
  laboratorio_referencia,
  tipo_derivacion,
  valor_derivacion,
  reglas_json,
  activo
)
SELECT
  @paquete_id,
  x.item_orden,
  'laboratorio',
  x.exam_id,
  NULL,
  x.descripcion,
  1.00,
  x.precio,
  x.precio,
  0,
  NULL,
  NULL,
  NULL,
  NULL,
  1
FROM (
  SELECT 1 AS item_orden,
         @id_m1 AS exam_id,
         'EXA. PARASITOLOGICO EN HECES SERIADO - MUESTRA 1' AS descripcion,
         COALESCE((SELECT precio_publico FROM examenes_laboratorio WHERE id = @id_m1), 0) AS precio
  UNION ALL
  SELECT 2,
         @id_m2,
         'EXA. PARASITOLOGICO EN HECES SERIADO - MUESTRA 2',
         COALESCE((SELECT precio_publico FROM examenes_laboratorio WHERE id = @id_m2), 0)
  UNION ALL
  SELECT 3,
         @id_m3,
         'EXA. PARASITOLOGICO EN HECES SERIADO - MUESTRA 3',
         COALESCE((SELECT precio_publico FROM examenes_laboratorio WHERE id = @id_m3), 0)
) x
WHERE @paquete_id IS NOT NULL
  AND x.exam_id IS NOT NULL;

COMMIT;

SELECT
  p.id,
  p.codigo,
  p.nombre,
  p.precio_global_venta,
  p.estado,
  COUNT(i.id) AS total_items
FROM paquetes_perfiles p
LEFT JOIN paquetes_perfiles_items i ON i.paquete_id = p.id
WHERE UPPER(TRIM(p.codigo)) = UPPER(@codigo_paquete)
GROUP BY p.id, p.codigo, p.nombre, p.precio_global_venta, p.estado;

SELECT
  i.item_orden,
  i.source_id AS examen_id,
  i.descripcion_snapshot,
  i.precio_lista_snapshot,
  i.subtotal_snapshot
FROM paquetes_perfiles_items i
WHERE i.paquete_id = @paquete_id
ORDER BY i.item_orden ASC;