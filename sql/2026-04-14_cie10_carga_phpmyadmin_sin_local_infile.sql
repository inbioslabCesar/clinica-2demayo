-- Carga CIE-10 sin LOCAL INFILE (compatible con phpMyAdmin en hosting compartido)
-- Flujo:
-- 1) Ejecutar este script completo para crear/limpiar tablas
-- 2) Importar manualmente 3 archivos TXT en tablas staging (desde phpMyAdmin)
-- 3) Ejecutar solo el bloque "PASO FINAL" de este mismo script

SET NAMES utf8mb4;

-- PASO 1: Estructura final
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

-- PASO 2: Tablas staging para importar TXT desde phpMyAdmin
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

-- PASO 3: Importar manualmente en phpMyAdmin (menu Importar)
-- Tabla: cie10_stage_codes
-- Archivo: icd102019syst_codes.txt
-- Formato: CSV
-- Delimitador de columnas: ;
-- Delimitador de campos (opcional): dejar vacio
-- Escape: \
-- Charset del archivo: latin1
-- Saltos de linea: \n

-- Tabla: cie10_stage_groups
-- Archivo: icd102019syst_groups.txt
-- Mismos parametros

-- Tabla: cie10_stage_chapters
-- Archivo: icd102019syst_chapters.txt
-- Mismos parametros

-- PASO FINAL: ejecutar desde aqui luego de importar los 3 TXT
SELECT COUNT(*) AS stage_codes FROM cie10_stage_codes;
SELECT COUNT(*) AS stage_groups FROM cie10_stage_groups;
SELECT COUNT(*) AS stage_chapters FROM cie10_stage_chapters;

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

-- Validaciones finales
SELECT COUNT(*) AS total_cie10 FROM cie10;
SELECT codigo, nombre, categoria, subcategoria
FROM cie10
ORDER BY codigo
LIMIT 30;
