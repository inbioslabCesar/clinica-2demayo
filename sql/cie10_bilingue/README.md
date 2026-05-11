# CIE10 Bilingue (ES/EN)

Objetivo: habilitar CIE10 en castellano sin perder compatibilidad con dataset actual en ingles.

## Orden de ejecucion en produccion

1. Ejecutar `00_backup_pre_migracion.sql`
2. Ejecutar `01_alter_cie10_bilingue.sql`
3. Ejecutar `02_backfill_es_fallback.sql`
4. Ejecutar `03_seed_es_desde_catalogo_local.sql`
5. Ejecutar `04_verificacion_post_deploy.sql`

Importante para phpMyAdmin:
Selecciona primero la base objetivo antes de importar los scripts.

## Que hace cada script

- `01_alter_cie10_bilingue.sql`:
  - agrega columnas `nombre_es`, `categoria_es`, `subcategoria_es`, `descripcion_es`
  - crea indices para consulta ES
  - es idempotente

- `02_backfill_es_fallback.sql`:
  - rellena ES con EN solo donde ES este vacio
  - evita respuestas vacias mientras se termina la carga castellana

- `03_seed_es_desde_catalogo_local.sql`:
  - carga un catalogo local en castellano desde `sql/cie10.sql` (subset clinico)
  - actualiza por `codigo` sin tocar textos EN

- `04_verificacion_post_deploy.sql`:
  - valida columnas ES
  - reporta cobertura de traduccion
  - entrega muestras de visualizacion final con fallback
  - incluye pruebas de busqueda para terminos clinicos comunes
  - cambia SOLO la linea `USE ...;` para cada sistema

## Migracion para varios sistemas productivos

Si tienes varias BD de produccion, repite el mismo orden por cada BD:

1. Selecciona la BD objetivo en phpMyAdmin.
2. Ejecuta `00_backup_pre_migracion.sql`.
3. Ejecuta `01_alter_cie10_bilingue.sql`.
4. Ejecuta `02_backfill_es_fallback.sql`.
5. Ejecuta `03_seed_es_desde_catalogo_local.sql`.
6. En `04_verificacion_post_deploy.sql`, cambia la linea `USE ...;` por la BD actual y ejecuta.

## Completar castellano para todo el catalogo

Si necesitas que TODO el CIE10 tenga `nombre_es` (no solo el seed parcial), usa una de estas opciones:

1. Ejecutar script PHP de traduccion masiva (idempotente):
  - `php scripts/cie10_traducir_es_masivo.php`
  - Este script completa `nombre_es`, `categoria_es`, `subcategoria_es`, `descripcion_es` para todos los codigos activos.

2. Importar SQL completo ya generado desde desarrollo:
  - `sql/cie10_bilingue/05_upsert_es_full_from_dev.sql`
  - Contiene `INSERT ... ON DUPLICATE KEY UPDATE` por `codigo` para 10633 filas.

Para varias BD de produccion, repite la opcion elegida en cada BD.

## Nota

Este seed local prioriza codigos frecuentes y especialidades del proyecto. Si deseas cobertura OMS completa en castellano, puedes reemplazar/expandir el seed ES y mantener esta misma estructura de columnas y API.

## Cierre Operativo Recomendado (post-QC OK)

Cuando `CALL sp_cie10_qc_validar_o_fallar();` responda OK:

1. Exportar respaldo final de `cie10` (produccion) desde phpMyAdmin:
  - Base de datos objetivo -> tabla `cie10` -> Exportar -> Formato SQL -> metodo rapido.
  - Guardar como `cie10_post_qc_ok_YYYYMMDD.sql`.

2. Guardar snapshot tecnico local (si aplica entorno local):
  - `mysqldump -uroot poli2demayo cie10 > backups/cie10/cie10_post_qc_ok_YYYYMMDD_HHMMSS.sql`

3. Rutina de mantenimiento (semanal o mensual, sin manual):
  - `CALL sp_cie10_autocorregir_es_no_manual(1);`
  - `CALL sp_cie10_refuerzo_automatico_es(1);`
  - `CALL sp_cie10_qc_generar();`
  - `CALL sp_cie10_qc_validar_o_fallar();`

Si el ultimo paso falla, revisar el detalle retornado por `sp_cie10_qc_generar()` y extender reglas automaticas (scripts 10/11), evitando carga manual por codigo.
