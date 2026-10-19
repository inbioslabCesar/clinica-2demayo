# Rentabilidad de la clínica, Caja General y política de anulaciones

Fecha: 2026-10-13
Estado: fases 1 y 2 implementadas (commits `2ee7ef1` y `1149743`). Fases 3 a 6 documentadas para implementar más adelante.
Nota: nada de lo descrito en las fases 3 a 6 está aplicado en código ni en BD.

## 1. Qué ya existe (fases 1 y 2)

Vista solo lectura para el administrador en `/admin/rentabilidad`.

| Pieza | Archivo |
|---|---|
| Endpoint (GET, solo `administrador`) | [api_rentabilidad_clinica.php](../api_rentabilidad_clinica.php) |
| Página | [RentabilidadClinicaPage.jsx](../src/pages/RentabilidadClinicaPage.jsx) |
| Ruta | [App.jsx](../src/App.jsx) (`/admin/rentabilidad`) |
| Accesos | Menú Finanzas en [SidebarAdmin.jsx](../src/components/sidebar/SidebarAdmin.jsx) y botón en [CajaActionButtons.jsx](../src/components/caja/CajaActionButtons.jsx) |

Qué muestra: ingresos cobrados, honorarios, gastos registrados, margen de contribución, comparación con el período anterior, ingreso por servicio, aporte por médico (incluye médicos sin actividad), evolución de 12 meses, proyecciones por escenarios y alertas de calidad de datos.

### Reglas de cálculo vigentes
- **Ingresos:** `cobros` con `estado = 'pagado'` por `fecha_cobro`, más abonos de contratos (`ingresos_diarios`). Es la misma base que usa el dashboard estadístico.
- **Desglose por servicio:** se prefiere `produccion_medica_detalle` (un registro por ítem), repartido en proporción a lo realmente cobrado. `cobros_detalle` guarda una sola fila por cobro y los cobros con varios servicios caen en "mixto". Si el detalle cubre menos del 80% de lo cobrado, se usa `cobros_detalle` y la pantalla avisa que es aproximado.
- **Honorarios:** `monto_medico` de `honorarios_medicos_movimientos`, sin `cancelado`.
- **Gastos:** `egresos` excluyendo `tipo_egreso = 'honorario_medico'` (ya contado aparte).
- **Aporte por médico:** ingreso atribuido − honorario. Si la cobertura de producción médica es menor a 80%, usa la tarifa de honorarios como estimación y lo indica.
- **Margen de contribución** = ingresos − honorarios − gastos registrados. No es utilidad neta.
- **Proyección:** ritmo por día activo (mes en curso y promedio de los últimos 3 meses cerrados) por días hábiles (sin domingos). Escenarios conservador, base y optimista. Confianza: baja con menos de 3 meses de historia, media de 3 a 5, alta con 6 o más.

### Hallazgos de datos (producción, 2026-10-13)
- Solo existen los estados `pagado` y `cancelado` en honorarios. Hay 84 cancelados (S/ 7,298.33 de tarifa) que no deben contarse.
- En 7 honorarios pagados, `clínica + médico` no suma la tarifa (S/ 630.00 en total). En 4 de ellos el cobro coincide con la tarifa, por lo que la diferencia es ingreso real de la clínica no registrado.
- Hay 17 honorarios `pagado` cuyo cobro está anulado (S/ 1,510.00). Incluye las filas #444 y #445 del cobro 592 (S/ 850).
- Atenciones con `monto_clinica = 0`: rayos X (103), consultas (23), procedimientos (2) y ecografía (1). Revisar si el reparto 100% médico es intencional (por ejemplo Llicely Becerril).
- La fila #124 (sutura) tiene tarifa S/ 150 pero el cobro 168 fue de S/ 50.
- `honorarios_recuperos` fue vaciada manualmente por administración (el texto "el médico debe devolver" resultaba confuso).
- Pendiente de verificar: por qué el Dr. Tecco (`medico_id = 1`) no tiene movimientos en octubre. Usar la fila "Sin médico → ver detalle" y las consultas SQL de la sección 8.

## 2. Decisiones de negocio ya tomadas

| Tema | Decisión |
|---|---|
| Qué guarda la Caja General | Solo el ingreso neto de la clínica reservado como ahorro. Es un fondo contable, no una caja física. |
| Origen del aporte | Cualquier medio (efectivo, Yape, tarjeta, transferencia). Se anota de qué medio sale para el arqueo. |
| Quién propone el traspaso | El cajero, al cerrar su caja. |
| Quién confirma, envía y saca | Solo el administrador. |
| Tope del aporte | La ganancia neta del día de esa caja (ingresos − honorarios − gastos). |
| Gasto extraordinario | Se paga desde la Caja General y no toca la caja diaria. |
| Anulaciones | Se probará primero en desarrollo. Política por defecto sugerida: "absorber" (ver fase 4). |

## 3. Fase 3: Caja General (requiere BD)

### 3.1 Objetivo
Que gastos grandes o no recurrentes (pozo a tierra, construcción) no dejen negativa la caja del día, y que el sistema registre un ahorro acumulado con trazabilidad.

### 3.2 Reglas
1. Todo el ingreso entra a la caja diaria como hoy.
2. Al cerrar, el cajero puede **proponer** un aporte a la Caja General, con tope en la ganancia neta del día de esa caja.
3. El aporte queda `pendiente` hasta que el administrador lo **confirma**.
4. El aporte **no es un gasto**: no cambia `ganancia_dia` ni el margen operativo.
5. El aporte **sí reduce el cuadre de la caja diaria**: baja el efectivo esperado por la parte en efectivo y el saldo virtual esperado por la parte virtual.
6. Solo el administrador registra gastos extraordinarios desde la Caja General, con categoría, motivo y comprobante.
7. El saldo no puede quedar negativo (validar dentro de una transacción con bloqueo).
8. Nada se borra: las anulaciones llevan usuario, fecha y motivo.
9. Arqueo periódico: el administrador compara el saldo del sistema con el conteo físico y digital.

### 3.3 Esquema propuesto (no aplicado)
Tabla única como fuente de verdad. No duplicar el gasto extraordinario en `egresos`, para evitar contarlo dos veces.

```sql
CREATE TABLE IF NOT EXISTS caja_general_movimientos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tipo ENUM('aporte','egreso','ajuste') NOT NULL,
    estado ENUM('pendiente','confirmado','rechazado','anulado') NOT NULL DEFAULT 'pendiente',
    fecha DATE NOT NULL,
    monto DECIMAL(12,2) NOT NULL,
    monto_efectivo DECIMAL(12,2) NOT NULL DEFAULT 0,
    monto_virtual DECIMAL(12,2) NOT NULL DEFAULT 0,
    caja_origen_id INT NULL,
    categoria VARCHAR(60) NULL,
    descripcion VARCHAR(255) NULL,
    comprobante_ref VARCHAR(80) NULL,
    solicitado_por INT NULL,
    confirmado_por INT NULL,
    confirmado_en DATETIME NULL,
    anulado_por INT NULL,
    anulado_en DATETIME NULL,
    motivo_anulacion VARCHAR(255) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_cgm_estado_fecha (estado, fecha),
    KEY idx_cgm_caja (caja_origen_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

Saldo = aportes confirmados − egresos confirmados ± ajustes confirmados.

Entrega de BD (regla del repositorio): carpeta `sql/YYYY-MM-DD/` con `001_schema.sql` (tabla, idempotente), `003_verify.sql` y notas de rollback. Si se agrega una bandera de habilitación en configuración, recordar que **no viaja en el build** y hay que ejecutarla en cada instancia productiva con su SELECT de verificación.

### 3.4 Cambios de código necesarios
1. **[api_cerrar_caja.php](../api_cerrar_caja.php):**
   - `egreso_operativo` suma todos los egresos de la caja sin mirar `fuente_fondos`. Debe excluir lo que no sea `clinica`.
   - Restar del efectivo esperado y del virtual esperado el aporte propuesto o confirmado de esa caja.
   - `ganancia_dia` no debe incluir aportes ni extraordinarios.
   - Ofrecer el campo "Reservar para Caja General" con tope en la ganancia neta.
2. **[api_resumen_diario.php](../api_resumen_diario.php):** mismo ajuste de fuente de fondos y de aportes.
3. **[api_egresos.php](../api_egresos.php):** el POST asigna siempre la caja abierta del usuario a los egresos operativos. Un gasto de Caja General no debe quedar asociado a ninguna caja diaria.
4. **Nuevo `api_caja_general.php`:**
   - GET: saldo y movimientos.
   - POST: proponer aporte, confirmar o rechazar aporte, registrar egreso extraordinario, ajuste y anulación.
   - Solo `administrador`, salvo "proponer aporte" para el cajero con su caja abierta.
5. **Nueva página `/contabilidad/caja-general`** (solo administrador): saldo, aportes pendientes de confirmar, alta de gastos extraordinarios, historial y arqueo.
6. **[CerrarCajaView.jsx](../src/components/caja/CerrarCajaView.jsx):** campo de aporte. Hoy esa vista ya crea traspasos entre cajeros, como referencia del patrón pendiente y recibido ([api_caja_traspasos.php](../api_caja_traspasos.php) y [CajaAdminDashboard.jsx](../src/components/caja/CajaAdminDashboard.jsx)).
7. **Rentabilidad:** tarjetas de ahorro acumulado, aportes del mes y gastos extraordinarios, y las dos líneas "margen operativo" y "resultado después de inversiones".

### 3.5 Casos de prueba
- Aporte mayor a la ganancia neta: se rechaza.
- Aporte en efectivo: baja el efectivo esperado y la diferencia de cierre sigue en 0 si el conteo coincide.
- Aporte virtual: baja el virtual esperado.
- Aporte pendiente: no suma al saldo hasta confirmarse.
- Egreso mayor al saldo: se rechaza.
- Cajero y recepción no pueden confirmar aportes ni registrar egresos.
- `ganancia_dia` no cambia con aportes ni con extraordinarios.
- Cierre de caja reabierto: los aportes se recalculan o se bloquean (definir).

## 4. Fase 4: política de anulaciones de cobros ya liquidados

### 4.1 Situación actual
En [api_cotizaciones.php](../api_cotizaciones.php) (bloques cercanos a las líneas 6670-6840 y 7912-8165), al anular una cotización:
- los honorarios `pendiente` pasan a `cancelado`;
- los ya `pagado` generan automáticamente un **recupero** (`HonorarioRecuperoModule::registrarSiLiquidado` en [HonorarioRecuperoModule.php](../modules/HonorarioRecuperoModule.php)), que la liquidación descuenta del siguiente pago al médico y muestra como "Por recuperar".

Problemas:
- El texto "el médico debe devolver" confunde cuando el error fue de la clínica.
- Solo cubre honorarios de tipo `consulta` (ramal por `cotizacion_movimientos`) y los consolidados desde `honorarios_por_cobrar`. Los procedimientos (#444 y #445) quedan sin registro.
- El código seguirá creando recuperos en cada nueva anulación, aunque la tabla se haya vaciado.

### 4.2 Opciones

| Política | Qué significa | Cuándo |
|---|---|---|
| **Absorber** (sugerida por defecto) | Costo de la clínica. Se refleja como pérdida del mes y en la alerta, sin descontar al médico. | Error de la clínica. |
| **Compensar** | Se descuenta de un pago futuro, con acuerdo del médico. | Cuando el médico acepta. |
| **Condonar** | Se perdona, con motivo registrado. | Casos puntuales. |

### 4.3 Propuesta
1. Al anular un cobro con honorarios ya pagados, mostrar una confirmación: "Este cobro tiene honorarios pagados por S/ X. ¿Cómo se trata?" con las tres opciones y un motivo obligatorio.
2. Registrar la decisión con usuario, fecha y motivo. Si se desea trazabilidad en BD, tabla `honorarios_ajustes` (tipo, monto, motivo, usuario, fecha, referencia al honorario y al cobro). Si se mantiene solo "absorber", la alerta de Rentabilidad ya detecta la exposición sin tabla nueva.
3. Cambiar los textos de la liquidación si se conserva "por recuperar" y ampliar el ramal que hoy cubre solo consultas.
4. Decidir caso por caso los 17 honorarios históricos (S/ 1,510.00).

### 4.4 Prueba obligatoria en desarrollo antes de cambiar nada
1. Cobrar una consulta y un procedimiento.
2. Liquidar el honorario al médico.
3. Anular la cotización.
4. Verificar: estado del honorario, si se crea el recupero, si aparece en la alerta de Rentabilidad y qué muestra la liquidación.

## 5. Fase 5: gastos fijos y utilidad neta

- Los gastos registrados son muy bajos (por ejemplo, un solo sueldo de S/ 780 en agosto, sin alquiler ni planilla). Hoy el reporte solo puede hablar de margen de contribución.
- Registrar costos fijos mensuales (alquiler, planilla, servicios, impuestos) con una categoría clara. Opcionalmente, plantilla de gastos recurrentes.
- Con eso el reporte puede calcular:
  - utilidad neta;
  - **punto de equilibrio** (gastos fijos ÷ margen de contribución %);
  - **meses de cobertura** del ahorro (saldo de Caja General ÷ gasto fijo mensual).

## 6. Fase 6: mejoras opcionales

- Metas por médico y por servicio con alertas de desvío.
- Aporte por hora de agenda (usando la agenda inteligente): detecta capacidad ociosa.
- Concentración (Pareto) de médicos y servicios; retención de pacientes.
- Alerta semanal cuando el margen de un médico cae 10 puntos o más.
- Exportación a Excel y PDF (existe `exportToExcel` y `exportToPDF` en `src/utils/exportTable`).
- Proyección con estacionalidad (Holt-Winters ligero) cuando haya 6 meses o más de historia.
- Verificar si farmacia y venta directa quedan completamente dentro de `cobros`; si no, sumarlas como fuente de ingreso propia.
- Atribución opcional de laboratorio e imagen al médico solicitante.

## 7. Orden sugerido y dependencias

1. Verificar en producción la atribución por médico y qué ocurre con el Dr. Tecco en octubre (sección 8).
2. Fase 5 (gastos fijos): no requiere BD y mejora la calidad del reporte.
3. Fase 4: probar en desarrollo y decidir la política.
4. Fase 3: Caja General, con scripts de BD en `sql/YYYY-MM-DD/`.
5. Fase 6 según prioridad.

## 8. SQL de verificación (solo lectura)

```sql
-- Producción por médico en un mes, incluyendo ítems sin médico
SELECT p.medico_id, m.nombre, COUNT(DISTINCT p.cobro_id) cobros, SUM(p.monto_neto_item) monto,
       GROUP_CONCAT(DISTINCT p.servicio_tipo) servicios
FROM produccion_medica_detalle p
JOIN cobros c ON c.id = p.cobro_id
LEFT JOIN medicos m ON m.id = p.medico_id
WHERE c.estado = 'pagado' AND c.fecha_cobro >= '2026-10-01'
GROUP BY p.medico_id, m.nombre;

-- Honorarios del Dr. Tecco (medico_id = 1) por estado en el mes
SELECT estado_pago_medico, COUNT(*) items, SUM(monto_medico) monto
FROM honorarios_medicos_movimientos
WHERE medico_id = 1 AND fecha >= '2026-10-01'
GROUP BY estado_pago_medico;

-- Honorarios pagados sobre cobros que no están pagados
SELECT h.id, h.fecha, h.medico_id, h.tipo_servicio, h.monto_medico, h.cobro_id, c.estado AS cobro_estado
FROM honorarios_medicos_movimientos h
JOIN cobros c ON c.id = h.cobro_id
WHERE LOWER(TRIM(h.estado_pago_medico)) = 'pagado' AND c.estado <> 'pagado'
ORDER BY h.fecha;

-- Filas donde tarifa ≠ clínica + médico
SELECT id, fecha, medico_id, tipo_servicio, tarifa_total, monto_clinica, monto_medico, estado_pago_medico
FROM honorarios_medicos_movimientos
WHERE ABS(tarifa_total - monto_clinica - monto_medico) > 0.01
ORDER BY fecha DESC;
```

## 9. Riesgos a vigilar
- Ocultar gastos: por eso el reporte debe mostrar siempre "margen operativo" y "resultado después de inversiones".
- Doble conteo del gasto extraordinario si se registra en `egresos` y en `caja_general_movimientos`.
- Cierres de caja reabiertos con aportes ya confirmados.
- Cualquier cambio en `api_cerrar_caja.php` afecta el cuadre diario: probar en desarrollo con cierres reales antes de producción.
- Instancias con esquema parcial: el código nuevo debe verificar la existencia de tablas y columnas, como hacen los endpoints actuales.
