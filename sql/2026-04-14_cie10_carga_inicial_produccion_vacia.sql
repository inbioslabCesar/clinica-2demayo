-- Carga inicial CIE-10 para produccion vacia
-- Fuente: OMS ICD-10 2019 Meta
-- Requiere ejecutar cliente mysql con --local-infile=1

SET NAMES utf8mb4;

-- 1) Tabla final (compatible con api_cie10.php)
CREATE TABLE IF NOT EXISTS cie10 (
    id INT AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(10) NOT NULL UNIQUE,
    nombre VARCHAR(500) NOT NULL,
    categoria VARCHAR(100),
    subcategoria VARCHAR(100),
    descripcion TEXT,
    activo TINYINT(1) DEFAULT 1,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_codigo (codigo),
    INDEX idx_nombre (nombre),
    INDEX idx_categoria (categoria),
    FULLTEXT(nombre, descripcion)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2) Staging
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

-- 3) Rutas de archivos (ajusta si cambia la ruta en servidor)
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

-- 4) Carga final
TRUNCATE TABLE cie10;

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
    COALESCE(NULLIF(TRIM(c.c11), ''), NULLIF(TRIM(c.c10), ''), NULLIF(TRIM(c.c9), ''), TRIM(c.c7)) AS nombre,
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
    AND TRIM(c.c7) NOT LIKE '%-%';

-- 5) Validaciones
SELECT COUNT(*) AS total_cie10 FROM cie10;
SELECT codigo, nombre, categoria, subcategoria
FROM cie10
ORDER BY codigo
LIMIT 30;
