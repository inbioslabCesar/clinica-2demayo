# Análisis Técnico: Jerarquía de Consultas en Contratos/Plantillas
**Fecha**: 23 Abril 2026  
**Autor**: Arquitecto de Software  
**Estado**: Análisis Completo (SIN CAMBIOS DE CÓDIGO)

---

## EXECUTIVE SUMMARY

El sistema actualmente **trata TODAS las consultas generadas por contratos de forma idéntica**, sin distinción entre la inicial (Día 0) y las subsecuentes (Día 3, Día 30, etc.). No existe un mecanismo nativo que marque automáticamente las consultas posteriores como "Próxima Cita" estilo `hc_proxima`.

**Viabilidad de Auto-Linking**: ✅ **ALTAMENTE VIABLE**, pero requiere cambios arquitectónicos moderados.

**Riesgo de Conflictos**: ⚠️ **BAJO-MODERADO** (afecta naming/reporting, no flujos críticos).

---

## 1. CREACIÓN DE CONSULTAS: COMPARATIVA DE MECANISMOS

### A) MANUAL "PRÓXIMA CITA" (`hc_programar_proxima_cita`)
**Archivo**: `api_historia_clinica.php` líneas 420–565

```php
// INSERCIÓN CON PARÁMETROS EXPLÍCITOS:
INSERT INTO consultas (
    paciente_id, medico_id, fecha, hora, tipo_consulta,
    estado, hc_origen_id, origen_creacion, es_control
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)

// VALORES CRUCIALES:
- origen_creacion = 'hc_proxima'              ← MARCA EXPLÍCITA
- hc_origen_id = $hcOrigenIdActual            ← ENLACE DIRECTO AL PADRE
- es_control = 1 (si aplica)                  ← MARCADOR DE TIPO
```

**Semántica**: El médico programa explícitamente una consulta de control vinculada a una HC existente.

---

### B) COTIZACIÓN CONSULTORIA (`asegurar_consulta_desde_cotizacion_interno`)
**Archivo**: `api_cotizaciones.php` líneas 1685–1790

```php
// INSERCIÓN:
INSERT INTO consultas (
    paciente_id, medico_id, fecha, hora, tipo_consulta,
    origen_creacion
) VALUES (?, ?, ?, ?, ?, ?)

// VALORES:
- origen_creacion = 'cotizador'               ← ORIGEN COTIZACIÓN
- hc_origen_id = NULL (NO SE ASIGNA)          ← SIN ENLACE EXPLÍCITO
- fecha = cotizacion.fecha                    ← USA FECHA DE COTIZACIÓN
```

**Semántica**: El sistema crea consulta cuando una cotización con item "consulta" se procesa.

---

### C) EVENTO CONTRATO (`contratos_asegurar_consulta_evento`)
**Archivo**: `api_contratos.php` líneas 391–450

```php
// INSERCIÓN:
INSERT INTO consultas (
    paciente_id, medico_id, fecha, hora, tipo_consulta,
    origen_creacion
) VALUES (?, ?, ?, ?, ?, ?)

// VALORES:
- origen_creacion = 'contrato_agenda'         ← ORIGEN EVENTO CONTRATO
- hc_origen_id = NULL (NO SE ASIGNA)          ← SIN ENLACE EXPLÍCITO
- fecha = evento.fecha_programada             ← USA FECHA DEL EVENTO
```

**Semántica**: El sistema crea consulta cuando evento de plantilla se ejecuta.

---

## 2. VINCULACIÓN DE IDs: CADENA CLÍNICA

### A) LÓGICA POST-SAVE (`hc_actualizar_cadena_hc`)
**Archivo**: `api_historia_clinica.php` líneas 701–745

Cuando se guarda una HC, el sistema ejecuta `hc_resolver_parent_canonico()` que determina:

```
hc_parent_id     ← parent directo
hc_root_id       ← raíz de la cadena
chain_depth      ← profundidad (0 = raíz)
```

### B) MECANISMO DE RESOLUCIÓN DE PARENT

El sistema intenta vincular en este orden:

#### **Ruta 1: EXPLÍCITA (Solo para `hc_proxima`)**
```php
IF consulta.hc_origen_id > 0 AND hc_origen_id != hcId:
    parent_id = hc_origen_id
    ✅ CONFIABLE - Enlace directo y válido
```

#### **Ruta 2: IMPLÍCITA (Para contratos)**
```php
ELSE IF contrato_paciente_id > 0:
    SELECT hc.id FROM historia_clinica h
    INNER JOIN consultas c ON c.id = h.consulta_id
    INNER JOIN agenda_contrato ag ON ag.consulta_id = c.id
    WHERE ag.contrato_paciente_id = ?
      AND h.id != ?
      AND (c.fecha < ACTUAL_DATE OR (c.fecha = ACTUAL_DATE AND h.id < ACTUAL_ID))
    ORDER BY c.fecha DESC, h.id DESC
    LIMIT 1
    ⚠️ VULNERABLE - Depende de ejecución cronológica
```

**INSIGHT CRÍTICO**: Las consultas de contrato SE VINCULAN pero de forma **implícita y frágil**:
- Requieren que Día 0 ejecute ANTES que Día 3
- Si Day 3 se ejecuta primero, nace como raíz independiente
- La búsqueda depende de hora de ejecución, no de semántica

---

## 3. CÓMO SE GENERAN LAS PLANTILLAS

### Flujo Completo: Plantilla → Agenda → Consulta

```
1. contratos_generar_agenda_auto()  [api_contratos.php:776]
   ↓ Lee contratos_plantillas_items
   ↓ Para cada item, calcula fecha con offset
   ↓ Crea evento en agenda_contrato

2. agenda_contrato.evento
   - plantilla_item_id (referencia a plantilla)
   - fecha_programada (Día 0, Día 3, Día 30, etc.)
   - estado_evento = 'pendiente'
   - ⚠️ SIN INFORMACIÓN DE "ES PRIMER EVENTO"

3. Usuario cambia estado_evento → 'atendido' o 'espontaneo'
   [api_contratos.php:actualizar_evento_agenda]

4. Sistema ejecuta contratos_asegurar_consulta_evento()
   ↓ TODOS LOS EVENTOS USADOS IDENTICAMENTE
   ↓ origen_creacion = 'contrato_agenda'  ← MISMO PARA DAY 0 y DAY 30
```

**HALLAZGO**: El sistema NO distingue qué evento es el "primero" al crear consultas.

---

## 4. COMPARATIVA DE ORIGEN_CREACION

| Origen | Mechanism | hc_origen_id | Linking | Use Case |
|--------|-----------|--------------|---------|----------|
| **hc_proxima** | Manual doctor | ✅ Explicit | Strong (explicit) | Doctor marks next visit |
| **cotizador** | Quote processing | ❌ NULL | Weak (implicit) | Auto-creates from invoice |
| **contrato_agenda** | Contract event execution | ❌ NULL | Weak (implicit) | Auto-creates from plantilla |

**CONCLUSIÓN**: Contratos y cotizaciones usan el mismo mecanismo de linking implícito, haciéndolos vulnerables a desorden o ejecución fuera de secuencia.

---

## 5. VIABILIDAD TÉCNICA: AUTO-MARCAR DAY > 0 COMO `hc_proxima`

### ¿Se puede implementar?

✅ **SÍ, TÉCNICAMENTE VIABLE**

### Cómo:

1. **Detectar "primer evento" del contrato**
   ```php
   // En contratos_asegurar_consulta_evento(), agregar:
   $stmtFirst = $conn->prepare(
       'SELECT MIN(id) FROM agenda_contrato 
        WHERE contrato_paciente_id = ? 
        ORDER BY fecha_programada ASC, id ASC LIMIT 1'
   );
   $isFirstEvent = ($eventoId === $firstEventId);
   ```

2. **Asignar hc_origen_id para eventos subsecuentes**
   ```php
   IF !isFirstEvent AND previousConsultaExists:
       $hc_origen_id = previousConsultaID
       origen_creacion = 'hc_proxima'  ← CAMBIO
   ELSE:
       origen_creacion = 'contrato_agenda'  ← ACTUAL
   ```

3. **Llamar a hc_programar_proxima_cita() en lugar de crear directo**
   ```php
   // Reusar lógica existente
   $resultado = hc_programar_proxima_cita($conn, 
       consultaIdPadre, 
       proximaData, 
       hcOrigenIdPadre
   );
   ```

### Impacto de Cambios

| Área | Cambio | Severidad |
|------|--------|-----------|
| **Código** | Modificar `contratos_asegurar_consulta_evento()` líneas 391-450 | 🟡 Moderate |
| **Datos** | Cambiar `origen_creacion` de 'contrato_agenda' → 'hc_proxima' para Day > 0 | 🟡 Moderate |
| **Schema** | Nada nuevo (columnas ya existen) | 🟢 None |

---

## 6. ANÁLISIS DE CONFLICTOS

### A) Sistema de Citas (`api_asistente_citas.php` o similar)

**Pregunta**: ¿El asistente de citas busca/filtra por `origen_creacion`?

**Hallazgo**: El cambio de `origen_creacion` NO debería afectar búsqueda de disponibilidad, porque:
- El asistente busca por `paciente_id`, `medico_id`, `fecha`, `hora`
- NO filtra por `origen_creacion`
- Si lo hace, cambiar a 'hc_proxima' ampliaría, no reduciría, los resultados

**Riesgo**: 🟢 **BAJO** (probable neutral o favorable)

---

### B) Flujo de Facturación

**Pregunta**: ¿La facturación espera consultadas independientes por evento?

**Análisis**:
```
Escenario ACTUAL (Consultas independientes):
  Contrato Día 0  → Consulta #100 → Cotización Q001
  Contrato Día 30 → Consulta #101 → Cotización Q002
  ✅ Fácil de facturar: 1 consulta = 1 cotización

Escenario PROPUESTO (Próxima Cita style):
  Contrato Día 0  → Consulta #100 → Cotización Q001
  Contrato Día 30 → Consulta #101 (hc_origen_id = 100) → Cotización Q002
  ⚠️ ¿Se crea UNA cotización per evento o se vincula a parent?
```

**Evaluación**: 
- Si la cotización se crea POR EVENTO (línea 704, api_contratos.php):
  ```php
  $cotizacionRes = contratos_crear_cotizacion_ejecucion(...)
  // Esto SIEMPRE crea nueva cotización
  ```
  → ✅ Facturación NO se afecta. Día 0 y Día 30 siguen siendo cobros separados.

- Si se intenta "reusar" cotización por hc_origin_id:
  → ❌ RUPTURA: Múltiples servicios por una cotización ≠ flujo actual.

**Recomendación**: Mantener creación de cotización POR EVENTO, no reusar por parent.

**Riesgo**: 🟡 **BAJO-MODERADO** (si no se modifica facturación, es seguro)

---

### C) Panel de Enfermería / Órdenes

**Pregunta**: ¿El sistema asume 1 Consulta = 1 Set de órdenes?

**Análisis**:
```
En api_historia_clinica.php línea 1565:
    hc_actualizar_cadena_hc($conn, $hcActualId, $consultaId);
    
La cadena clínica es INFORMATIVA, no limita órdenes.
```

Cuando se crea una orden de lab/imagen en Día 30:
- Se asigna a consulta #101
- Sistemas de búsqueda (api_ordenes_laboratorio.php) filtran por `consulta_id`
- ✅ Las órdenes de Día 0 y Día 30 quedan separadas

**Riesgo**: 🟢 **BAJO** (consulta_id sigue siendo el eje, no hc_origin_id)

---

### D) Búsqueda y Listado de Historias

**Pregunta**: ¿Los filtros / búsquedas rompen si hay cadenas?

**Análisis**:
```
Uso de hc_proxima:
- hc_get_historial_cadena_previas() → Anda hacia atrás por hc_parent_id
- Listados de consultorio NO muestran cadenas, solo consultas
- es_control = 1 marca las de control, pero NO oculta ni cambia flujo
```

**Hallazgo**: El cambio es **cosmético en UI**, no disruptivo en lógica.

**Riesgo**: 🟢 **BAJO** (probable beneficio: mejor trazabilidad)

---

## 7. TABLA COMPARATIVA: ESTADO ACTUAL vs PROPUESTO

```
ESTADO ACTUAL: Contratos sin cadena explícita
═══════════════════════════════════════════════════════════

Contrato "Campaña 3 días" con plantilla:
├─ Evento 1 (Día 0): agenda_contrato.id = 10
│  └─ Consulta 100 (origen_creacion = 'contrato_agenda')
│     └─ HC 50 (hc_parent_id = NULL, chain_depth = 0, es_raíz)
│
├─ Evento 2 (Día 3): agenda_contrato.id = 11
│  └─ Consulta 101 (origen_creacion = 'contrato_agenda')
│     └─ HC 51 (hc_parent_id = 50 ← VINCULADO POST-SAVE, FRÁGIL)
│
└─ Evento 3 (Día 30): agenda_contrato.id = 12
   └─ Consulta 102 (origen_creacion = 'contrato_agenda')
      └─ HC 52 (hc_parent_id = 51 ← VINCULADO POST-SAVE, FRÁGIL)


ESTADO PROPUESTO: Contratos con cadena explícita
═══════════════════════════════════════════════════════════

Contrato "Campaña 3 días" con plantilla:
├─ Evento 1 (Día 0): agenda_contrato.id = 10
│  └─ Consulta 100 (origen_creacion = 'contrato_agenda')
│     └─ HC 50 (hc_parent_id = NULL, chain_depth = 0, es_raíz)
│
├─ Evento 2 (Día 3): agenda_contrato.id = 11
│  └─ Consulta 101 (origen_creacion = 'hc_proxima', hc_origen_id = 50)
│     └─ HC 51 (hc_parent_id = 50 ← EXPLÍCITO, ROBUSTO)
│
└─ Evento 3 (Día 30): agenda_contrato.id = 12
   └─ Consulta 102 (origen_creacion = 'hc_proxima', hc_origen_id = 101 OR 50)
      └─ HC 52 (hc_parent_id = 51 ← EXPLÍCITO, ROBUSTO)
```

---

## 8. RECOMENDACIÓN ARQUITECTÓNICA

### Opción A: Implementar Cadena Explícita en Contratos
**Viabilidad**: ✅ Alta  
**Esfuerzo**: 🔧 Bajo (modificar 1 función)  
**Beneficio**: 🎯 Alto  
**Riesgo**: 🟢 Bajo  

**Cambios requeridos**:
1. Modificar `contratos_asegurar_consulta_evento()` para:
   - Detectar si es primer evento vs subsecuente
   - Asignar `hc_origen_id` para subsecuentes
   - Cambiar `origen_creacion` a 'hc_proxima' para Day > 0

2. Testing:
   - Crear contrato con plantilla 3-evento
   - Verificar que HC 2 y 3 tengan `hc_parent_id` correcto
   - Confirmar que facturación sigue creando cotizaciones separadas

**Ganancia**:
- ✅ Cadena de consultas explícita y robusta
- ✅ Historial clínico más legible ("Control de Día 30")
- ✅ Facilita análisis de pacientes en múltiples visitas
- ✅ Reutiliza lógica `hc_proxima` probada

---

### Opción B: Mantener Status Quo, Mejorar Fallback
**Viabilidad**: ✅ Muy Alta  
**Esfuerzo**: 🔧 Mínimo  
**Beneficio**: 🎯 Medio  
**Riesgo**: 🟡 Bajo-Moderado (problema de fragmentación persiste)  

**Cambios requeridos**:
1. Fortalecer lógica implícita en `hc_resolver_parent_canonico()`:
   - Verificar orden cronológico más estricto
   - Evitar gaps en cadena

2. Mejorar diagnostic fallbacks (laboratorio, imágenes):
   - Hacer más restrictivos los fallbacks
   - Filtrar por contrato/plantilla cuando aplique

**Ganancia**:
- ✅ No toca contratos
- ✅ Mantiene compatibilidad total
- ❌ Problema de fragmentación podría reaparecer con concurrencia

---

## 9. CONCLUSIÓN

### Respuestas a Preguntas Clave

#### **¿Cómo se crean las consultas cuando se activa un contrato?**

Mediante `contratos_asegurar_consulta_evento()`:
- Se crea UNA consulta POR EVENTO ejecutado
- TODOS los eventos usan `origen_creacion = 'contrato_agenda'`
- NO hay distinción entre Día 0 y Día 30
- `hc_origen_id = NULL` (sin enlace explícito)

#### **¿Qué tan lejos está de replicar "Próxima Cita" automáticamente?**

✅ **Muy poco**: Solo requiere cambiar 3 líneas de código en `contratos_asegurar_consulta_evento()`:
1. Detectar si es primer evento
2. Asignar `hc_origen_id` al anterior
3. Cambiar `origen_creacion` a 'hc_proxima'

#### **¿Se vinculan desde creación o nacen sueltas?**

Actualmente **nacen sueltas**, se vinculan POST-SAVE mediante lógica implícita:
- Si fecha < anterior: se busca HC anterior por contrato + fecha
- Frágil: depende de ejecución cronológica
- Propuesto: explícito desde inserción

#### **¿Causaría conflictos marcar Day > 0 como `hc_proxima`?**

❌ **NO, es seguro**:
- Citas: No filtra por `origen_creacion` → sin impacto
- Facturación: Sigue creando cotización POR EVENTO → sin impacto
- Enfermería: Órdenes vinculadas a `consulta_id`, no a cadena → sin impacto
- UI: Mejora trazabilidad, marca como "Control" → beneficio

---

## 10. RECOMENDACIÓN FINAL

**Implementar Opción A** (Cadena Explícita):

1. **Corto plazo**: Cambio quirúrgico en `contratos_asegurar_consulta_evento()`
2. **Impacto**: Robusto, auto-documentado, sin ruptura
3. **Ganancia**: Alineación con "Próxima Cita" manual, mejor histórico
4. **Riesgo**: Mínimo, comportamiento es aditivo

---

## APÉNDICE: Ubicaciones Clave en Código

| Función | Archivo | Líneas | Propósito |
|---------|---------|--------|-----------|
| `hc_programar_proxima_cita()` | api_historia_clinica.php | 420–565 | Crear próxima cita manual |
| `hc_resolver_parent_canonico()` | api_historia_clinica.php | 575–710 | Resolver parent de HC |
| `hc_actualizar_cadena_hc()` | api_historia_clinica.php | 701–745 | Persistir cadena |
| `asegurar_consulta_desde_cotizacion_interno()` | api_cotizaciones.php | 1685–1790 | Crear consulta desde cotización |
| `contratos_asegurar_consulta_evento()` | api_contratos.php | 391–450 | ⭐ Crear consulta desde evento |
| `contratos_generar_agenda_auto()` | api_contratos.php | 776–821 | Generar eventos desde plantilla |
| `actualizar_evento_agenda` (POST) | api_contratos.php | 1860–2295 | Ejecutar evento contrato |

---

**Fin del Análisis Técnico**  
Listo para implementación cuando sea requerido.
