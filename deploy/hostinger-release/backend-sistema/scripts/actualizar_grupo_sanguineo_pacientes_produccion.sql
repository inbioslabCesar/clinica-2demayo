-- Ejecutar en phpMyAdmin, pestaña SQL o Importar.
-- Compatible con MariaDB 11.8 de Hostinger.
-- No consulta information_schema, porque el usuario de hosting no tiene permiso sobre esa base.
-- Agrega solo las columnas que falten; no modifica los pacientes existentes.

ALTER TABLE `u330560936_nutrimed_bd`.`pacientes`
  ADD COLUMN IF NOT EXISTS `grupo_sanguineo` VARCHAR(20) NULL,
  ADD COLUMN IF NOT EXISTS `factor_rh` VARCHAR(20) NULL;

SHOW COLUMNS FROM `u330560936_nutrimed_bd`.`pacientes`
WHERE Field IN ('grupo_sanguineo', 'factor_rh');