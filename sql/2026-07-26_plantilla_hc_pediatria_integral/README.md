# Plantilla HC Integral de Pediatria

## Contenido

- Inmunizaciones segun el modelo recibido.
- Antecedentes patologicos, quirurgicos, RAM, medicamentos y perinatales.
- Crecimiento y desarrollo.
- Enfermedad actual: inicio, curso, tiempo, signos/sintomas y anamnesis.
- Examen fisico pediatrico.

## Produccion

1. Seleccionar la base de datos de produccion en phpMyAdmin.
2. Ejecutar `01_upsert_plantilla_hc_pediatria_integral.sql`.
3. Ejecutar `02_verificacion_plantilla_hc_pediatria.sql`.

La migracion es idempotente: puede ejecutarse nuevamente sin crear duplicados para la misma version global.

## Importante

La plantilla se registra como global (`clinic_key` vacio). El sistema la aplicara a Pediatria en modo automatico, salvo que la configuracion de clinica este en modo de plantilla fija para otra especialidad.