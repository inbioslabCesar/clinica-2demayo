# ANÁLISIS DETALLADO: Flujo de Farmacia/Químico y Cotizaciones Mixtas

**Generado**: 2 de mayo 2026  
**Autor**: Análisis automatizado  
**Estado**: Cotizaciones actualmente SEPARADAS por tipo de servicio

---

## ÍNDICE RÁPIDO
1. [Ubicaciones de Archivos](#ubicaciones-de-archivos)
2. [Dónde Ve el Químico las Solicitudes](#dónde-ve-el-químico-las-solicitudes)
3. [Flujo Actual de Registro](#flujo-actual-de-registro)
4. [Impactos de Cambio a Mixtas](#impactos-de-cambio-a-cotizaciones-mixtas)
5. [Cambios Requeridos](#cambios-requeridos-roadmap)

---

## UBICACIONES DE ARCHIVOS

### Frontend - Componentes de Farmacia

| Componente | Ruta | Líneas Clave | Propósito |
|-----------|------|--------------|-----------|
| **FarmaciaCotizadorPage** | `src/pages/FarmaciaCotizadorPage.jsx` | 1-1600 | Cotizador de medicamentos, gestión de stock |
| Panel de Ventas | `src/pages/FarmaciaVentasPage.jsx` | 1-500+ | Historial de ventas de farmacia, filtros por fecha |
| MedicamentosList | `src/farmacia/MedicamentosList.jsx` | 1-2000+ | Gestión de medicamentos, stock, vencimiento |
| SidebarFarmacia | `src/farmacia/SidebarFarmacia.jsx` | 1-45 | Menú de navegación del módulo |
| QuimicoPanelPage | `src/pages/QuimicoPanelPage.jsx` | 1-40 | Panel principal del químico |

### Backend - APIs de Farmacia

| API | Ruta | Líneas Clave | Propósito |
|-----|------|--------------|-----------|
| **api_cotizaciones.php** | Root | 1869-2050 | `registrar_cotizacion()` para crear cotizaciones |
| | | 2000-2150 | `editar_cotizacion()` para actualizar existentes |
| | | 861-950 | `insertar_detalles_cotizacion()` - inserta con `servicio_tipo` |
| | | 903-1000 | `descontar_stock_farmacia_desde_detalles()` |
| | | 3203-3260 | `buscar_cotizacion_pendiente_farmacia()` - evita duplicados |
| api_cotizaciones_farmacia | Root | 1-500 | API específica para panel de ventas farmacia |
| | | 145-300 | `obtener_ventas_generales_farmacia()` - filtra con farmacia |
| | | 129-140 | `normalizar_venta_legacy()` - estructura de venta |
| api_medicamentos | Root | - | Listado y gestión de medicamentos |

---

## DONDE VE EL QUÍMICO LAS SOLICITUDES

### PUNTO 1: Panel de Ventas (Historial)

**Ubicación**: `/farmacia/ventas` → `FarmaciaVentasPage.jsx`

**Líneas clave**:
- **15-50**: States para ventas, paginación, filtros de fecha
- **62**: `cargarVentas()` - inicia carga de ventas
- **67-75**: URL de API: `api_cotizaciones_farmacia.php?page=...&limit=...&fecha_inicio=...&fecha_fin=...`
- **150-250**: Render de tabla con:
  - Fecha (línea ~180)
  - Referencia `v.referencia` (línea ~182)
  - Paciente `v.paciente_nombre` (línea ~184)
  - DNI `v.paciente_dni` (línea ~186)
  - Vendido por `v.usuario_nombre` (línea ~188)
  - Total `v.total` (línea ~190)
  - Estado `v.estado` (línea ~192)
  - Botón "Ver" detalle (línea ~194)

**Backend**:
- `api_cotizaciones_farmacia.php:145-300` → `obtener_ventas_generales_farmacia()`
  - Filtra por `servicio_tipo = 'farmacia'` en cobros_detalle (línea ~172)

### PUNTO 2: Cotizador de Medicamentos (Crear/Editar)

**Ubicación**: `/farmacia/cotizador` → `FarmaciaCotizadorPage.jsx`

**CREAR NUEVA:**
- **1115-1200**: Búsqueda de paciente con `PacienteListSearch`
  - Obtiene `paciente_id`, `nombre`, `dni`, `historia_clinica`
- **1115**: `onPacienteEncontrado()` llama a `buscar_cotización_pendiente_farmacia` (línea 1137)
- **1137-1180**: Intenta cargar cotización pendiente del mismo paciente/día
  - URL: `api_cotizaciones.php?accion=buscar_pendiente_farmacia&paciente_id={id}`
  - Si existe: precarga ítems farmacia, entra en modo edición
  - Si no existe: prepara para crear nueva

**REGISTRAR:**
- **130-224**: `handleRegistrarVenta()` - procesa el registro
  - Línea 161-170: Construye array `detalles` con:
    ```javascript
    {
      servicio_tipo: 'farmacia',
      servicio_id: medicamento_id,
      descripcion: nombre + "(Caja)" o "(Unidad)",
      cantidad: cantidad_seleccionada,
      precio_unitario: precio,
      subtotal: precio * cantidad
    }
    ```
  - Línea 174-188: Arma payload para POST
  - Línea 178-182: Si es nueva cotización: `origen: 'farmacia'` ⚠️ MARCA DE ORIGEN
  - Línea 193: POST a `api_cotizaciones.php` con JSON payload

**EDITAR EXISTENTE:**
- **353-360**: Detecta modo edición con URL params
  - `const isCotizacionEditMode = Boolean(...get('cotizacion_id'))`
- **455-500**: Carga detalles de cotización existente
  - URL: `api_cotizaciones.php?cotizacion_id={id}`
  - Filtra solo ítems de farmacia (línea 469)
- **200-224**: Actualiza cotización con `accion: 'editar'`

**Backend para CREAR:**
- `api_cotizaciones.php:1869-1950` → `registrar_cotizacion()`
  - Línea 1900: Inserta en tabla `cotizaciones`
  - Línea 1915: Llama a `insertar_detalles_cotizacion()` con `detalles`
  - Línea 1924-1930: Descuenta stock: `descontar_stock_farmacia_desde_detalles()`
  - Línea 1966: Registra evento

**Backend para DESCUENTO DE STOCK:**
- `api_cotizaciones.php:903-1000` → `descontar_stock_farmacia_desde_detalles()`
  - Línea 920: Filtra detalles con `servicio_tipo === 'farmacia'`
  - Línea 945: Valida si es "(caja)" en descripción
  - Línea 950-960: UPDATE medicamentos: `stock = stock - cantidad`
  - Línea 965-980: Registra en `movimientos_medicamento` con:
    - `tipo_movimiento = 'reserva_caja' | 'reserva_unidad'`
    - `tag: '[RESERVA_STOCK_COTIZACION cotizacion_id=...]'`

### PUNTO 3: Gestión de Medicamentos (Inventario)

**Ubicación**: `/medicamentos` → `MedicamentosList.jsx`

**Líneas clave**:
- **1-100**: Imports y configuración
- **200+**: Tabla de medicamentos con:
  - Nombre
  - Precio
  - Stock (con colores: rojo <5, naranja <15, verde >15)
  - Vencimiento (con colores: rojo <30 días, naranja <90 días)
  - Botones: Editar, Historial movimientos

**Historial de Movimientos:**
- Abre modal `MovimientosModal` que muestra:
  - Tipo: `reserva_unidad`, `reserva_caja`, `entrada`, `salida`, etc.
  - Cantidad
  - Observaciones (incluye `[RESERVA_STOCK_COTIZACION cotizacion_id=...]`)
  - Usuario y fecha

---

## FLUJO ACTUAL DE REGISTRO

### SECUENCIA COMPLETA: Desde Cotizador hasta Stock

```
1. QUÍMICO ABRE COTIZADOR
   URL: /farmacia/cotizador
   ↓
2. BUSCA PACIENTE
   Component: PacienteListSearch (línea 1115)
   API: Autocomplete de pacientes
   Resultado: obtiene paciente_id
   ↓
3. DETECTA COTIZACIÓN PENDIENTE
   API: api_cotizaciones.php?accion=buscar_pendiente_farmacia&paciente_id=10
   Backend: buscar_cotizacion_pendiente_farmacia() [línea 3203]
   - Busca cotización del MISMO DÍA (usa CONVERT_TZ para Lima UTC-5)
   - Con estado='pendiente'
   - Que tenga items de farmacia (WHERE servicio_tipo='farmacia')
   Resultado: cotizacion_id=1 (si existe) o null (crear nueva)
   ↓
4A. SI EXISTE COTIZACIÓN PENDIENTE
   FarmaciaCotizadorPage precarga (línea 1152-1180):
   - Carga detalles de cotización existente
   - Filtra solo farmacia items (línea 1155)
   - Entra en MODO EDICIÓN
   - URL params: ?cotizacion_id=1
   ↓
4B. SI NO EXISTE
   Prepara para CREAR NUEVA COTIZACIÓN
   ↓
5. QUÍMICA SELECCIONA MEDICAMENTOS
   UI: Checkboxes + cantidad (unidades/cajas)
   Estado: seleccionados[], cantidades{}
   ↓
6. VALIDA STOCK
   Por cada medicamento:
   - Obtiene unidades_por_caja desde medicamentos TABLE
   - Calcula unidades totales = cantidad * unidades_por_caja (si es caja)
   - Valida stock >= unidades requeridas (línea 1357)
   - Si stock insuficiente: deshabilita botón "Agregar"
   ↓
7. REGISTRA COTIZACIÓN
   POST a api_cotizaciones.php
   Payload (línea 174-188):
   {
     paciente_id: 10,
     paciente_nombre: "Juan López",
     paciente_dni: "12345678",
     total: 150,
     detalles: [
       {
         servicio_tipo: 'farmacia',
         servicio_id: 12,
         descripcion: 'Aspirin 100mg (Caja)',
         cantidad: 2,
         precio_unitario: 50,
         subtotal: 100
       },
       ...
     ],
     observaciones: 'Cotización registrada desde cotizador de Farmacia',
     vencimiento_horas: 24,
     origen: 'farmacia'   // IMPORTANTE: marca origen
   }
   ↓
8. BACKEND PROCESA: registrar_cotizacion() [línea 1869]
   a) Crea registro en tabla cotizaciones:
      INSERT INTO cotizaciones (
        paciente_id=10,
        usuario_id=5,
        total=150,
        estado='pendiente',
        origen='farmacia',
        observaciones='...',
        fecha_vencimiento=DATE_ADD(NOW(), INTERVAL 24 HOUR)
      )
      cotizacion_id = 1 (insert_id)
      
   b) Genera numero_comprobante:
      UPDATE cotizaciones SET numero_comprobante='Q000001' WHERE id=1
      
   c) Inserta detalles: insertar_detalles_cotizacion() [línea 861]
      INSERT INTO cotizaciones_detalle (
        cotizacion_id=1,
        servicio_tipo='farmacia',
        servicio_id=12,
        descripcion='Aspirin 100mg (Caja)',
        cantidad=2,
        precio_unitario=50,
        subtotal=100,
        estado_item='activo',
        version_item=1,
        editado_por=5,
        editado_en=NOW(),
        motivo_edicion=null
      )
      
   d) DESCUENTA STOCK: descontar_stock_farmacia_desde_detalles() [línea 903]
      - Filtra detalles con servicio_tipo='farmacia' (línea 920)
      - Para cada detalle:
        - Detecta si es "(caja)" en descripcion (línea 945)
        - esCaja=true → unidades_descontar = cantidad * unidades_por_caja
        - esCaja=false → unidades_descontar = cantidad
        - Valida stock >= unidades_descontar
        - UPDATE medicamentos SET stock = stock - 30 WHERE id=12
        - INSERT INTO movimientos_medicamento (
            medicamento_id=12,
            tipo_movimiento='reserva_caja',
            cantidad=30,
            observaciones='[RESERVA_STOCK_COTIZACION cotizacion_id=1 medicamento_id=12]',
            usuario_id=5,
            fecha_hora=NOW()
          )
   
   e) Registra evento: insertar_evento_cotizacion() [línea 1966]
      INSERT INTO cotizacion_eventos (
        cotizacion_id=1,
        evento_tipo='creada',
        usuario_id=5,
        motivo='Creación de cotización',
        payload_json='{"total":150,"items":1}'
      )
   
   f) Retorna JSON success:
      {
        success: true,
        cotizacion_id: 1,
        numero_comprobante: 'Q000001',
        fecha_vencimiento: '2026-05-03 10:30:00',
        total: 150,
        message: 'Cotización registrada exitosamente'
      }
   ↓
9. FRONTEND RECIBE RESPUESTA
   FarmaciaCotizadorPage.jsx línea 206-224:
   - Muestra modal de éxito con código QR/código
   - Imprime ticket de recepción (función imprimirTicketRecepcion)
   - Limpia UI: setSeleccionados([]), setCantidades({})
   - Recarga medicamentos (recargarMedicamentos)
   ↓
10. COTIZACIÓN DISPONIBLE EN PANEL DE VENTAS
    API: api_cotizaciones_farmacia.php
    Query: SELECT FROM cotizaciones c
           WHERE EXISTS (
             SELECT 1 FROM cotizaciones_detalle cd
             WHERE cd.cotizacion_id = c.id
               AND LOWER(TRIM(cd.servicio_tipo)) = 'farmacia'
           )
    FarmaciaVentasPage.jsx muestra:
    - Referencia: Q000001
    - Paciente: Juan López
    - DNI: 12345678
    - Vendido por: [Químico que cotizó]
    - Total: S/ 150.00
    - Estado: pendiente
```

---

## IMPACTOS DE CAMBIO A COTIZACIONES MIXTAS

### ESCENARIO ACTUAL vs PROPUESTO

#### Actual (Separado - HOY)
```
Paciente: Juan López

SeleccionarServicioPage
├─ Click "Laboratorio" → CotizarLaboratorioPage
│  └─ POST api_cotizaciones.php
│     └─ Cotización #1 (servicio_tipo=laboratorio)
│
├─ Click "Farmacia" → FarmaciaCotizadorPage
│  └─ POST api_cotizaciones.php
│     └─ Cotización #2 (servicio_tipo=farmacia)
│
└─ Click "Rayos X" → CotizarRayosXPage
   └─ POST api_cotizaciones.php
      └─ Cotización #3 (servicio_tipo=rayosx)

Resultado: 3 cotizaciones separadas en tabla cotizaciones
```

#### Propuesto (Mixto - CON CAMBIOS)
```
Paciente: Juan López

SeleccionarServicioPage
├─ Click "Laboratorio" → CotizarLaboratorioPage
│  └─ POST api_cotizaciones.php (registrar)
│     └─ Cotización #1 con detalles_lab
│
├─ Click "Farmacia" → FarmaciaCotizadorPage
│  └─ DETECTA cotizacion_id=1 existente
│  └─ POST api_cotizaciones.php (editar, ?cotizacion_id=1)
│     └─ ACTUALIZA Cotización #1
│     └─ Agrega detalles_farm
│
└─ Click "Rayos X" → CotizarRayosXPage
   └─ DETECTA cotizacion_id=1 existente
   └─ POST api_cotizaciones.php (editar, ?cotizacion_id=1)
      └─ ACTUALIZA Cotización #1
      └─ Agrega detalles_rayos

Resultado: 1 cotización MIXTA en tabla cotizaciones
```

### IMPACTO 1: FILTRADO DE FARMACIA EN PANEL

**Pregunta**: ¿El químico podría filtrar solo farmacia de una cotización mixta?

**Respuesta**: **SÍ, PERO CON CAMBIOS**

**Código Actual** (FarmaciaVentasPage línea 80-120):
```javascript
// Query a api_cotizaciones_farmacia.php obtiene cotizaciones CON farmacia
const res = await authFetch(
  `api_cotizaciones_farmacia.php?page=${pagina}&limit=${tamanoPagina}...`
);
// api_cotizaciones_farmacia.php:172 filtra:
// WHERE EXISTS (SELECT 1 FROM cobros_detalle cd
//   WHERE cd.servicio_tipo = 'farmacia')

// Frontend MUESTRA toda la cotización (Lab + Farm + Rayos)
{ventas.map(v => (
  <tr>
    <td>{v.fecha}</td>
    <td>{v.referencia}</td>
    <td>{v.paciente_nombre}</td>
    {/* ... todos los datos ... */}
  </tr>
))}
```

**Problema**: Si cotización #1 = Lab + Farm + Rayos, se muestra TODA

**Soluciones**:

**Opción A (RECOMENDADA): Filtrar en UI**
```javascript
// FarmaciaVentasPage.jsx línea ~110-130
const verDetalle = async (venta) => {
  const res = await authFetch(
    `api_cotizaciones_farmacia.php?cotizacion_id=${venta.id}`
  );
  const data = await res.json();
  
  // NUEVO: Filtrar solo farmacia
  const detallesFarmacia = data.cotizacion?.detalles.filter(d =>
    d.servicio_tipo.toLowerCase() === 'farmacia'
  ) || [];
  
  setDetalles(detallesFarmacia);  // Muestra solo farmacia
};
```
**Costo**: 2-3 horas

**Opción B: Filtrar en API**
```php
// api_cotizaciones_farmacia.php línea ~172
// Crear parámetro: ?filtro_servicio=farmacia

WHERE EXISTS (
  SELECT 1 FROM cotizaciones_detalle cd
  WHERE cd.cotizacion_id = c.id
    AND LOWER(TRIM(cd.servicio_tipo)) = 
        COALESCE(?, 'farmacia')  // Si es null, filtra solo farmacia
)
```
**Costo**: 4-5 horas

---

### IMPACTO 2: PERDIDA DE TRAZABILIDAD

**Pregunta**: ¿Se perdería trazabilidad de "cuál farmacia fue para cuál paciente"?

**Respuesta**: **NO HAY RIESGO, PERO SÍ SE PIERDE "QUIÉN PREPARÓ"**

**Problema Actual - DETALLE DE RESPONSABILIDAD**:

En tabla `cotizacion_movimientos` (api_cotizaciones.php:3290-3310):
```sql
CREATE TABLE cotizacion_movimientos (
  id INT PRIMARY KEY,
  cotizacion_id INT,
  cobro_id INT,
  tipo_movimiento ENUM('abono','devolucion'),
  monto DECIMAL,
  saldo_anterior DECIMAL,
  saldo_nuevo DECIMAL,
  descripcion VARCHAR(255),
  usuario_id INT,  -- ¿Pero quién PREPARÓ farmacia?
  created_at TIMESTAMP
);
```

**Ejemplo de Pérdida**:
```
Movimiento: Abono de S/ 225 para cotización #1
usuario_id = 5 (Cobrador)
┌─ ¿Quién preparó farmacia?
│  ├─ ¿Químico Juan? (usuario_id=3)
│  ├─ ¿Químico María? (usuario_id=7)
│  └─ NO SE SABE
└─ En cotización separada se sabía porque era Cotización #2 creada por user_id=3
```

**Ubicaciones donde se pierde info**:

1. **FarmaciaCotizadorPage.jsx línea 200-220**: Registra cotización sin marcar "quién"
   ```javascript
   const res = await authFetch("api_cotizaciones.php", {
     method: 'POST',
     body: JSON.stringify(payload)
     // NO INCLUYE: quien_preparo_farmacia
   });
   ```

2. **api_cotizaciones.php línea 1869-1950**: `registrar_cotizacion()` NO registra responsable
   ```php
   $usuarioId = get_user_id_from_session();
   // Guarda en cotizaciones.usuario_id
   // PERO en edicion de cotización mixta (editar_cotizacion línea 2000+):
   // - No hay campo "responsable_farmacia"
   // - No hay tabla de auditoría separada por servicio
   ```

**Solución - CREAR TABLA DE RESPONSABLES**:

```sql
CREATE TABLE cotizacion_detalle_responsables (
  id INT PRIMARY KEY AUTO_INCREMENT,
  cotizacion_id INT,
  cotizacion_detalle_id INT,
  servicio_tipo VARCHAR(50),  -- 'farmacia', 'laboratorio', etc.
  usuario_responsable_id INT,  -- Quién preparó
  fecha_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  observaciones TEXT,
  FOREIGN KEY (cotizacion_id) REFERENCES cotizaciones(id),
  FOREIGN KEY (cotizacion_detalle_id) REFERENCES cotizaciones_detalle(id),
  FOREIGN KEY (usuario_responsable_id) REFERENCES usuarios(id),
  UNIQUE KEY (cotizacion_detalle_id)
);
```

**Cambios Requeridos**:

1. **FarmaciaCotizadorPage.jsx línea 174-188**: Incluir responsable
   ```javascript
   const payload = {
     // ... otros campos ...
     usuario_id: sessionStorage.usuario_id,  // ✓ Ya lo tiene
     // NUEVO:
     responsable_farmacia_id: sessionStorage.usuario_id
   };
   ```

2. **api_cotizaciones.php línea 1869-1950**: Registrar responsable
   ```php
   function registrar_cotizacion($conn, $data) {
     // ...
     $responsableFarmaciaId = isset($data['responsable_farmacia_id'])
       ? (int)$data['responsable_farmacia_id']
       : get_user_id_from_session();
     
     // ... crear cotización ...
     
     // Registrar responsables por detalle
     foreach ($detalles as $det) {
       if (strtolower($det['servicio_tipo']) === 'farmacia') {
         $stmt = $conn->prepare(
           "INSERT INTO cotizacion_detalle_responsables
            (cotizacion_id, cotizacion_detalle_id, servicio_tipo, usuario_responsable_id)
            VALUES (?, ?, 'farmacia', ?)"
         );
         $stmt->bind_param("iii", $cotizacionId, $detalleId, $responsableFarmaciaId);
         $stmt->execute();
       }
     }
   }
   ```

3. **FarmaciaVentasPage.jsx línea 150-200**: Mostrar responsable
   ```javascript
   const verDetalle = async (venta) => {
     // ... obtener detalles ...
     
     // NUEVO: Obtener responsables
     const responsables = await authFetch(
       `api_cotizaciones.php?cotizacion_id=${venta.id}&responsables=1`
     );
     
     // Mostrar en modal:
     // Preparado por: Juan Martínez (Químico)
     // Fecha: 2026-05-02 10:30
   };
   ```

**Costo**: 8-10 horas (incluye migraciones DB)

---

### IMPACTO 3: COBRO PARCIAL POR SERVICIO

**Pregunta**: ¿Se afectaría el cobro si el químico cobra por separado?

**Respuesta**: **SÍ, AFECTARÍA SIGNIFICATIVAMENTE**

**Escenario Problema**:

```
Cotización #1 (MIXTA): Total S/ 225
├─ Lab (Hemograma): S/ 100
├─ Farmacia (Aspirin): S/ 50
└─ Rayos X (Radiografía): S/ 75

Químico quiere:
- Cobrar SOLO Farmacia (S/ 50) AHORA
- Dejar Lab + Rayos pendiente (S/ 175)

¿CÓMO SE REGISTRA EN COBRO?
```

**Código Actual** (CobrarCotizacionPage.jsx):
```javascript
// Línea ~1-200: Carga detalles de cotización
const detalles = cotizacion.detalles;  // Lab + Farm + Rayos
const total = detalles.reduce((acc, d) => acc + d.subtotal, 0);  // S/ 225

// Línea ~400-500: Registra cobro
const pagoPayload = {
  cotizacion_id: 1,
  monto: 225,  // COBRO TODO de una vez
  detalles_cobro: detalles  // Lab + Farm + Rayos
};
```

**Problema**:
- NO PERMITE seleccionar ítems individuales
- Cobro es de todo-o-nada
- Si solo quiere cobrar Farmacia (S/ 50), debe registrar cobro incompleto manual

**Solución - PERMITIR COBRO PARCIAL POR ITEM**:

**Paso 1**: Modificar UI de CobrarCotizacionPage (línea 400-500)

```javascript
// CobrarCotizacionPage.jsx
const [itemsSeleccionados, setItemsSeleccionados] = useState(
  detalles.reduce((acc, d) => ({ ...acc, [d.id]: true }), {})
  // Inicialmente todos seleccionados
);

const totalCobro = detalles
  .filter(d => itemsSeleccionados[d.id])
  .reduce((acc, d) => acc + d.subtotal, 0);

return (
  <div>
    {detalles.map(detalle => (
      <label key={detalle.id}>
        <input
          type="checkbox"
          checked={itemsSeleccionados[detalle.id]}
          onChange={(e) => setItemsSeleccionados({
            ...itemsSeleccionados,
            [detalle.id]: e.target.checked
          })}
        />
        {detalle.descripcion} (S/ {detalle.subtotal})
        {detalle.servicio_tipo === 'farmacia' && <span>🧪</span>}
      </label>
    ))}
    <h3>Total a cobrar: S/ {totalCobro.toFixed(2)}</h3>
    <button onClick={() => registrarCobro(itemsSeleccionados)}>
      Cobrar solo seleccionados
    </button>
  </div>
);
```

**Costo**: 5-6 horas (UI + lógica)

**Paso 2**: Backend - Actualizar `registrar_abono_cotizacion()` (api_cotizaciones.php línea 3490-3620)

```php
function registrar_abono_cotizacion($conn, $data) {
  // ... código existente ...
  
  // NUEVO: Aceptar array de detalle_ids
  $detallesSeleccionados = isset($data['detalle_ids'])
    ? (array)$data['detalle_ids']
    : [];  // Si es null, aplica a toda cotización
  
  // Calcular monto solo de items seleccionados
  if (!empty($detallesSeleccionados)) {
    $placeholders = implode(',', array_fill(0, count($detallesSeleccionados), '?'));
    $stmt = $conn->prepare(
      "SELECT COALESCE(SUM(subtotal), 0) as subtotal_seleccionado
       FROM cotizaciones_detalle
       WHERE cotizacion_id = ? AND id IN ($placeholders)"
    );
    // ... bind params ...
    // $montoAplicado = min($monto, $subtotalSeleccionado)
  }
  
  // Registrar en cotizacion_movimientos con:
  INSERT INTO cotizacion_movimientos (
    cotizacion_id, cobro_id, tipo_movimiento, monto, 
    servicios_cobrados, saldo_anterior, saldo_nuevo, ...
  )
  // servicios_cobrados = 'farmacia,laboratorio' (nuevo campo)
}
```

**Costo**: 8-10 horas (lógica compleja, validaciones)

---

### IMPACTO 4: TRAZABILIDAD PACIENTE-FARMACIA

**Pregunta**: ¿Se perdería trazabilidad de "cuál farmacia fue para cuál paciente"?

**Respuesta**: **NO, ESTÁ SEGURA PORQUE**:

1. Cada `cotizacion` tiene `paciente_id` ÚNICO
2. Todos los `cotizaciones_detalle` heredan ese `paciente_id` implícitamente
3. No hay riesgo de mezcla entre pacientes

**Validación en código**:

```php
// api_cotizaciones.php línea 861 (insertar_detalles_cotizacion)
$pacienteIdCotizacion = 0;
$stmtPac = $conn->prepare('SELECT paciente_id FROM cotizaciones WHERE id = ? LIMIT 1');
// Valida que paciente_id de cotización sea consistente
// Todos los detalles → mismo paciente
```

**Conclusión**: ✅ **CERO RIESGO DE MEZCLA DE PACIENTES**

---

## CAMBIOS REQUERIDOS (ROADMAP)

### FASE 1: Filtrado Visual (BAJO ESFUERZO - 2-3 horas)

**Objetivo**: Mostrar solo ítems de farmacia en panel de ventas

**Archivos**:
- `FarmaciaVentasPage.jsx` línea 110-150
- Agregar filtro `WHERE servicio_type='farmacia'` en detalles

**Cambios**:
```javascript
// Línea ~115
const farmaciaItems = detalles.filter(d =>
  d.servicio_tipo?.toLowerCase() === 'farmacia'
);
setDetalles(farmaciaItems);  // Mostrar solo farmacia
```

### FASE 2: Trazabilidad de Responsables (MEDIO ESFUERZO - 8-10 horas)

**Objetivo**: Registrar quién preparó farmacia en cotización mixta

**Archivos**:
- `FarmaciaCotizadorPage.jsx` línea 174-188
- `api_cotizaciones.php` línea 1869-1950
- `FarmaciaVentasPage.jsx` línea 150-200
- Script SQL para crear tabla `cotizacion_detalle_responsables`

**Cambios**:
```javascript
// FarmaciaCotizadorPage
payload.responsable_farmacia_id = sessionStorage.usuario_id;

// Mostrar en panel:
// "Preparado por: Juan (Químico) el 2026-05-02 10:30"
```

### FASE 3: Cobro Parcial por Servicio (ESFUERZO ALTO - 12-15 horas)

**Objetivo**: Permitir cobrar solo farmacia de cotización mixta

**Archivos**:
- `CobrarCotizacionPage.jsx` línea 400-600
- `api_cotizaciones.php` línea 3490-3620 (`registrar_abono_cotizacion`)
- Agregar campo `servicios_cobrados` en tabla `cotizacion_movimientos`

**Cambios**:
```javascript
// CobrarCotizacionPage
// Agregar checkboxes por item
// Permitir seleccionar solo ítems de farmacia
// Calcular total parcial

// API
// Aceptar array de detalle_ids
// Registrar qué servicios se cobraron
```

### FASE 4: Testing + Ajustes (3-5 días)

**Escenarios**:
1. Crear cotización mixta (Lab → Farm → Rayos)
2. Editar cotización mixta (agregar más items)
3. Cobrar solo farmacia
4. Verific stock descuento correcto
5. Validar reportes de ventas farmacia
6. Comprobar responsables registrados

---

## RESUMEN EJECUTIVO

| Aspecto | Impacto | Severidad | Esfuerzo | Solución |
|---------|---------|-----------|----------|----------|
| **Filtrado de Farmacia** | Químico ve cotización completa | MEDIO | 2-3 h | Agregar filter en UI/API |
| **Responsabilidad (quién preparó)** | Se pierde "Químico X preparó farmacia" | ALTO | 8-10 h | Tabla `cotizacion_detalle_responsables` |
| **Cobro Parcial** | No se puede cobrar solo farmacia | ALTO | 12-15 h | Checkboxes + lógica en backend |
| **Mezcla de Pacientes** | NO hay riesgo | NINGUNO | - | Validación ya existe ✓ |
| **Stock de Medicamentos** | Se descuenta correctamente | BAJO | - | Ya funciona con `servicio_type='farmacia'` ✓ |

---

## RECOMENDACIÓN FINAL

✅ **SÍ ES VIABLE** migrar a cotizaciones mixtas

**Ruta Recomendada**:
1. **FASE 1 + 2 PRIMERO** (~10-13 horas de desarrollo)
   - Implementar filtrado visual y trazabilidad
   - Testing básico
   - Desplegar a producción
   
2. **FASE 3 DESPUÉS** si hay feedback positivo (~12-15 horas)
   - Cobro parcial es más complejo, requiere validación adicional
   - Puede esperar a que químicos se adapten a flujo mixto

3. **Timeline Estimado**: 4-5 semanas con testing completo

**Riesgos**:
- Pérdida temporal de trazabilidad (se resuelve con FASE 2)
- Confusión operativa en cobros (se resuelve con FASE 3)
- Impacto visual importante en UI

---

**Documento generado**: 2 de mayo 2026  
**Próxima revisión**: Después de FASE 1 implementation
