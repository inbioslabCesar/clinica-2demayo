-- 2026-11-22 | Huella de estructura (SOLO LECTURA, sin cambios de BD).
-- Se ejecuta igual en cada BD (phpMyAdmin > SQL, con la BD seleccionada) y devuelve
-- el nº de elementos + MD5 de columnas, índices y FKs normalizados.
-- Si dos BD devuelven la misma huella, su estructura es idéntica
-- (en clientes solo coincide con dev tras aplicar con --nombres-exactos --incluir-fks
--  y sin objetos sobrantes; las tablas *backup* se excluyen).
--
-- IMPORTANTE: ORDER BY BINARY linea (el orden por collation difiere entre MySQL y MariaDB).

SET SESSION group_concat_max_len = 4000000;

SELECT COUNT(*) AS elementos,
       MD5(GROUP_CONCAT(linea ORDER BY BINARY linea SEPARATOR '\n')) AS huella
FROM (
    -- Columnas: tipo sin ancho de enteros, json = longtext, default normalizado
    SELECT CONCAT('COL|', c.TABLE_NAME, '|', c.COLUMN_NAME, '|',
           CASE
               WHEN c.DATA_TYPE IN ('tinyint','smallint','mediumint','int','bigint')
                   THEN CONCAT(c.DATA_TYPE,
                               IF(LOCATE('unsigned', c.COLUMN_TYPE) > 0, ' unsigned', ''),
                               IF(LOCATE('zerofill', c.COLUMN_TYPE) > 0, ' zerofill', ''))
               WHEN c.DATA_TYPE = 'json' THEN 'longtext'
               ELSE LOWER(c.COLUMN_TYPE)
           END, '|',
           c.IS_NULLABLE, '|',
           CASE
               WHEN c.COLUMN_DEFAULT IS NULL AND c.IS_NULLABLE = 'YES' THEN 'null'
               WHEN c.COLUMN_DEFAULT IS NULL THEN 'none'
               WHEN UPPER(c.COLUMN_DEFAULT) = 'NULL' AND c.IS_NULLABLE = 'YES' THEN 'null'
               ELSE LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
                        c.COLUMN_DEFAULT, '_utf8mb4', ''), '\\', ''), '''', ''), '()', ''), ' ', ''), '(', ''))
           END, '|',
           IF(LOCATE('auto_increment', c.EXTRA) > 0, 'AI', '')) AS linea
    FROM information_schema.COLUMNS c
    JOIN information_schema.TABLES t
      ON t.TABLE_SCHEMA = c.TABLE_SCHEMA AND t.TABLE_NAME = c.TABLE_NAME AND t.TABLE_TYPE = 'BASE TABLE'
    WHERE c.TABLE_SCHEMA = DATABASE()
      AND c.TABLE_NAME NOT REGEXP '(^|_)(backup|bkp|bak)(_|$)|^zfix_'

    UNION ALL

    -- Índices
    SELECT CONCAT('IDX|', s.TABLE_NAME, '|', s.INDEX_NAME, '|', s.NON_UNIQUE, '|',
                  GROUP_CONCAT(CONCAT(IFNULL(s.COLUMN_NAME, '<expr>'), IFNULL(CONCAT('(', s.SUB_PART, ')'), ''))
                               ORDER BY s.SEQ_IN_INDEX SEPARATOR ','))
    FROM information_schema.STATISTICS s
    WHERE s.TABLE_SCHEMA = DATABASE()
      AND s.TABLE_NAME NOT REGEXP '(^|_)(backup|bkp|bak)(_|$)|^zfix_'
    GROUP BY s.TABLE_NAME, s.INDEX_NAME, s.NON_UNIQUE

    UNION ALL

    -- Claves foráneas (RESTRICT = NO ACTION)
    SELECT CONCAT('FK|', k.TABLE_NAME, '|', k.CONSTRAINT_NAME, '|',
                  GROUP_CONCAT(k.COLUMN_NAME ORDER BY k.ORDINAL_POSITION SEPARATOR ','), '->',
                  k.REFERENCED_TABLE_NAME, '(',
                  GROUP_CONCAT(k.REFERENCED_COLUMN_NAME ORDER BY k.ORDINAL_POSITION SEPARATOR ','), ')|',
                  IF(r.DELETE_RULE = 'RESTRICT', 'NO ACTION', r.DELETE_RULE), '|',
                  IF(r.UPDATE_RULE = 'RESTRICT', 'NO ACTION', r.UPDATE_RULE))
    FROM information_schema.KEY_COLUMN_USAGE k
    JOIN information_schema.REFERENTIAL_CONSTRAINTS r
      ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME AND r.TABLE_NAME = k.TABLE_NAME
    WHERE k.TABLE_SCHEMA = DATABASE()
      AND k.REFERENCED_TABLE_NAME IS NOT NULL
      AND k.TABLE_NAME NOT REGEXP '(^|_)(backup|bkp|bak)(_|$)|^zfix_'
      AND k.REFERENCED_TABLE_NAME NOT REGEXP '(^|_)(backup|bkp|bak)(_|$)|^zfix_'
    GROUP BY k.TABLE_NAME, k.CONSTRAINT_NAME, k.REFERENCED_TABLE_NAME, r.DELETE_RULE, r.UPDATE_RULE
) x;
