-- 003_schema_triaje_auditoria_campos.sql
-- Campos de auditoría en tabla triaje (idempotente por columna)

SET @db := DATABASE();

SET @sql := IF(
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@db AND table_name='triaje' AND column_name='creado_por_id'),
  'SELECT 1',
  'ALTER TABLE triaje ADD COLUMN creado_por_id INT NULL'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@db AND table_name='triaje' AND column_name='creado_por_rol'),
  'SELECT 1',
  'ALTER TABLE triaje ADD COLUMN creado_por_rol VARCHAR(40) NULL'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@db AND table_name='triaje' AND column_name='creado_por_nombre'),
  'SELECT 1',
  'ALTER TABLE triaje ADD COLUMN creado_por_nombre VARCHAR(120) NULL'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@db AND table_name='triaje' AND column_name='actualizado_por_id'),
  'SELECT 1',
  'ALTER TABLE triaje ADD COLUMN actualizado_por_id INT NULL'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@db AND table_name='triaje' AND column_name='actualizado_por_rol'),
  'SELECT 1',
  'ALTER TABLE triaje ADD COLUMN actualizado_por_rol VARCHAR(40) NULL'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@db AND table_name='triaje' AND column_name='actualizado_por_nombre'),
  'SELECT 1',
  'ALTER TABLE triaje ADD COLUMN actualizado_por_nombre VARCHAR(120) NULL'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@db AND table_name='triaje' AND column_name='origen_registro'),
  'SELECT 1',
  'ALTER TABLE triaje ADD COLUMN origen_registro VARCHAR(40) NULL'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

