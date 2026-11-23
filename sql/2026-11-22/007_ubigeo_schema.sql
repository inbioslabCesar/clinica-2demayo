-- Salud ocupacional: catálogo de ubigeo (departamento / provincia / distrito).
-- Aplica a la BD CLÍNICA de la instalación (api_ubigeo.php usa la conexión principal). Idempotente.
-- Se usa solo cuando el módulo 'ocupacional' está activo, pero las tablas son inocuas si no lo está.
-- Origen: migración 20260724_0009 del sistema ocupacional (sin su TRUNCATE).

CREATE TABLE IF NOT EXISTS departamento (
	id INT UNSIGNED NOT NULL AUTO_INCREMENT,
	nombre VARCHAR(120) NOT NULL,
	PRIMARY KEY (id),
	UNIQUE KEY uq_departamento_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS provincia (
	id INT UNSIGNED NOT NULL AUTO_INCREMENT,
	departamento INT UNSIGNED NOT NULL,
	nombre VARCHAR(120) NOT NULL,
	PRIMARY KEY (id),
	UNIQUE KEY uq_provincia_depto_nombre (departamento, nombre),
	KEY idx_provincia_departamento (departamento),
	CONSTRAINT fk_provincia_departamento FOREIGN KEY (departamento) REFERENCES departamento(id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS distrito (
	id INT UNSIGNED NOT NULL AUTO_INCREMENT,
	provincia INT UNSIGNED NOT NULL,
	nombre VARCHAR(120) NOT NULL,
	PRIMARY KEY (id),
	UNIQUE KEY uq_distrito_prov_nombre (provincia, nombre),
	KEY idx_distrito_provincia (provincia),
	CONSTRAINT fk_distrito_provincia FOREIGN KEY (provincia) REFERENCES provincia(id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
