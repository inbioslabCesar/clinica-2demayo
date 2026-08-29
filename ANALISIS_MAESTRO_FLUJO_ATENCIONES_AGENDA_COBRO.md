# ANALISIS MAESTRO - FLUJO ATENCIONES / AGENDA / COBRO

Fecha: 2026-08-21
Estado: Aprobado para diseno funcional (previo a implementacion)
Alcance: Recepcion, HC medico, cotizaciones, agenda por servicio, cobro unificado, correlativo operativo.

## 1) Objetivo maestro

Unificar el flujo completo para que:

1. Se mantenga coherencia clinica (misma fecha base por bloque de atencion).
2. Se respete la realidad operativa (horarios por medico/servicio, sin sobreventa).
3. Se conserve trazabilidad financiera (uno o varios documentos cobrados en un solo acto).
4. El correlativo represente la atencion real del dia (no solo un resumen de fila).

## 2) Problema raiz consolidado

No existe una capa unica de orquestacion de "bloque clinico". Hoy el sistema resuelve por partes:

1. Solicitud medica (consulta/imagen/procedimiento) en estado pendiente.
2. Agenda por detalle y por medico.
3. Cobro consolidado en caja.
4. Correlativos operativos calculados despues.

Resultado actual:

1. Es posible que varias cotizaciones representen una sola intencion clinica.
2. La vista de Atenciones puede mostrar un solo correlativo ganador por fila y ocultar otros.
3. Forzar una sola hora exacta para todos los servicios rompe escenarios multi-medico.

## 3) Hechos observados (escenarios ya validados)

### Escenario A - Recepcion por medico/fecha

1. La agenda real es por medico y fecha.
2. Un horario puede estar libre para medico 1 y ocupado para medico 2.
3. Una regla de "misma hora exacta para todo" es inviable en multi-medico.

### Escenario B - Ir a agendar en esta hora

1. Se requiere seleccionar paciente, conservar contexto y luego agendar.
2. La hora enviada desde disponibilidad es objetivo inicial, no garantia absoluta.

### Escenario C - Paquetes/Perfiles

1. Conveniente: una fecha base unica para todos los servicios del bloque.
2. No conveniente: obligar misma hora exacta para todos.
3. Recomendado: hora base + ajuste automatico por disponibilidad real de cada medico.

### Escenario D - HC medico con multiples solicitudes (2 eco + 2 rx + 1 proc)

1. Se crean solicitudes en pendiente y luego se pagan en un solo cobro.
2. El pago total confirma viabilidad financiera de todos los documentos relacionados.
3. El correlativo operativo se habilita cuando el evento operativo entra en cuenta (confirmado/atendido o pendiente con cotizacion pagada segun regla operativa).

## 4) Modelo funcional propuesto

## 4.1 Entidad logica: Bloque de Atencion

Representa una sola intencion clinica y agrupa todos los servicios asociados.

Campos funcionales minimos:

1. bloque_id
2. paciente_id
3. consulta_origen_id (si aplica)
4. fecha_base
5. hora_objetivo
6. estado_global
7. total_global_estimado
8. total_global_pagado
9. saldo_global

No obliga una sola cotizacion fisica. Puede mapear 1..N cotizaciones.

## 4.2 Sub-bloques operativos

Dentro del bloque, cada item se proyecta en sub-bloques por:

1. medico_id
2. fecha_programada

Cada sub-bloque tiene su propio orden del dia (correlativo operativo).

## 5) Reglas maestras automatizadas

## Regla R1 - Fecha base unica

Todos los servicios de un bloque heredan la misma fecha_base por defecto.

## Regla R2 - Hora objetivo, no hora rigida

Se define una hora_objetivo inicial.

1. Si hay disponibilidad del medico, se conserva.
2. Si no hay disponibilidad, se reubica al siguiente slot valido del mismo dia.
3. Si no hay cupo el mismo dia, se marca excepcion bloqueada.

## Regla R3 - Confirmacion por pago

1. Items en pendiente pueden existir antes del cobro.
2. Pago total o parcial habilitante cambia el estado operativo a confirmado segun politica.
3. Si hay autorizacion anticipada, se permite avance con trazabilidad.

## Regla R4 - Correlativo operativo

El correlativo debe calcularse por (medico_id + fecha_programada + hora_programada + prioridad_operativa).

Nunca debe depender solo de "una fila de cotizacion".

## Regla R5 - Visualizacion en Atenciones

Cada fila debe mostrar:

1. Correlativo principal del bloque (si existe).
2. Indicador de multiplicidad: cantidad de sub-correlativos.
3. Fecha de atencion real del correlativo mostrado.

## Regla R6 - Multi-documento financiero

Un cobro puede liquidar 1..N cotizaciones del mismo bloque.

Debe conservarse:

1. relacion cobro -> movimientos por cotizacion
2. saldo por cotizacion
3. saldo global del bloque

## 6) Matriz maestra de decisiones (semaforo)

### Caso M1 - 1 medico, 1 servicio

1. Fecha unica: Verde
2. Hora unica: Verde
3. Correlativo unico visible: Verde

### Caso M2 - 1 medico, multiples servicios

1. Fecha unica: Verde
2. Hora unica exacta: Amarillo (posible secuencia mejor que simultaneo)
3. Correlativo por cada evento + resumen: Verde

### Caso M3 - multiples medicos, mismos servicios

1. Fecha unica: Verde
2. Hora unica exacta: Rojo
3. Hora objetivo + ajuste por medico: Verde

### Caso M4 - solicitudes HC pendientes y luego cobro total

1. Crear pendiente sin correlativo final: Verde
2. Confirmar operativo tras pago: Verde
3. Mostrar un solo correlativo ocultando los demas: Rojo

### Caso M5 - paquetes/perfiles multi-servicio

1. Fecha base comun: Verde
2. Hora base comun con overrides: Verde
3. Hora unica fija para todos: Rojo

## 7) Estados estandar y transiciones

Estados sugeridos por item operativo:

1. solicitado
2. pendiente_pago
3. confirmado
4. atendido
5. reprogramado
6. cancelado
7. excepcion

Transicion base:

1. solicitado -> pendiente_pago
2. pendiente_pago -> confirmado (pago o autorizacion)
3. confirmado -> atendido
4. cualquier estado -> reprogramado/cancelado (con auditoria)

## 8) Automatizaciones clave

1. Slot allocator por medico/fecha:
   toma hora_objetivo y devuelve primera hora valida.
2. Reconciliador financiero:
   al cobrar, actualiza estados por item y estado global del bloque.
3. Correlativo resolver:
   calcula y cachea correlativos por sub-bloque operativo.
4. Detector de conflicto:
   si no existe cupo mismo dia, crea excepcion con opciones guiadas.

## 9) UX operativa objetivo

### Recepcion

1. Ve bloque unico con estado global y saldo global.
2. Puede desplegar sub-items por medico y horario.
3. Recibe alertas de conflicto antes de confirmar.

### Medico (HC)

1. Solicita multiples servicios en una sola accion.
2. Ve estado de cada solicitud y su medico responsable.
3. No pierde trazabilidad al pasar por caja.

### Caja

1. Cobra uno o varios documentos del bloque.
2. Visualiza total/saldo consolidado y detalle por cotizacion.
3. Dispara sincronizacion operativa post-cobro.

## 10) KPIs de control

1. porcentaje de bloques sin conflicto de agenda
2. tiempo promedio solicitud -> cobro -> confirmacion
3. tasa de reprogramacion por falta de cupo
4. porcentaje de filas con correlativo parcial (debe tender a 0)
5. discrepancias entre agenda y correlativo mostrado

## 11) Plan de implementacion por fases

### Fase 1 - Capa de orquestacion

1. Definir contrato funcional de Bloque de Atencion.
2. Mapear cotizaciones existentes a bloque_id logico.
3. Exponer endpoint de resumen de bloque.

### Fase 2 - Motor de agenda inteligente

1. Aplicar fecha_base unica.
2. Resolver hora por medico con secuencia automatica.
3. Gestionar excepciones de cupo.

### Fase 3 - Correlativo multievento

1. Calculo por sub-bloque operativo.
2. Exponer correlativos multiples por fila/atencion.
3. Mantener correlativo principal + detalle expandible.

### Fase 4 - Cobro unificado robusto

1. Consolidacion de cobro multi-cotizacion.
2. Reconciliacion post-pago por item.
3. Auditoria de transiciones financieras y operativas.

### Fase 5 - UX final y monitoreo

1. Panel de conflictos operativos en recepcion.
2. Vista de trazabilidad completa por bloque.
3. Tablero KPI para control continuo.

## 12) Criterios de aceptacion funcional

1. Ningun escenario multi-medico fuerza hora identica no disponible.
2. Toda atencion multi-servicio conserva una fecha base comun.
3. El pago consolidado actualiza todos los items relacionados sin inconsistencia.
4. Atenciones no oculta correlativos relevantes de sub-servicios.
5. Recepcion puede resolver excepciones sin romper trazabilidad.

## 13) Decision final de diseno

Se adopta este principio rector:

1. Fecha clinica comun por bloque (obligatoria por defecto).
2. Hora operativa por servicio/medico (ajuste automatico inteligente).
3. Correlativo por evento operativo real, con resumen de bloque en UI.

Este marco cubre de forma unificada los escenarios de:

1. disponibilidad por medico
2. agendar con contexto
3. paquetes/perfiles
4. multiples solicitudes HC con cobro total consolidado
