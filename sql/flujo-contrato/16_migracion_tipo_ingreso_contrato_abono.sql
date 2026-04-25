-- 16_migracion_tipo_ingreso_contrato_abono.sql
-- Objetivo:
-- 1) habilitar tipo_ingreso='contrato_abono' en ingresos_diarios
-- 2) convertir historicos de abonos de contrato guardados como 'otros'

START TRANSACTION;

ALTER TABLE ingresos_diarios
  MODIFY COLUMN tipo_ingreso ENUM(
    'consulta',
    'laboratorio',
    'farmacia',
    'ecografia',
    'rayosx',
    'procedimiento',
    'otros',
    'operaciones',
    'contrato_abono'
  ) NOT NULL;

UPDATE ingresos_diarios
SET tipo_ingreso = 'contrato_abono'
WHERE tipo_ingreso = 'otros'
  AND referencia_tabla = 'paciente_seguimiento_pagos';

COMMIT;
