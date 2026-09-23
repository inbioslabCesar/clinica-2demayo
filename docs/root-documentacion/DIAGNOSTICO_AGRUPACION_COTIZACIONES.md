# DIAGNÓSTICO ARQUITECTÓNICO: Agrupación de Cotizaciones Multi-Servicio

**Fecha**: 02/05/2026  
**Versión**: 1.0  
**Estado**: LISTO PARA IMPLEMENTACIÓN (con mitigaciones)

---

## 1. ESTADO ACTUAL DEL SISTEMA

### 1.1 ¿Cómo se registran las cotizaciones actualmente?

```
CONTEXTO A: HISTORIA CLÍNICA (Médico)
┌────────────────────────────────────────┐
│ Médico abre HC de paciente             │
│ Click en "Solicitar Laboratorio"       │
│ → POST a api_ordenes_laboratorio.php   │
│   Crea ORDEN (vinculada a CONSULTA)    │
│                                        │
│ Click en "Solicitar Rayos X"           │
│ → POST a api_ordenes_imagen.php        │
│   Crea OTRA ORDEN (separada)           │
│                                        │
│ Click en "Solicitar Ecografía"         │
│ → POST a api_ordenes_imagen.php        │
│   Crea OTRA ORDEN (separada)           │
└────────────────────────────────────────┘
        ↓ (Paciente va a recepción)

CONTEXTO B: RECEPCIÓN / COTIZADOR (Químico/Administrativo)
┌────────────────────────────────────────┐
│ Recepcionista abre SeleccionarServicio │
│ Click en "Laboratorio"                 │
│ → POST registrar_cotizacion()          │
│   Crea COTIZACIÓN #123                 │
│   Detalles: [lab1, lab2, lab3]         │
│                                        │
│ Click en "Farmacia"                    │
│ → POST editar_cotizacion(cot=123)      │
│   Agrega a MISMA COTIZACIÓN #123       │
│   Detalles: [lab1, lab2, lab3, farm1]  │
│                                        │
│ Click en "Rayos X"                     │
│ → POST editar_cotizacion(cot=123)      │
│   Agrega a MISMA COTIZACIÓN #123       │
│   Detalles: [lab1, lab2, ..., rayox1]  │
└────────────────────────────────────────┘
```

**HALLAZGO**: El sistema YA soporta múltiples servicios en 1 cotización, pero **SOLO en Contexto B** (recepción).
- ✅ Backend `detalles[]` normalizado por `servicio_tipo`
- ✅ `registrar_cotizacion()` crea 1 header + N detalles
- ❌ Contexto A (HC) crea órdenes separadas, NO cotizaciones

### 1.2 ¿Por qué se crean múltiples cotizaciones?

**Raíz**: Flujo de usuario actual:

1. Paciente solicita **Laboratorio** → Recepción abre `/cotizar-laboratorio`
   - Crea Cotización #1 (con lab items)
   - Usuario ve botón "Guardar"

2. Paciente luego pide **Farmacia** → Recepción abre `/cotizar-farmacia` (SIN parámetro `cotizacion_id`)
   - **Crea Cotización #2** (nueva, no reutiliza #1)
   - Falta lógica para detectar "¿existe cotización pendiente del mismo paciente?"

3. Paciente pide **Rayos** → Crea **Cotización #3** (nueva)

**PROBLEMA ARQUITECTÓNICO**: No hay "carrito inteligente" que mantenga contexto.

---

## 2. ANÁLISIS: ¿DAÑARÍA AGRUPAR AL QUÍMICO?

### 2.1 IMPACTO EN FLUJO ACTUAL DEL QUÍMICO

| Aspecto | Estado Actual (Separadas) | Con Agrupación (Mixtas) | Riesgo | Mitigación |
|---------|---------------------------|------------------------|--------|-----------|
| **Buscar** | `cotizacion_id = 123` (solo farmacia) | `cotizacion_id = 123` (lab+farm+rayos) | MEDIO | ✅ Filtro UI por `servicio_tipo` |
| **Preparar** | "Sé que #567 es farmacia" | "En #567 hay 3 servicios, ¿cuál preparo?" | ALTO | ✅ Vista expandida + filtro activo |
| **Descontar Stock** | Automático por `servicio_tipo='farmacia'` | Automático (IGUAL) | BAJO | ✅ Ya funciona |
| **Registrar Responsable** | Falta (nadie sabe quién preparó) | Falta (IGUAL) | ALTO | ⚠️ Necesita tabla nueva |
| **Cobro Parcial** | No existe (no puede cobrar solo farm) | No existe (IGUAL) | ALTO | ⚠️ Necesita UI nueva en cobro |
| **Trazabilidad** | "Química X preparó cot #567" | "¿Cuál químico preparó qué en #567?" | ALTO | ⚠️ Necesita auditoría mejorada |

### 2.2 ANÁLISIS DE RIESGOS

#### 🔴 RIESGOS ALTOS (Requieren cambios)

**1. Responsabilidad / Trazabilidad** (SEVERIDAD: ALTA)
- **Problema**: Tabla `cotizaciones_detalle` NO tiene campo `responsable_usuario_id`
- **Impacto**: No se sabe quién preparó cada medicamento
- **Síntoma Actual**: Si cotización #567 tiene [Lab, Farmacia, Rayos] sin asignar responsables
- **Mitigación**: Crear tabla `cotizacion_detalle_responsables(cotizacion_detalle_id, usuario_id, rol, fecha)`
- **Esfuerzo**: 8-10 horas (DB + backend + UI)

**2. Cobro Parcial** (SEVERIDAD: ALTA)
- **Problema**: `CobrarCotizacionPage.jsx` NO permite seleccionar "solo farmacia"
- **Impacto**: Si paciente quiere pagar solo medicamentos, sistema cobra todo o nada
- **Síntoma Actual**: Botón "Cobrar" aplica a toda la cotización
- **Mitigación**: Agregar checkboxes para cada detalle o grupo por `servicio_tipo`
- **Esfuerzo**: 12-15 horas (frontend + backend validaciones)

**3. Separación Visual** (SEVERIDAD: MEDIA)
- **Problema**: Químico ve mezcla sin claridad
- **Impacto**: Confusión al buscar "¿dónde está mi farmacia?"
- **Mitigación**: Agregar tabs/filtros por servicio en cotizador + panel farmacia
- **Esfuerzo**: 2-3 horas

#### 🟡 RIESGOS MEDIOS (Verificados, bajo control)

- ✅ **Stock**: Ya descuenta correctamente por `servicio_tipo`
- ✅ **Seguridad**: Validación de paciente ya garantizada
- ✅ **Datos**: API normaliza detalles sin problemas

---

## 3. RECOMENDACIÓN ARQUITECTÓNICA

### 3.1 OPCIÓN A: Mantener Separadas (Recomendación ACTUAL)

**Estructura**:
```
Cotización #1: LABORATORIO [lab1, lab2]
Cotización #2: FARMACIA [med1, med2]
Cotización #3: RAYOS X [rx1]
```

**Ventajas**:
- ✅ Químico tiene total claridad (cada cot = un servicio)
- ✅ Cobro parcial es trivial (cobro todo de la cot)
- ✅ Trazabilidad natural: "cot #567 = farmacia"
- ✅ Responsabilidad implícita: "quien abrió la cot es responsable"
- ✅ Cero cambios = cero riesgo

**Desventajas**:
- ❌ UX recepción es más lenta (click cada servicio)
- ❌ Reportes requieren JOIN múltiples cotizaciones
- ❌ Descuentos de paquetes no aplican automáticamente

**Costo de NO hacer cambios**: BAJO (5-10 líneas backend si acaso)

---

### 3.2 OPCIÓN B: Agrupar TODO (Recomendación FUTURA, Fase 3)

**Estructura**:
```
Cotización #1: MULTISERV [lab1, lab2, med1, med2, rx1]
              └─ Detalles agrupados por servicio_tipo
```

**Ventajas**:
- ✅ UX recepción optimizada (un "carrito")
- ✅ Reportes consolidados automáticos
- ✅ Descuentos por volumen más fáciles
- ✅ Mejor para paquetes/convenios

**Desventajas**:
- ❌ Requiere 3 cambios arquitectónicos (tabla responsables, cobro parcial, auditoría)
- ❌ Riesgo de confusión en químico si no tiene filtros
- ❌ Cobro requiere lógica nueva para "¿quién paga qué?"

**Costo**: 30-40 horas + testing (4-5 semanas)

---

### 3.3 OPCIÓN C (HÍBRIDA - MEJOR EQUILIBRIO)

**Implementar AHORA**:
1. ✅ Agregar campo `es_multiservicio` a cotizaciones (boolean)
2. ✅ Mantener creación de cotizaciones POR SERVICIO (default)
3. ✅ Permitir manualmente "vincular" cotizaciones en UI:
   ```
   "Cotizaciones pendientes del mismo paciente: #567, #568, #569"
   → Click "Consolidar" → Nueva Cotización Maestra #570
   ```

**Ventajas**:
- ✅ Flexibilidad: usuario elige si agrupar o no
- ✅ Mantiene compatibilidad con químico
- ✅ Escala en el futuro a auto-agrupación

**Costo**: 15-20 horas (alcanza 1-2 sprints)

---

## 4. PROPUESTA FINAL PARA EL QUÍMICO

### 4.1 Panel de Farmacia Mejorado (Sin riesgo)

**ANTES** (estado actual):
```
Panel de Cotizaciones
├─ Cot #567 (Laboratorio) → descarta
├─ Cot #568 (Farmacia) ✓ VE ESTO
├─ Cot #569 (Rayos X) → descarta
```

**DESPUÉS** (con cambio MÍNIMO):
```
Panel de Cotizaciones
├─ Cot #567 Laboratorio
├─ Cot #568 Farmacia ✓ FILTRADO AUTOMÁTICO
│  └─ [Medicamentos seleccionados, stock validado]
│  └─ Estado: Preparado / Despachado
├─ Cot #569 Rayos X
└─ Nuevo: BUSCAR POR RESPONSABLE
   └─ "Mi nombre" → filtra solo cotizaciones que prepare yo
```

**Implementación** (2-3 horas):
- Agregar field `responsable_farmacia_id` a table `cotizaciones`
- Asignar automático al crear cot de farmacia
- Filtro en UI: `servicio_tipo LIKE '%farmacia%'`

---

## 5. CONCLUSIÓN Y RECOMENDACIÓN

### 🎯 RESPUESTA A TU PREGUNTA

**¿Se dañaría agrupar cotizaciones?** 
→ **SÍ, moderadamente, SI NO se mitigan 3 problemas** (responsabilidad, cobro parcial, auditoría)

**¿Es mejor mantenerlas separadas?** 
→ **SÍ, por ahora. Es el riesgo CERO y el químico es feliz.**

**¿Cuál es la mejor vía?**

```
CORTO PLAZO (Próx 2-3 semanas):
├─ OPCIÓN C HÍBRIDA
├─ Mejorar panel farmacia (filtro visual)
├─ Agregar `responsable_farmacia_id` a cot
└─ Permitir vincular cotizaciones manualmente

MEDIANO PLAZO (6-8 semanas):
├─ Agregar tabla `cotizacion_detalle_responsables`
├─ Auto-agrupar cotizaciones del MISMO paciente
├─ Mejorar auditoría

LARGO PLAZO (3-4 meses):
├─ Implementar cobro parcial en CobrarCotizacionPage
├─ Dashboard de responsables (quién preparó qué)
└─ Reportes consolidados
```

---

## 6. PASOS LÓGICOS PARA CORREGIR

### SI DECIDES AGRUPAR AHORA:

**Paso 1**: Detectar "¿ya existe cotización pendiente para este paciente HOY?"
```php
// En FarmaciaCotizadorPage.jsx (línea ~380)
// Antes de crear_cotizacion():
const existenteCot = await authFetch(
  `api_cotizaciones.php?accion=buscar_pendiente_farmacia&paciente_id=${pacienteId}`
);

if (existenteCot.cotizacion_id) {
  // Usar modo EDITAR, no REGISTRAR
  payload.accion = 'editar';
  payload.cotizacion_id = existenteCot.cotizacion_id;
} else {
  payload.accion = 'registrar'; // crear nueva
}
```

**Paso 2**: Backend valida coherencia
```php
// En api_cotizaciones.php (línea 1869):
function registrar_cotizacion($conn, $data) {
    // ... código existente ...
    
    // NUEVO: validar que todos los detalles sean del MISMO paciente
    foreach ($detalles as $det) {
        if ($det['paciente_id'] && $det['paciente_id'] != $pacienteId) {
            throw new Exception("Detalles mixtos de distintos pacientes");
        }
    }
    
    // Crear 1 cotización, N detalles
    $cotizacionId = crear_header(...);
    foreach ($detalles as $det) {
        insertar_detalle($cotizacionId, $det);
    }
}
```

**Paso 3**: DB::transaction (ya está en place)
```php
// api_cotizaciones.php (línea 1894):
$conn->begin_transaction(); // ← YA EXISTE
try {
    // inserts aquí
    $conn->commit();
} catch {
    $conn->rollback(); // ← atomicidad garantizada
}
```

**Paso 4**: Químico ve cotización mixta
```
CotizacionMixta #123:
├─ Laboratorio (3 ítems) ✓ FILTRO ACTIVO
│  └─ [Hemograma, Glucosa, Colesterol]
├─ Farmacia (2 medicamentos) ✓ FILTRO ACTIVO
│  └─ [Paracetamol, Amoxicilina]
└─ Rayos X (1 estudio) ← NO VISIBLE (filtro farmacia)
```

---

## 7. MATRIZ DE DECISIÓN

| Factor | Separadas | Agrupadas | Ganador |
|--------|-----------|-----------|---------|
| **Riesgo para Químico** | 0 | 3/10 (con mitigaciones) | SEPARADAS |
| **UX Recepción** | Normal | Mejor | AGRUPADAS |
| **Complejidad Código** | Baja | Media | SEPARADAS |
| **Trazabilidad** | Implícita | Requiere tabla nueva | SEPARADAS |
| **Flexibilidad Futuro** | Baja | Alta | AGRUPADAS |

**VEREDICTO**: Mantenerse en **SEPARADAS** + mejorar UI farmacia. En 3-4 meses: migrar a **HÍBRIDA**.

---

## 8. ARCHIVOS A MODIFICAR (si implementas)

### Backend (api_cotizaciones.php)
- L1869: `registrar_cotizacion()` - agregar detección de cotización existente
- L1997: `editar_cotizacion()` - permitir cambio de servicio_tipo
- L3203: agregar `buscar_cotizacion_pendiente_farmacia()` ← NUEVO

### Frontend (FarmaciaCotizadorPage.jsx)
- L380: Agregar llamada a `buscar_pendiente_farmacia()`
- L400: Determinar `accion = 'registrar' OR 'editar'`

### DB (1 migración)
```sql
ALTER TABLE cotizaciones ADD COLUMN responsable_farmacia_id INT DEFAULT NULL;
ALTER TABLE cotizaciones ADD COLUMN es_multiservicio TINYINT DEFAULT 0;
-- Tabla nueva (Fase 2):
CREATE TABLE cotizacion_detalle_responsables (
    id INT PRIMARY KEY AUTO_INCREMENT,
    cotizacion_detalle_id INT NOT NULL,
    usuario_id INT NOT NULL,
    rol ENUM('preparador', 'supervisor', 'auditor'),
    fecha_asignacion DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cotizacion_detalle_id) REFERENCES cotizaciones_detalle(id)
);
```

---

**Fin del Diagnóstico**
