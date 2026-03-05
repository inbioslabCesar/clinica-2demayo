# Inventario Pro: Diseño Funcional + Técnico

Fecha: 2026-03-03  
Proyecto: clinica-2demayo

## 1) Decisiones cerradas

- Inventario general (almacén principal): Panel Admin.
- Inventario interno laboratorio: Panel Laboratorio.
- Transferencias general → interno: solo Admin/Almacén.
- Descuento de consumo interno: automático al guardar resultados.

## 2) Modelo operativo

### 2.1 Inventario general (Admin)

- Catálogo de ítems (`inventario_items`): código, categoría, presentación, factor, unidad, mínimos.
- Lotes (`inventario_lotes`): control de vencimiento y stock por lote.
- Movimientos (`inventario_movimientos`): entradas, salidas, ajustes, merma, vencido.
- Kardex exportable: histórico de movimientos.

### 2.2 Inventario interno (Laboratorio)

- Recetas por examen (`inventario_examen_recetas`): ítem + cantidad por prueba.
- Transferencias internas (`inventario_transferencias` + detalle): stock enviado a laboratorio.
- Consumos (`inventario_consumos_examen`): descuento automático por orden/examen al guardar resultados.

### 2.3 Regla de saldo interno

`saldo_interno = transferido_a_laboratorio - consumido_aplicado`

- Transferido: suma de transferencias con destino `laboratorio`.
- Consumido: suma de `inventario_consumos_examen` con estado `aplicado`.

## 3) Integración con flujo laboratorio actual

Punto de anclaje principal: `api_resultados_laboratorio.php` (POST).

Secuencia:
1. Guardar/actualizar resultados.
2. Marcar orden como `completado`.
3. Si hay datos reales de resultado, intentar consumo automático:
   - Buscar recetas activas por examen.
   - Calcular factor por cantidad (desde detalle de cobro de laboratorio).
   - Validar saldo interno por ítem.
   - Insertar consumo `origen_evento='resultado'`.
4. Responder API con resumen de consumos aplicados/pendientes.

## 4) Permisos sugeridos

- Admin/Almacén:
  - CRUD de inventario general.
  - Entradas/salidas/ajustes.
  - Transferencias a laboratorio.
- Laboratorio:
  - CRUD recetas por examen.
  - Ver stock interno/saldos/consumos.
  - No modifica inventario general.

## 5) Estados y auditoría

- `inventario_consumos_examen.estado`: `aplicado` / `revertido`.
- Reversión recomendada al anular cobro/cotización ligada: cambiar a `revertido` (no borrar).
- Observación debe registrar orden, examen y usuario para trazabilidad.

## 6) Fases de implementación

### Fase 1 (hecha)
- Script SQL base en `sql/2026-03-03_inventario_laboratorio_fase1.sql`.

### Fase 2 (en progreso)
- Módulo backend de consumo automático al guardar resultados.
- Resumen de consumo en respuesta API.

### Fase 3
- APIs CRUD inventario general (items/lotes/movimientos).
- APIs inventario interno (recetas/transferencias/stock interno).

### Fase 4
- UI Admin: Inventario general + kardex.
- UI Laboratorio: recetas + stock interno + consumos.

### Fase 5
- Reversión automática en anulaciones y repetición de prueba.
- Alertas de stock crítico y por vencer.

## 7) Riesgos y mitigación

- Doble consumo por re-guardado de resultados:
  - Mitigar con validación previa por `orden_id + id_examen + item_id + origen_evento`.
- Diferencias entre estructura de cobro y orden:
  - Mitigar con factor por examen y fallback a 1.
- Faltante de stock interno:
  - No bloquear guardado de resultados; registrar pendiente y avisar.
