-- Repara texto mojibake en examenes_laboratorio despues de importar un dump con caracteres rotos.
-- Ejemplos que corrige: "HematologÃ­a" -> "Hematología", "ParÃ¡metro" -> "Parámetro"

SET NAMES utf8mb4;
START TRANSACTION;

-- 1) Backup de filas afectadas
CREATE TABLE IF NOT EXISTS examenes_laboratorio_backup_mojibake_20260408 AS
SELECT *
FROM examenes_laboratorio
WHERE nombre LIKE '%Ã%' OR nombre LIKE '%Â%'
   OR categoria LIKE '%Ã%' OR categoria LIKE '%Â%'
   OR metodologia LIKE '%Ã%' OR metodologia LIKE '%Â%'
   OR valores_referenciales LIKE '%Ã%' OR valores_referenciales LIKE '%Â%'
   OR tipo_tubo LIKE '%Ã%' OR tipo_tubo LIKE '%Â%'
   OR tipo_frasco LIKE '%Ã%' OR tipo_frasco LIKE '%Â%'
   OR tiempo_resultado LIKE '%Ã%' OR tiempo_resultado LIKE '%Â%'
   OR condicion_paciente LIKE '%Ã%' OR condicion_paciente LIKE '%Â%'
   OR preanalitica LIKE '%Ã%' OR preanalitica LIKE '%Â%';

-- 2) Reparacion de columnas de texto
UPDATE examenes_laboratorio
SET
  nombre = CONVERT(CAST(CONVERT(nombre USING latin1) AS BINARY) USING utf8mb4),
  categoria = CONVERT(CAST(CONVERT(categoria USING latin1) AS BINARY) USING utf8mb4),
  metodologia = CONVERT(CAST(CONVERT(metodologia USING latin1) AS BINARY) USING utf8mb4),
  valores_referenciales = CONVERT(CAST(CONVERT(valores_referenciales USING latin1) AS BINARY) USING utf8mb4),
  tipo_tubo = CONVERT(CAST(CONVERT(tipo_tubo USING latin1) AS BINARY) USING utf8mb4),
  tipo_frasco = CONVERT(CAST(CONVERT(tipo_frasco USING latin1) AS BINARY) USING utf8mb4),
  tiempo_resultado = CONVERT(CAST(CONVERT(tiempo_resultado USING latin1) AS BINARY) USING utf8mb4),
  condicion_paciente = CONVERT(CAST(CONVERT(condicion_paciente USING latin1) AS BINARY) USING utf8mb4),
  preanalitica = CONVERT(CAST(CONVERT(preanalitica USING latin1) AS BINARY) USING utf8mb4)
WHERE nombre LIKE '%Ã%' OR nombre LIKE '%Â%'
   OR categoria LIKE '%Ã%' OR categoria LIKE '%Â%'
   OR metodologia LIKE '%Ã%' OR metodologia LIKE '%Â%'
   OR valores_referenciales LIKE '%Ã%' OR valores_referenciales LIKE '%Â%'
   OR tipo_tubo LIKE '%Ã%' OR tipo_tubo LIKE '%Â%'
   OR tipo_frasco LIKE '%Ã%' OR tipo_frasco LIKE '%Â%'
   OR tiempo_resultado LIKE '%Ã%' OR tiempo_resultado LIKE '%Â%'
   OR condicion_paciente LIKE '%Ã%' OR condicion_paciente LIKE '%Â%'
   OR preanalitica LIKE '%Ã%' OR preanalitica LIKE '%Â%';

COMMIT;

-- Verificacion rapida
SELECT COUNT(*) AS filas_aun_con_mojibake
FROM examenes_laboratorio
WHERE nombre LIKE '%Ã%' OR nombre LIKE '%Â%'
   OR categoria LIKE '%Ã%' OR categoria LIKE '%Â%'
   OR metodologia LIKE '%Ã%' OR metodologia LIKE '%Â%'
   OR valores_referenciales LIKE '%Ã%' OR valores_referenciales LIKE '%Â%';
