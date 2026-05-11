# Operacion CIE10 Post-Saneamiento

Estado objetivo: CIE10 ES limpio, sin contaminacion EN y validado por `sp_cie10_qc_validar_o_fallar`.

## 1) Respaldo final de produccion (Hostinger/phpMyAdmin)

1. Entrar a la base de datos productiva.
2. Abrir tabla `cie10`.
3. Click en `Exportar`.
4. Formato: SQL.
5. Metodo: Rapido.
6. Guardar con nombre sugerido: `cie10_post_qc_ok_YYYYMMDD.sql`.

## 2) Snapshot tecnico local (opcional)

Comando de referencia:

```bash
mysqldump -uroot poli2demayo cie10 > backups/cie10/cie10_post_qc_ok_YYYYMMDD_HHMMSS.sql
```

## 3) Mantenimiento periodico (sin llenado manual)

Ejecutar en este orden:

```sql
CALL sp_cie10_autocorregir_es_no_manual(1);
CALL sp_cie10_refuerzo_automatico_es(1);
CALL sp_cie10_qc_generar();
CALL sp_cie10_qc_validar_o_fallar();
```

Resultado esperado:
- `sp_cie10_qc_validar_o_fallar` devuelve: `QC CIE10 ES OK - sin contaminacion detectada`.

## 4) Criterio de incidente

Si la validacion falla:

1. Tomar la muestra de `sp_cie10_qc_generar()`.
2. Agregar reglas automaticas en:
   - `sql/cie10_bilingue/10_cie10_autocorreccion_no_manual.sql`
   - `sql/cie10_bilingue/11_cie10_refuerzo_automatico_es.sql`
3. Reimportar scripts.
4. Repetir mantenimiento periodico.

Politica: no correccion manual por codigo; solo remediacion automatica reproducible.
