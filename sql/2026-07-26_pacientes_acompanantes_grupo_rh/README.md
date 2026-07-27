# Mejora Pacientes: Acompanantes + Grupo Sanguineo + RH

Fecha: 2026-07-26

## Objetivo

Permitir registrar en pacientes:
- Hasta 2 acompanantes (opcional)
- Grupo sanguineo (opcional)
- Factor RH (opcional)

## Scripts

1. `01_pacientes_grupo_rh_idempotente.sql`
- Agrega columnas `grupo_sanguineo` y `factor_rh` en `pacientes` si no existen.
- Normaliza nulos/vacios a `NO_ESPECIFICADO`.

2. `02_pacientes_acompanantes_tabla_idempotente.sql`
- Crea tabla `pacientes_acompanantes` con FK a `pacientes(id)`.

3. `03_verificacion_pacientes_acompanantes.sql`
- Verifica columnas, tabla y estado de datos.

## Orden de ejecucion

1. Ejecutar `01_pacientes_grupo_rh_idempotente.sql`
2. Ejecutar `02_pacientes_acompanantes_tabla_idempotente.sql`
3. Ejecutar `03_verificacion_pacientes_acompanantes.sql`

## Regla de negocio

El limite de 2 acompanantes se aplica en backend (API), para mantener compatibilidad entre entornos MySQL.
