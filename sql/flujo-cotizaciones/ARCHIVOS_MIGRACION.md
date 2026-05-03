# FASE 1 HÍBRIDA - Archivos de Migración para Producción

**Carpeta**: `sql/flujo-cotizaciones/`  
**Fecha de creación**: 02/05/2026  
**Status**: LISTO PARA PRODUCCIÓN

---

## 📋 Archivos Incluidos

### 1. **2026-05-02_fase1_hibrida_responsable_farmacia.sql**
   - ✅ Script principal de migración
   - ✅ Idempotente (seguro ejecutar múltiples veces)
   - ✅ Incluye verificaciones pre y post-migración
   - ✅ Crea índices para optimizar búsquedas
   - ✅ Incluye script de rollback comentado

### 2. **FASE1_HIBRIDA_README.md**
   - 📖 Documentación completa
   - 🚀 3 opciones de ejecución (CLI, phpMyAdmin, script)
   - ✅ Verificaciones post-migración
   - ⏮️ Script de rollback
   - ⏱️ Timeline de migración

### 3. **EJECUTAR_MIGRACION.sh**
   - 🤖 Script bash automatizado
   - ✅ Checklist pre-migración
   - ✅ Ejecución
   - ✅ Validaciones post-migración
   - 📊 Estadísticas finales

### 4. **ARCHIVOS_MIGRACION.md** (este archivo)
   - 📚 Índice de archivos
   - 🗺️ Guía rápida
   - 📌 Checklist

---

## 🚀 INICIO RÁPIDO

### Opción A: Desde Linux/WSL (Recomendado)
```bash
cd /ruta/a/clinica-2demayo
bash sql/flujo-cotizaciones/EJECUTAR_MIGRACION.sh
```

### Opción B: Desde MySQL CLI (Windows/Linux)
```bash
mysql -u root -p poli2demayo < sql/flujo-cotizaciones/2026-05-02_fase1_hibrida_responsable_farmacia.sql
```

### Opción C: Desde phpMyAdmin
1. Ir a phpMyAdmin → Base de datos `poli2demayo`
2. Tab **SQL**
3. Copiar contenido de `2026-05-02_fase1_hibrida_responsable_farmacia.sql`
4. Click **Ejecutar**

---

## ✅ CHECKLIST PRE-MIGRACIÓN

- [ ] **Backup**: Ejecutar `mysqldump -u root poli2demayo > backup_pre_fase1.sql`
- [ ] **Verificación**: Conectividad a MySQL funciona
- [ ] **Ancho de banda**: Suficiente para queries
- [ ] **Tiempo**: Disponibilidad de 30 minutos (sin usuario activo si es posible)
- [ ] **Ambiente**: Testing realizado ✅

---

## 📊 CAMBIOS A LA BASE DE DATOS

### Columna Nueva
| Campo | Tipo | Nullable | Default | Descripción |
|-------|------|----------|---------|-------------|
| `responsable_farmacia_id` | INT | SÍ | NULL | Usuario (químico) responsable de preparar farmacia |

**Ubicación**: Tabla `cotizaciones`, después de columna `usuario_id`

### Índices Nuevos
1. `idx_responsable_farmacia_id` → Búsquedas por responsable
2. `idx_resp_farm_estado` → Búsquedas por responsable + estado

---

## ⏱️ CRONOGRAMA DE EJECUCIÓN

| Fase | Acción | Tiempo | Riesgo |
|------|--------|--------|--------|
| Pre | Backup | 10 min | ❌ |
| 1 | Verificar MySQL | 2 min | ❌ |
| 2 | Ejecutar SQL | 30 seg | ✅ LOW |
| 3 | Verificar índices | 1 min | ❌ |
| 4 | Testing | 15 min | ✅ LOW |
| Post | Go-live | Inmediato | ✅ LOW |

**⏰ Tiempo total**: ~30 minutos  
**🔕 Downtime**: 0 (sin downtime)  
**📊 Complejidad**: BAJA

---

## 🔍 VERIFICACIÓN POST-MIGRACIÓN

### Verificar Columna
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

### Verificar Índices
```sql
SHOW INDEX FROM cotizaciones WHERE Column_name = 'responsable_farmacia_id';
```

**Resultado esperado**: 2 filas (uno para cada índice)

### Verificar Estadísticas
```sql
SELECT 
    (SELECT COUNT(*) FROM cotizaciones) as total,
    (SELECT COUNT(*) FROM cotizaciones WHERE responsable_farmacia_id IS NOT NULL) as asignados
FROM cotizaciones LIMIT 1;
```

---

## 🧪 TESTING POST-MIGRACIÓN

### Test 1: Auto-Detección
1. Química abre **Cotizador de Farmacia**
2. Busca paciente con orden pendiente de farmacia
3. ✅ **Esperado**: Banner verde "Receta del médico detectada"
4. ✅ **Esperado**: Medicamentos pre-cargados

### Test 2: Sin Duplicados
1. Confirma medicamentos
2. ✅ **Esperado**: ACTUALIZA cotización existente
3. ❌ **NUNCA**: Crear cotización nueva duplicada

### Test 3: Responsable Asignado
1. En BD, ejecutar:
   ```sql
   SELECT responsable_farmacia_id FROM cotizaciones 
   WHERE numero_comprobante = 'Q[ult_cot]';
   ```
2. ✅ **Esperado**: ID del químico (no NULL)

---

## ⏮️ ROLLBACK (Si es necesario)

Si necesitas revertir completamente:

```sql
-- Remover índices
ALTER TABLE cotizaciones DROP INDEX IF EXISTS idx_responsable_farmacia_id;
ALTER TABLE cotizaciones DROP INDEX IF EXISTS idx_resp_farm_estado;

-- Remover columna
ALTER TABLE cotizaciones DROP COLUMN responsable_farmacia_id;

-- Verificar
SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_NAME = 'cotizaciones' 
  AND COLUMN_NAME = 'responsable_farmacia_id';
-- Resultado: 0 filas = OK
```

⚠️ **Nota**: Si ya hay cotizaciones con `responsable_farmacia_id` poblado, esa data se perderá.

---

## 🔗 Archivos Relacionados

- **Backend**: [api_cotizaciones.php](../../api_cotizaciones.php)
  - Función: `buscar_cotizacion_pendiente_farmacia()` (L510)
  - Modificado: `registrar_cotizacion()` (L1909)
  - Modificado: `editar_cotizacion()` (L2027)

- **Frontend**: [FarmaciaCotizadorPage.jsx](../../src/pages/FarmaciaCotizadorPage.jsx)
  - Auto-fetch (L1145)
  - Green banner (L1253)
  - Smart branching (L83)

- **Documentación**: [DIAGNOSTICO_AGRUPACION_COTIZACIONES.md](../../DIAGNOSTICO_AGRUPACION_COTIZACIONES.md)
  - Análisis completo
  - 3 opciones evaluadas
  - Roadmap de fases

---

## 📞 Soporte

Si algo falla durante la migración:

| Problema | Solución |
|----------|----------|
| "Duplicate column" | La columna ya existe → Seguro ignorar |
| "Can't create index" | Índice ya existe → Seguro ignorar |
| "Access denied" | Verificar permisos MySQL (usuario `root`) |
| "Syntax error" | Verificar MySQL versión >= 5.7 |
| "Timeout" | Ejecutar vía CLI en lugar de phpMyAdmin |

---

## 📝 Notas Importantes

✅ **Backward Compatible**: El código PHP verifica con `column_exists()` antes de usar la columna.

✅ **Sin Downtime**: Las operaciones ALTER TABLE en InnoDB son online en MySQL 5.7+.

✅ **Idempotente**: El script puede ejecutarse múltiples veces sin problemas.

✅ **Seguro**: Incluye validaciones pre y post-migración.

---

## 🎯 Próximas Fases

| Fase | Timeline | Esfuerzo | Depende de |
|------|----------|----------|------------|
| **Fase 1 Híbrida** | ✅ HOY | 4 horas | Esta migración |
| **Fase 2 Híbrida** | 4-6 semanas | 8 horas | Validación en producción |
| **Fase 3 Híbrida** | 3-4 meses | 15 horas | Requisitos del negocio |

---

**Versión**: 1.0  
**Creado**: 02/05/2026  
**Status**: PRODUCCIÓN-READY ✅

---

**¿Preguntas o problemas?** Consultar `FASE1_HIBRIDA_README.md` para más detalles.
