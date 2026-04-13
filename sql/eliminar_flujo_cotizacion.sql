SET @OLD_FOREIGN_KEY_CHECKS = @@FOREIGN_KEY_CHECKS;
SET FOREIGN_KEY_CHECKS = 0;

START TRANSACTION;

DELETE FROM cotizacion_eventos;
ALTER TABLE cotizacion_eventos AUTO_INCREMENT = 1;

DELETE FROM cotizacion_movimientos;
ALTER TABLE cotizacion_movimientos AUTO_INCREMENT = 1;

DELETE FROM honorarios_por_cobrar;
ALTER TABLE honorarios_por_cobrar AUTO_INCREMENT = 1;

DELETE FROM cotizaciones_detalle;
ALTER TABLE cotizaciones_detalle AUTO_INCREMENT = 1;

DELETE FROM laboratorio_referencia_movimientos;
ALTER TABLE laboratorio_referencia_movimientos AUTO_INCREMENT = 1;

DELETE FROM ingresos_diarios;
ALTER TABLE ingresos_diarios AUTO_INCREMENT = 1;

DELETE FROM ingresos;
ALTER TABLE ingresos AUTO_INCREMENT = 1;

DELETE FROM egresos;
ALTER TABLE egresos AUTO_INCREMENT = 1;

DELETE FROM cobros_detalle;
ALTER TABLE cobros_detalle AUTO_INCREMENT = 1;

DELETE FROM cobros;
ALTER TABLE cobros AUTO_INCREMENT = 1;

DELETE FROM atenciones;
ALTER TABLE atenciones AUTO_INCREMENT = 1;

DELETE FROM consultas;
ALTER TABLE consultas AUTO_INCREMENT = 1;

DELETE FROM cotizaciones;
ALTER TABLE cotizaciones AUTO_INCREMENT = 1;

DELETE FROM liquidaciones_medicos;
ALTER TABLE liquidaciones_medicos AUTO_INCREMENT = 1;

DELETE FROM configuracion_honorarios_medicos;
ALTER TABLE configuracion_honorarios_medicos AUTO_INCREMENT = 1;

DELETE FROM resultados_laboratorio;
ALTER TABLE resultados_laboratorio AUTO_INCREMENT = 1;

DELETE FROM honorarios_medicos_movimientos;
ALTER TABLE honorarios_medicos_movimientos AUTO_INCREMENT = 1;

DELETE FROM recordatorios_consultas;
ALTER TABLE recordatorios_consultas AUTO_INCREMENT = 1;

COMMIT;

SET FOREIGN_KEY_CHECKS = @OLD_FOREIGN_KEY_CHECKS;