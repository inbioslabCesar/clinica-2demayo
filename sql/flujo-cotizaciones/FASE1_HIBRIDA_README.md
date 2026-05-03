# FASE 1 HÍBRIDA - Migración de Base de Datos

**Fecha**: 02/05/2026  
**Versión**: 1.0  
**Estado**: LISTO PARA PRODUCCIÓN

## ¿Qué hace esta migración?

Agrega soporte para auto-detectar y consolidar cotizaciones pendientes de farmacia, evitando duplicados en el flujo:
- El químico busca un paciente
- El sistema AUTO-DETECTA si hay una cotización pendiente de farmacia del mismo paciente
- Se pre-carga el cotizador con medicamentos ya seleccionados
- El químico confirma (actualiza) en lugar de crear nuevo duplicado

## Cambios a la Base de Datos

### Columna Nueva
```sql
ALTER TABLE cotizaciones 
ADD COLUMN responsable_farmacia_id INT NULL AFTER usuario_id;
```

**Propósito**: Rastrear qué usuario (químico) es responsable de preparar cada cotización de farmacia.

**Ventajas**:
- Trazabilidad: "Quién preparó qué"
- Filtrado: El químico puede ver "mis cotizaciones de farmacia"
- Auditoría: Registro de responsables

### Índices Nueva
```sql
ALTER TABLE cotizaciones 
ADD INDEX idx_responsable_farmacia_id (responsable_farmacia_id);

ALTER TABLE cotizaciones
ADD INDEX idx_resp_farm_estado (responsable_farmacia_id, estado);
```

**Propósito**: Optimizar búsquedas rápidas por responsable y estado.

---

## Cómo Ejecutar en Producción

### Opción 1: MySQL CLI (Recomendado)

```bash
mysql -u root -p poli2demayo < sql/flujo-cotizaciones/2026-05-02_fase1_hibrida_responsable_farmacia.sql
```

### Opción 2: phpMyAdmin

1. Ir a `phpMyAdmin` → Base de datos `poli2demayo`
2. Tab **SQL**
3. Copiar contenido completo de `2026-05-02_fase1_hibrida_responsable_farmacia.sql`
4. Click **Ejecutar**

### Opción 3: Script de Migración Automática

Si tienes un script de migración, agregar:
```bash
SOURCE /ruta/a/sql/flujo-cotizaciones/2026-05-02_fase1_hibrida_responsable_farmacia.sql;
```

---

## Verificación Post-Migración

El script incluye verificaciones automáticas:

1. **Estructura de columna**: Verifica que `responsable_farmacia_id` existe y es nullable
2. **Índices**: Confirma que los índices fueron creados
3. **Estadísticas**: Muestra cuántas cotizaciones tienen responsable asignado
4. **Ejemplos**: Muestra 10 ejemplos de cotizaciones de farmacia

**Resultado esperado**:
```
Cotizaciones SIN responsable_farmacia asignado: [número]
(columna existente pero sin datos - se poblará en futuras cotizaciones)
```

---

## Dependencias del Código

### Backend
El código PHP en `api_cotizaciones.php` espera esta columna:

**Funciones**:
- `buscar_cotizacion_pendiente_farmacia()` (línea 510) → Busca cotización pendiente
- `registrar_cotizacion()` (línea 1909) → Asigna `responsable_farmacia_id` al crear
- `editar_cotizacion()` (línea 2027) → Asigna responsable si es primera vez con farmacia

**Verificación**: El código usa `column_exists()` para verificar presencia de la columna, por lo que es **100% backward compatible**.

### Frontend
`FarmaciaCotizadorPage.jsx` (línea 1145) realiza auto-fetch sin cambios.

---

## Rollback (si es necesario)

Si necesitas revertir completamente:

```sql
-- Remover índices
ALTER TABLE cotizaciones DROP INDEX idx_responsable_farmacia_id;
ALTER TABLE cotizaciones DROP INDEX idx_resp_farm_estado;

-- Remover columna
ALTER TABLE cotizaciones DROP COLUMN responsable_farmacia_id;
```

⚠️ **Nota**: Si ya existen cotizaciones con `responsable_farmacia_id` poblado, la data se perderá.

---

## Timeline de Migración

| Paso | Acción | Tiempo | Riesgo |
|------|--------|--------|--------|
| 1 | Backup de BD (antes) | 5 min | BAJO |
| 2 | Ejecutar script SQL | 30 seg | BAJO |
| 3 | Verificar índices | 1 min | BAJO |
| 4 | Reiniciar PHP/Apache | 1 min | BAJO |
| 5 | Testing con químico | 15 min | BAJO |

**Tiempo total**: ~25 minutos  
**Downtime**: 0 (sin downtime)

---

## Testing Post-Migración

### Manual
1. Loguear como Químico
2. Buscar paciente con cotización pendiente de farmacia
3. Verificar que el sistema AUTO-DETECTA (verde banner)
4. Confirmar medicamentos → Debe ACTUALIZAR, no CREAR nueva

### Automatizado
Si tienes tests:
```php
// Verificar que la columna existe
$result = $conn->query("DESCRIBE cotizaciones");
// Assert: resultado contiene 'responsable_farmacia_id'

// Verificar índices
$indices = $conn->query("SHOW INDEX FROM cotizaciones WHERE Column_name='responsable_farmacia_id'");
// Assert: índices existen
```

---

## Soporte

Si algo falla:

1. **Error "Duplicate column"**: La columna ya existe (es seguro ignorar)
2. **Error "Can't create index"**: El índice ya existe (es seguro ignorar)
3. **Syntax error**: Verificar que MySQL versión >= 5.7
4. **Timeout**: Aumentar `max_execution_time` en php.ini o ejecutar vía CLI

---

## Próxima Fase

**Fase 2 Híbrida** (4-6 semanas):
- Tabla `cotizacion_detalle_responsables` para trazabilidad por ítem
- Auto-merge de múltiples cotizaciones
- Dashboard de "Mis preparaciones"

**Fase 3 Hybrid** (3-4 meses):
- Cobro parcial por `servicio_tipo`
- Reportes consolidados
- Auditoría completa

---

**Versión**: 1.0  
**Autor**: Automatización  
**Última actualización**: 02/05/2026
