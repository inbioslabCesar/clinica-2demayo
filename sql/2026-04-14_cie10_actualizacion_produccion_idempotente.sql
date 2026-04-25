-- Actualizacion CIE-10 (OMS 2019 Meta) para produccion
-- Requiere: habilitar --local-infile=1 en el cliente mysql
-- Fuente: data/cie10/icd102019enMeta/

SET NAMES utf8mb4;

-- 1) Staging tables (idempotente)
CREATE TABLE IF NOT EXISTS cie10_stage_codes (
    c1 VARCHAR(10),
    c2 VARCHAR(10),
    c3 VARCHAR(10),
    c4 VARCHAR(10),
    c5 VARCHAR(20),
    c6 VARCHAR(20),
    c7 VARCHAR(20),
    c8 VARCHAR(20),
    c9 VARCHAR(255),
    c10 VARCHAR(255),
    c11 VARCHAR(255),
    c12 VARCHAR(255),
    c13 VARCHAR(50),
    c14 VARCHAR(50),
    c15 VARCHAR(50),
    c16 VARCHAR(50),
    c17 VARCHAR(50)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cie10_stage_groups (
    code_from VARCHAR(10),
    code_to VARCHAR(10),
    chapter_num VARCHAR(10),
    group_title VARCHAR(255)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cie10_stage_chapters (
    chapter_num VARCHAR(10),
    chapter_title VARCHAR(255)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

TRUNCATE TABLE cie10_stage_codes;
TRUNCATE TABLE cie10_stage_groups;
TRUNCATE TABLE cie10_stage_chapters;

-- 2) Carga de archivos TXT (edita rutas segun servidor)
--    Nota: usa barras / para Windows en MySQL.
SET @codes_file = 'C:/laragon/www/clinica-2demayo/data/cie10/icd102019enMeta/icd102019syst_codes.txt';
SET @groups_file = 'C:/laragon/www/clinica-2demayo/data/cie10/icd102019enMeta/icd102019syst_groups.txt';
SET @chapters_file = 'C:/laragon/www/clinica-2demayo/data/cie10/icd102019enMeta/icd102019syst_chapters.txt';

SET @sql_codes = CONCAT(
    "LOAD DATA LOCAL INFILE '", REPLACE(@codes_file, "'", "''"),
    "' INTO TABLE cie10_stage_codes "
    "CHARACTER SET latin1 "
    "FIELDS TERMINATED BY ';' "
    "LINES TERMINATED BY '\\n' "
    "(c1,c2,c3,c4,c5,c6,c7,c8,c9,c10,c11,c12,c13,c14,c15,c16,c17)"
);
PREPARE stmt_codes FROM @sql_codes;
EXECUTE stmt_codes;
DEALLOCATE PREPARE stmt_codes;

SET @sql_groups = CONCAT(
    "LOAD DATA LOCAL INFILE '", REPLACE(@groups_file, "'", "''"),
    "' INTO TABLE cie10_stage_groups "
    "CHARACTER SET latin1 "
    "FIELDS TERMINATED BY ';' "
    "LINES TERMINATED BY '\\n' "
    "(code_from,code_to,chapter_num,group_title)"
);
PREPARE stmt_groups FROM @sql_groups;
EXECUTE stmt_groups;
DEALLOCATE PREPARE stmt_groups;

SET @sql_chapters = CONCAT(
    "LOAD DATA LOCAL INFILE '", REPLACE(@chapters_file, "'", "''"),
    "' INTO TABLE cie10_stage_chapters "
    "CHARACTER SET latin1 "
    "FIELDS TERMINATED BY ';' "
    "LINES TERMINATED BY '\\n' "
    "(chapter_num,chapter_title)"
);
PREPARE stmt_chapters FROM @sql_chapters;
EXECUTE stmt_chapters;
DEALLOCATE PREPARE stmt_chapters;

-- 3) Backup y actualizacion atomica logica
START TRANSACTION;

CREATE TABLE IF NOT EXISTS cie10_backup LIKE cie10;
TRUNCATE TABLE cie10_backup;
INSERT INTO cie10_backup SELECT * FROM cie10;

-- Marcar todo inactivo y reactivar/actualizar solo lo oficial OMS
UPDATE cie10 SET activo = 0;

INSERT INTO cie10 (
    codigo,
    nombre,
    categoria,
    subcategoria,
    descripcion,
    activo
)
SELECT
    TRIM(c.c7) AS codigo,
    COALESCE(NULLIF(TRIM(c.c11), ''), NULLIF(TRIM(c.c9), ''), NULLIF(TRIM(c.c10), ''), TRIM(c.c7)) AS nombre,
    COALESCE(NULLIF(TRIM(ch.chapter_title), ''), 'Sin categoria') AS categoria,
    COALESCE(NULLIF(TRIM(gr.group_title), ''), 'Sin subcategoria') AS subcategoria,
    CONCAT('OMS ICD-10 2019 | Capitulo ', TRIM(c.c4), ' | Grupo ', TRIM(c.c5)) AS descripcion,
    1 AS activo
FROM cie10_stage_codes c
LEFT JOIN cie10_stage_chapters ch
    ON TRIM(ch.chapter_num) = TRIM(c.c4)
LEFT JOIN cie10_stage_groups gr
    ON LEFT(REPLACE(TRIM(c.c7), '.', ''), 3) BETWEEN TRIM(gr.code_from) AND TRIM(gr.code_to)
WHERE
    TRIM(c.c2) = 'T'
    AND TRIM(c.c7) <> ''
    AND TRIM(c.c7) NOT LIKE '%-%'
ON DUPLICATE KEY UPDATE
    nombre = VALUES(nombre),
    categoria = VALUES(categoria),
    subcategoria = VALUES(subcategoria),
    descripcion = VALUES(descripcion),
    activo = 1,
    actualizado_en = CURRENT_TIMESTAMP;

COMMIT;

-- 4) Verificaciones rapidas
SELECT COUNT(*) AS total_activos FROM cie10 WHERE activo = 1;
SELECT codigo, nombre FROM cie10 WHERE activo = 1 ORDER BY codigo LIMIT 20;

-- 5) (Opcional) limpieza de staging
-- TRUNCATE TABLE cie10_stage_codes;
-- TRUNCATE TABLE cie10_stage_groups;
-- TRUNCATE TABLE cie10_stage_chapters;
