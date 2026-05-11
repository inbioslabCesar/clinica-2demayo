-- 02_verificacion_receta_hc_delta_pendientes_v1.sql
-- Verifica estructura aplicada para control de pendientes por item de receta.

SELECT
    table_name,
    engine,
    table_collation,
    create_time,
    update_time
FROM information_schema.tables
WHERE table_schema = DATABASE()
  AND table_name = 'hc_receta_items_estado';

SELECT
    column_name,
    column_type,
    is_nullable,
    column_default,
    extra
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND table_name = 'hc_receta_items_estado'
ORDER BY ordinal_position;

SELECT
    index_name,
    non_unique,
    seq_in_index,
    column_name
FROM information_schema.statistics
WHERE table_schema = DATABASE()
  AND table_name = 'hc_receta_items_estado'
ORDER BY index_name, seq_in_index;

SELECT
    constraint_name,
    referenced_table_name,
    update_rule,
    delete_rule
FROM information_schema.referential_constraints
WHERE constraint_schema = DATABASE()
  AND table_name = 'hc_receta_items_estado';
