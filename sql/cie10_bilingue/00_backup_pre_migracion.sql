-- Backup previo de CIE10 antes de migracion bilingue.
-- Ejecutar UNA VEZ por sistema antes de 01/02/03.
-- No elimina datos de cie10; crea/actualiza copia de respaldo local.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS cie10_backup_bilingue LIKE cie10;
TRUNCATE TABLE cie10_backup_bilingue;
INSERT INTO cie10_backup_bilingue SELECT * FROM cie10;

SELECT COUNT(*) AS filas_backup FROM cie10_backup_bilingue;
