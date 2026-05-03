# ⚡ FASE 1 HÍBRIDA - GUÍA RÁPIDA DE EJECUCIÓN

## 🎯 OBJETIVO
Agregar auto-detección de cotizaciones pendientes de farmacia para evitar duplicados.

## 📁 ARCHIVO A EJECUTAR
```
sql/flujo-cotizaciones/2026-05-02_fase1_hibrida_responsable_farmacia.sql
```

---

## 🚀 OPCIÓN 1: MySQL CLI (Terminal) - ⭐ MÁS RÁPIDA

```bash
mysql -u root -p poli2demayo < sql/flujo-cotizaciones/2026-05-02_fase1_hibrida_responsable_farmacia.sql
```

**Tiempo**: 30 segundos  
**Downtime**: 0  
**Éxito**: Si no hay errores (advertencias de índices duplicados = OK)

---

## 🚀 OPCIÓN 2: phpMyAdmin

### Pasos:
1. Abre phpMyAdmin en tu navegador
2. Selecciona base de datos **poli2demayo**
3. Click en tab **SQL**
4. Copia TODO el contenido de:
   ```
   sql/flujo-cotizaciones/2026-05-02_fase1_hibrida_responsable_farmacia.sql
   ```
5. Pega en el editor
6. Click **Ejecutar**
7. Scroll down → Verifica que aparecen resultados de verificación

**Tiempo**: 2 minutos  
**Downtime**: 0

---

## ✅ VALIDAR QUE FUNCIONÓ

Ejecuta ESTO en phpMyAdmin o MySQL CLI para verificar:

```sql
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'cotizaciones'
  AND COLUMN_NAME = 'responsable_farmacia_id';
```

**Resultado esperado**:
```
COLUMN_NAME             | COLUMN_TYPE | IS_NULLABLE
responsable_farmacia_id | int         | YES
```

✅ Si ves eso = **MIGRACIÓN EXITOSA**

---

## 🧪 TESTING (Manual)

1. **Login como Químico**
2. **Abrir**: Cotizador de Farmacia
3. **Buscar**: Paciente que tenga orden de farmacia del médico
4. **Esperar**: 2-3 segundos...
5. **Verificar**: ✅ Aparece **BANNER VERDE** con:
   > ✅ Receta del médico detectada: Q123456 — S/ 450.00
   > Los medicamentos ya están cargados. Al confirmar se actualizará la misma cotización sin crear un duplicado.

6. **Click**: "Confirmar receta y enviar a recepción"
7. **Resultado**: ✅ ACTUALIZA la cotización (NO crea duplicado)

---

## 📊 ¿QUÉ CAMBIÓ EN LA BD?

| Elemento | Antes | Después |
|----------|-------|---------|
| Columna `responsable_farmacia_id` | ❌ No existe | ✅ Agregada (INT NULL) |
| Índice búsqueda rápida | ❌ No | ✅ Creado |
| Funcionalidad Química | ❌ Manual | ✅ Auto-detecta |

---

## ⏮️ SI NECESITAS REVERTIR

```sql
ALTER TABLE cotizaciones DROP COLUMN responsable_farmacia_id;
```

**Tiempo**: 10 segundos  
⚠️ **Atención**: Perderás datos de responsable si están poblados.

---

## 📞 SI ALGO FALLA

| Error | Solución |
|-------|----------|
| "Duplicate column" | Ignorar → la columna ya existe ✅ |
| "Syntax error" | Verificar MySQL >= 5.7 |
| "Access denied" | Usar usuario `root` |
| Timeout | Ejecutar vía MySQL CLI, no phpMyAdmin |

---

## 📚 MÁS INFORMACIÓN

- **Detalles completos**: `FASE1_HIBRIDA_README.md`
- **Índice de archivos**: `ARCHIVOS_MIGRACION.md`
- **Resumen completo**: `MIGRACION_RESUMEN.txt`
- **Script automatizado**: `EJECUTAR_MIGRACION.sh` (bash/Linux)

---

## ✅ CHECKLIST FINAL

- [ ] Ejecuté el script SQL
- [ ] Ejecuté la query de verificación
- [ ] La columna `responsable_farmacia_id` existe
- [ ] Testing: Química busca paciente con farmacia → ve banner verde
- [ ] Testing: Confirma → actualiza, NO crea duplicado
- [ ] Listo para producción ✅

---

**Tiempo total**: ~5 minutos  
**Complejidad**: BAJA  
**Riesgo**: BAJO  
**Downtime**: 0

¡Listo! 🚀
