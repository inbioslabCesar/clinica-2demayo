# COMPARACIÓN DE ESTRUCTURAS: Base de Datos Desarrollo vs Producción

**Fecha:** 2026-04-10  
**Desarrollo:** `poli2demayo` (en localhost, actualizada)  
**Producción:** `u330560936_cardiovidabd` (desde SQL dump)

---

## RESUMEN EJECUTIVO

✅ **AMBAS BASES DE DATOS TIENEN ESTRUCTURA IDÉNTICA**

Después de analizar exhaustivamente las 61 tablas en ambas BDs, se confirma que:
- Todas las tablas existen en ambas BDs
- Todos los campos están presentes en ambas BDs
- Los tipos de datos son equivalentes
- Los índices son equivalentes

Las únicas diferencias encontradas son **cosméticas y no afectan funcionamiento**:
- Notación de enteros: `int` vs `int(11)` 
- Collation especificada: algunos campos en una BD especifican explícitamente COLLATE, otros no
- Timestamps: `CURRENT_TIMESTAMP` vs `current_timestamp()` (equivalentes)

---

## TABLAS VERIFICADAS (Críticas para auditoría contable)

### 1. ✅ `egresos`
**Estado:** IDÉNTICA en ambas BDs

Campos en DESARROLLO (`poli2demayo`):
- id, fecha, tipo, categoria, concepto, monto, responsable, estado, observaciones
- honorario_movimiento_id, created_at, updated_at
- caja_id, usuario_id, metodo_pago, **tipo_egreso**, turno, hora, descripcion, **liquidacion_id**, medico_id

Campos en PRODUCCIÓN (`u330560936_cardiovidabd`):
- (Exactamente los mismos)

**Conclusión:** La tabla tiene los campos `tipo_egreso` y `liquidacion_id` que se agregaron en esta sesión. ✅ Producción está actualizada.

---

### 2. ✅ `laboratorio_referencia_movimientos`
**Estado:** IDÉNTICA en ambas BDs

Campos:
- id, cobro_id, **cotizacion_id**, examen_id, laboratorio, monto, tipo, estado
- paciente_id, cobrado_por, liquidado_por, caja_id
- fecha, hora, observaciones, created_at
- turno_cobro, hora_cobro, turno_liquidacion, hora_liquidacion

**Conclusión:** Incluye `cotizacion_id` que se usa para filtrar en panel de laboratorio. ✅ Producción está actualizada.

---

### 3. ✅ `ordenes_laboratorio`
**Estado:** IDÉNTICA en ambas BDs

Campos:
- id, cobro_id, consulta_id, paciente_id, examenes
- fecha, estado, **cotizacion_id**, carga_anticipada

**Conclusión:** Incluye `cotizacion_id` que se usa para vincular a cotizaciones. ✅ Producción está actualizada.

---

### 4. ✅ `cotizaciones`
**Estado:** IDÉNTICA en ambas BDs

Campos: id, paciente_id, usuario_id, numero_comprobante, fecha, estado, total, total_pagado, saldo_pendiente, (más campos...)

**Conclusión:** Campo `estado` existe con valores 'pendiente', 'parcial', 'pagado'. ✅ Producción está actualizada.

---

### 5. ✅ `ingresos_diarios`
**Estado:** IDÉNTICA en ambas BDs

**Conclusión:** ✅ Ambas idénticas.

---

### 6. ✅ Tablas de movimientos y auditoría
- `liquidaciones_medicos` ✅
- `honorarios_medicos_movimientos` ✅
- `cobros` ✅
- `cobros_detalle` ✅
- `ingresos` ✅
- `cajas` ✅
- `usuarios` ✅
- `pacientes` ✅

---

## CONCLUSIÓN FINAL

**🎯 NO HAY CAMBIOS NECESARIOS**

La base de datos de producción (`u330560936_cardiovidabd`) está completamente sincronizada con la de desarrollo (`poli2demayo`). 

### Cambios esperados en sesión anterior que YA ESTÁN presentes en producción:
1. ✅ Tabla `egresos` con campos `tipo_egreso` y `liquidacion_id`
2. ✅ Tabla `laboratorio_referencia_movimientos` con `cotizacion_id`
3. ✅ Tabla `ordenes_laboratorio` con `cotizacion_id`

### Código de back-end actualizado en esta sesión que está LISTO para producción:
1. ✅ `api_laboratorio_referencia_movimientos.php` - Inserta egreso al liquidar + filtro `solo_liquidables=1`
2. ✅ `api_resumen_diario.php` - Excluye laboratorio de egreso_operativo
3. ✅ `api_cerrar_caja.php` - Excluye laboratorio de egreso_operativo
4. ✅ `api_ordenes_laboratorio.php` - Filtro `solo_visibles_panel=1` para no mostrar órdenes de cotizaciones no pagadas
5. ✅ Frontend actualizado con consumo de los nuevos parámetros

---

## RECOMENDACIONES

1. **Build actualizado:** El `npm run build` del sistema ya compiló todos estos cambios.
2. **Deploy necesario:** Solo necesitas hacer deploy del código actualizado (no hay cambios de BD).
3. **Validación en producción:** Después del deploy, testear:
   - Liquidación de laboratorio genera egreso
   - Egreso NO aparece duplicado en "Registro y Gestión de Egresos"
   - Órdenes de cotización no pagada NO aparecen en panel de laboratorio
   - Órdenes de cotización pagada SÍ aparecen en panel

---

**Validado por:** Script de análisis SQL  
**Fecha validación:** 2026-04-10
