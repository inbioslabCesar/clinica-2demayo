-- HEMOGRAMA COMPLETO (crear o actualizar) - listo para ejecutar en produccion
-- Compatibilidad: MySQL 5.7+ / MariaDB con funciones JSON
SET NAMES utf8mb4;
START TRANSACTION;

SET @nombre_examen := 'HEMOGRAMA COMPLETO';
-- OPCIONAL: forzar actualizacion por id exacto en produccion.
-- Ejemplo: SET @examen_id_fijo := 3;
SET @examen_id_fijo := NULL;

SET @valores_referenciales := JSON_ARRAY(
  JSON_OBJECT('tipo','Titulo','nombre','EXAMEN : HEMOGRAMA COMPLETO','negrita',TRUE,'orden',1),

  JSON_OBJECT(
    'tipo','Parametro','nombre','RECUENTO DE ERITROCITOS','codigo_interno','recuento_eritrocitos',
    'unidad','/ mm3','decimales',0,'orden',2,
    'referencias',JSON_ARRAY(
      JSON_OBJECT('valor_min','4500000','valor_max','5200000','sexo','masculino','edad_min','','edad_max','','desc','H'),
      JSON_OBJECT('valor_min','4000000','valor_max','4600000','sexo','femenino','edad_min','','edad_max','','desc','M')
    )
  ),
  JSON_OBJECT(
    'tipo','Parametro','nombre','RECUENTO DE LEUCOCITOS','codigo_interno','recuento_leucocitos',
    'unidad','/ mm3','decimales',0,'orden',3,
    'referencias',JSON_ARRAY(
      JSON_OBJECT('valor_min','4000','valor_max','10000','sexo','cualquiera','edad_min','','edad_max','','desc','General')
    )
  ),
  JSON_OBJECT(
    'tipo','Parametro','nombre','RECUENTO DE PLAQUETAS','codigo_interno','recuento_plaquetas',
    'unidad','/ mm3','decimales',0,'orden',4,
    'referencias',JSON_ARRAY(
      JSON_OBJECT('valor_min','150000','valor_max','400000','sexo','cualquiera','edad_min','','edad_max','','desc','General')
    )
  ),
  JSON_OBJECT(
    'tipo','Parametro','nombre','HEMOGLOBINA','codigo_interno','hemoglobina',
    'unidad','g/dl','decimales',1,'negrita',TRUE,'orden',5,
    'referencias',JSON_ARRAY(
      JSON_OBJECT('valor_min','14.0','valor_max','16.0','sexo','masculino','edad_min','','edad_max','','desc','H'),
      JSON_OBJECT('valor_min','12.0','valor_max','14.0','sexo','femenino','edad_min','','edad_max','','desc','M')
    )
  ),
  JSON_OBJECT(
    'tipo','Parametro','nombre','HEMATOCRITO','codigo_interno','hematocrito',
    'unidad','%','decimales',1,'negrita',TRUE,'orden',6,
    'referencias',JSON_ARRAY(
      JSON_OBJECT('valor_min','40','valor_max','45','sexo','masculino','edad_min','','edad_max','','desc','H'),
      JSON_OBJECT('valor_min','37','valor_max','45','sexo','femenino','edad_min','','edad_max','','desc','M')
    )
  ),

  JSON_OBJECT('tipo','Subtitulo','nombre','FORMULA LEUCOCITARIA ( RELATIVA)','negrita',TRUE,'orden',7),

  JSON_OBJECT(
    'tipo','Parametro','nombre','Neutrofilos','codigo_interno','neutrofilos_rel',
    'unidad','%','decimales',0,'orden',8,
    'referencias',JSON_ARRAY(JSON_OBJECT('valor_min','50','valor_max','70','sexo','cualquiera','edad_min','','edad_max','','desc','General'))
  ),
  JSON_OBJECT('tipo','Parametro','nombre','Promielocitos','codigo_interno','promielocitos_rel','unidad','%','decimales',0,'orden',9,'referencias',JSON_ARRAY()),
  JSON_OBJECT('tipo','Parametro','nombre','Mielocitos','codigo_interno','mielocitos_rel','unidad','%','decimales',0,'orden',10,'referencias',JSON_ARRAY()),
  JSON_OBJECT('tipo','Parametro','nombre','Metamielocitos','codigo_interno','metamielocitos_rel','unidad','%','decimales',0,'orden',11,'referencias',JSON_ARRAY()),
  JSON_OBJECT(
    'tipo','Parametro','nombre','Abastonados','codigo_interno','abastonados_rel',
    'unidad','%','decimales',0,'orden',12,
    'referencias',JSON_ARRAY(JSON_OBJECT('valor_min','0','valor_max','5','sexo','cualquiera','edad_min','','edad_max','','desc','General'))
  ),
  JSON_OBJECT(
    'tipo','Parametro','nombre','Segmentados','codigo_interno','segmentados_rel',
    'unidad','%','decimales',0,'orden',13,
    'referencias',JSON_ARRAY(JSON_OBJECT('valor_min','50','valor_max','70','sexo','cualquiera','edad_min','','edad_max','','desc','General'))
  ),
  JSON_OBJECT(
    'tipo','Parametro','nombre','Eosinofilos','codigo_interno','eosinofilos_rel',
    'unidad','%','decimales',0,'orden',14,
    'referencias',JSON_ARRAY(JSON_OBJECT('valor_min','0','valor_max','4','sexo','cualquiera','edad_min','','edad_max','','desc','General'))
  ),
  JSON_OBJECT(
    'tipo','Parametro','nombre','Basofilos','codigo_interno','basofilos_rel',
    'unidad','%','decimales',0,'orden',15,
    'referencias',JSON_ARRAY(JSON_OBJECT('valor_min','0','valor_max','1','sexo','cualquiera','edad_min','','edad_max','','desc','General'))
  ),
  JSON_OBJECT(
    'tipo','Parametro','nombre','Monocitos','codigo_interno','monocitos_rel',
    'unidad','%','decimales',0,'orden',16,
    'referencias',JSON_ARRAY(JSON_OBJECT('valor_min','0','valor_max','5','sexo','cualquiera','edad_min','','edad_max','','desc','General'))
  ),
  JSON_OBJECT(
    'tipo','Parametro','nombre','Linfocitos','codigo_interno','linfocitos_rel',
    'unidad','%','decimales',0,'orden',17,
    'referencias',JSON_ARRAY(JSON_OBJECT('valor_min','20','valor_max','40','sexo','cualquiera','edad_min','','edad_max','','desc','General'))
  ),
  JSON_OBJECT('tipo','Parametro','nombre','Linfocitos atipicos','codigo_interno','linfocitos_atipicos_rel','unidad','%','decimales',0,'orden',18,'referencias',JSON_ARRAY()),

  JSON_OBJECT('tipo','Subtitulo','nombre','FORMULA LEUCOCITARIA ( ABSOLUTA)','negrita',TRUE,'orden',19),

  JSON_OBJECT(
    'tipo','Parametro','nombre','Neutrofilos','codigo_interno','neutrofilos_abs',
    'unidad','/ mm3','decimales',0,'formula','recuento_leucocitos * neutrofilos_rel / 100','orden',20,
    'referencias',JSON_ARRAY(JSON_OBJECT('valor_min','3000','valor_max','7000','sexo','cualquiera','edad_min','','edad_max','','desc','General'))
  ),
  JSON_OBJECT(
    'tipo','Parametro','nombre','Abastonados','codigo_interno','abastonados_abs',
    'unidad','/ mm3','decimales',0,'formula','recuento_leucocitos * abastonados_rel / 100','orden',21,
    'referencias',JSON_ARRAY(JSON_OBJECT('valor_min','200','valor_max','400','sexo','cualquiera','edad_min','','edad_max','','desc','General'))
  ),
  JSON_OBJECT(
    'tipo','Parametro','nombre','Segmentados','codigo_interno','segmentados_abs',
    'unidad','/ mm3','decimales',0,'formula','recuento_leucocitos * segmentados_rel / 100','orden',22,
    'referencias',JSON_ARRAY(JSON_OBJECT('valor_min','3000','valor_max','7000','sexo','cualquiera','edad_min','','edad_max','','desc','General'))
  ),
  JSON_OBJECT(
    'tipo','Parametro','nombre','Eosinofilos','codigo_interno','eosinofilos_abs',
    'unidad','/ mm3','decimales',0,'formula','recuento_leucocitos * eosinofilos_rel / 100','orden',23,
    'referencias',JSON_ARRAY(JSON_OBJECT('valor_min','20','valor_max','350','sexo','cualquiera','edad_min','','edad_max','','desc','General'))
  ),
  JSON_OBJECT(
    'tipo','Parametro','nombre','Basofilos','codigo_interno','basofilos_abs',
    'unidad','/ mm3','decimales',0,'formula','recuento_leucocitos * basofilos_rel / 100','orden',24,
    'referencias',JSON_ARRAY(JSON_OBJECT('valor_min','10','valor_max','60','sexo','cualquiera','edad_min','','edad_max','','desc','General'))
  ),
  JSON_OBJECT(
    'tipo','Parametro','nombre','Monocitos','codigo_interno','monocitos_abs',
    'unidad','/ mm3','decimales',0,'formula','recuento_leucocitos * monocitos_rel / 100','orden',25,
    'referencias',JSON_ARRAY(JSON_OBJECT('valor_min','100','valor_max','500','sexo','cualquiera','edad_min','','edad_max','','desc','General'))
  ),
  JSON_OBJECT(
    'tipo','Parametro','nombre','Linfocitos','codigo_interno','linfocitos_abs',
    'unidad','/ mm3','decimales',0,'formula','recuento_leucocitos * linfocitos_rel / 100','orden',26,
    'referencias',JSON_ARRAY(JSON_OBJECT('valor_min','1500','valor_max','4000','sexo','cualquiera','edad_min','','edad_max','','desc','General'))
  ),

  JSON_OBJECT('tipo','Subtitulo','nombre','CONSTANTES CORPUSCULARES','negrita',TRUE,'orden',27),

  JSON_OBJECT(
    'tipo','Parametro','nombre','MCV','codigo_interno','mcv',
    'unidad','fL','decimales',1,'orden',28,
    'referencias',JSON_ARRAY(JSON_OBJECT('valor_min','80.0','valor_max','99.0','sexo','cualquiera','edad_min','','edad_max','','desc','General'))
  ),
  JSON_OBJECT(
    'tipo','Parametro','nombre','MCH','codigo_interno','mch',
    'unidad','pg','decimales',1,'orden',29,
    'referencias',JSON_ARRAY(JSON_OBJECT('valor_min','26.0','valor_max','38.0','sexo','cualquiera','edad_min','','edad_max','','desc','General'))
  ),
  JSON_OBJECT(
    'tipo','Parametro','nombre','MCHC','codigo_interno','mchc',
    'unidad','g/L','decimales',1,'orden',30,
    'referencias',JSON_ARRAY(JSON_OBJECT('valor_min','32.0','valor_max','36.0','sexo','cualquiera','edad_min','','edad_max','','desc','General'))
  ),
  JSON_OBJECT(
    'tipo','Parametro','nombre','Volumen plaquetario medio (VPM)','codigo_interno','vpm',
    'unidad','fL','decimales',1,'orden',31,
    'referencias',JSON_ARRAY(JSON_OBJECT('valor_min','7.5','valor_max','10.0','sexo','cualquiera','edad_min','','edad_max','','desc','General'))
  ),
  JSON_OBJECT(
    'tipo','Parametro','nombre','Indice de anisocitos (RDW)','codigo_interno','rdw',
    'unidad','%','decimales',1,'orden',32,
    'referencias',JSON_ARRAY(JSON_OBJECT('valor_min','11.0','valor_max','14.0','sexo','cualquiera','edad_min','','edad_max','','desc','General'))
  )
);

-- 1) Resolver examen objetivo:
--    a) si @examen_id_fijo existe, usarlo
--    b) si no, buscar por nombre
SET @examen_id := (
  SELECT id
  FROM examenes_laboratorio
  WHERE id = @examen_id_fijo
  LIMIT 1
);

SET @examen_id := COALESCE(@examen_id, (
  SELECT id
  FROM examenes_laboratorio
  WHERE UPPER(TRIM(nombre)) = UPPER(TRIM(@nombre_examen))
  ORDER BY id ASC
  LIMIT 1
));

-- 2) Crear si no existe (si hay id fijo, respetarlo)
INSERT INTO examenes_laboratorio (
  id, nombre, categoria, metodologia, valores_referenciales,
  precio_publico, precio_convenio, tipo_tubo, tipo_frasco,
  tiempo_resultado, condicion_paciente, preanalitica, activo
)
SELECT
  @examen_id_fijo, @nombre_examen, 'HEMATOLOGIA', 'CITOMETRIA DE FLUJO', @valores_referenciales,
  18.00, NULL, 'Tubo morado', '',
  '1 a 4 horas', 'NO SE NECESITA AYUNO', '', 1
WHERE @examen_id IS NULL
  AND @examen_id_fijo IS NOT NULL;

INSERT INTO examenes_laboratorio (
  nombre, categoria, metodologia, valores_referenciales,
  precio_publico, precio_convenio, tipo_tubo, tipo_frasco,
  tiempo_resultado, condicion_paciente, preanalitica, activo
)
SELECT
  @nombre_examen, 'HEMATOLOGIA', 'CITOMETRIA DE FLUJO', @valores_referenciales,
  18.00, NULL, 'Tubo morado', '',
  '1 a 4 horas', 'NO SE NECESITA AYUNO', '', 1
WHERE @examen_id IS NULL
  AND @examen_id_fijo IS NULL;

SET @examen_id := COALESCE(@examen_id, @examen_id_fijo, LAST_INSERT_ID());

-- 3) Actualizar al formato solicitado
UPDATE examenes_laboratorio
SET
  nombre = @nombre_examen,
  categoria = 'HEMATOLOGIA',
  metodologia = 'CITOMETRIA DE FLUJO',
  valores_referenciales = @valores_referenciales,
  precio_publico = 18.00,
  precio_convenio = NULL,
  tipo_tubo = 'Tubo morado',
  tipo_frasco = '',
  tiempo_resultado = '1 a 4 horas',
  condicion_paciente = 'NO SE NECESITA AYUNO',
  preanalitica = '',
  activo = 1
WHERE id = @examen_id;

-- 4) Versionado (si la tabla existe)
SET @version_table_exists := (
  SELECT COUNT(*)
  FROM information_schema.tables
  WHERE table_schema = DATABASE()
    AND table_name = 'examenes_laboratorio_versiones'
);

SET @next_ver := NULL;
SET @new_version_id := NULL;

SET @sql_next_ver := IF(
  @version_table_exists > 0,
  CONCAT(
    'SELECT @next_ver := COALESCE(MAX(version_num),0) + 1 FROM examenes_laboratorio_versiones WHERE examen_id = ',
    @examen_id
  ),
  'SELECT @next_ver := NULL'
);
PREPARE stmt_next_ver FROM @sql_next_ver;
EXECUTE stmt_next_ver;
DEALLOCATE PREPARE stmt_next_ver;

SET @hash := SHA2(JSON_OBJECT(
  'nombre', @nombre_examen,
  'categoria', 'HEMATOLOGIA',
  'metodologia', 'CITOMETRIA DE FLUJO',
  'valores_referenciales', CAST(@valores_referenciales AS CHAR),
  'precio_publico', '18.00',
  'precio_convenio', '',
  'tipo_tubo', 'Tubo morado',
  'tipo_frasco', '',
  'tiempo_resultado', '1 a 4 horas',
  'condicion_paciente', 'NO SE NECESITA AYUNO',
  'preanalitica', ''
), 256);

SET @sql_version_insert := IF(
  @version_table_exists > 0,
  CONCAT(
    'INSERT INTO examenes_laboratorio_versiones (',
    'examen_id, version_num, hash_contenido, nombre_snapshot, categoria_snapshot, ',
    'metodologia_snapshot, valores_referenciales_snapshot, precio_publico_snapshot, ',
    'precio_convenio_snapshot, tipo_tubo_snapshot, tipo_frasco_snapshot, ',
    'tiempo_resultado_snapshot, condicion_paciente_snapshot, preanalitica_snapshot, ',
    'impacto_cambio, origen, created_by) ',
    'SELECT ',
    @examen_id, ', ', @next_ver, ', ''', @hash, ''', ''', REPLACE(@nombre_examen, '''', ''''''), ''', ''HEMATOLOGIA'', ',
    '''CITOMETRIA DE FLUJO'', ',
    '''', REPLACE(CAST(@valores_referenciales AS CHAR), '''', ''''''), ''', ',
    '18.00, NULL, ''Tubo morado'', '''', ''1 a 4 horas'', ''NO SE NECESITA AYUNO'', '''', ',
    '''clinico'', ''manual'', NULL ',
    'WHERE NOT EXISTS (',
    'SELECT 1 FROM examenes_laboratorio_versiones ',
    'WHERE examen_id = ', @examen_id, ' AND hash_contenido = ''', @hash, ''')'
  ),
  'SELECT 1'
);
PREPARE stmt_version_insert FROM @sql_version_insert;
EXECUTE stmt_version_insert;
DEALLOCATE PREPARE stmt_version_insert;

SET @sql_get_version := IF(
  @version_table_exists > 0,
  CONCAT(
    'SELECT @new_version_id := id FROM examenes_laboratorio_versiones ',
    'WHERE examen_id = ', @examen_id, ' AND hash_contenido = ''', @hash, ''' ',
    'ORDER BY id DESC LIMIT 1'
  ),
  'SELECT @new_version_id := NULL'
);
PREPARE stmt_get_version FROM @sql_get_version;
EXECUTE stmt_get_version;
DEALLOCATE PREPARE stmt_get_version;

SET @sql_update_version := IF(
  @version_table_exists > 0,
  CONCAT(
    'UPDATE examenes_laboratorio e ',
    'LEFT JOIN examenes_laboratorio_versiones v ON v.id = COALESCE(', COALESCE(@new_version_id, 0), ', e.current_version_id) ',
    'SET e.current_version_id = COALESCE(', COALESCE(@new_version_id, 0), ', e.current_version_id), ',
    'e.version_actual = COALESCE(v.version_num, e.version_actual) ',
    'WHERE e.id = ', @examen_id
  ),
  'SELECT 1'
);
PREPARE stmt_update_version FROM @sql_update_version;
EXECUTE stmt_update_version;
DEALLOCATE PREPARE stmt_update_version;

COMMIT;

-- Verificacion final
SELECT
  id, nombre, categoria, metodologia, precio_publico, tipo_tubo, tiempo_resultado, condicion_paciente,
  current_version_id, version_actual
FROM examenes_laboratorio
WHERE id = @examen_id;
