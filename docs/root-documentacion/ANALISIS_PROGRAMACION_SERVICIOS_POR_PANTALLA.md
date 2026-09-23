# Analisis de Programacion de Servicios por Pantalla

## Objetivo
Tener una guia tecnica concreta de donde capturar la fecha/hora, que guardar en backend, que mostrar en ticket y como debe aparecer en recordatorios para cada servicio.

## Matriz Tecnica

| Pantalla | Servicio | Captura fecha/hora | Persistencia backend | Ticket | Recordatorios |
|---|---|---|---|---|---|
| SeleccionarServicioPage | Entrada comun | No | No | No | No |
| AgendarConsultaPage | Consulta | Si | consultas / historia clinica / agenda relacionada | Si | Si |
| CotizarEcografiaPage | Ecografia | Si | cotizaciones_detalle + agenda_servicios_cotizacion | Si | Si |
| CotizarLaboratorioPage | Laboratorio | A definir por item | cotizaciones_detalle + agenda_servicios_cotizacion | Si | Si |
| CotizarRayosXPage | Rayos X | A definir por item | cotizaciones_detalle + agenda_servicios_cotizacion | Si | Si |
| CotizarProcedimientosPage | Procedimientos | A definir por item | cotizaciones_detalle + agenda_servicios_cotizacion | Si | Si |
| CotizarPaquetesPerfilesPage | Paquetes/Perfiles | Si, por componente o por paquete | cotizaciones_detalle + agenda_servicios_cotizacion + snapshot por componente | Si | Si |
| CotizarOperacionPage | Operaciones/Cirugias | Si | cotizaciones_detalle + agenda_servicios_cotizacion + evento quirurgico | Si | Si |
| CobrarCotizacionPage | Cobro de cotizacion | No captura agenda, solo hereda | Lee cotizaciones_detalle + agenda_servicios_cotizacion | Si | Indirecto |
| DetalleCotizacionPage | Visualizacion/impresion | No captura agenda, solo muestra | Lee cotizaciones_detalle + agenda_servicios_cotizacion | Si | Indirecto |
| RecordatoriosCitasPage | Operacion de seguimiento | No captura agenda, solo consume | Lee consultas + agenda_servicios_cotizacion + cotizaciones | No | Si |

## Detalle Por Servicio

### Consulta
- La fecha y hora se capturan en la pantalla de agendamiento.
- La programacion debe seguir generando recordatorio de cita.
- El ticket debe mostrar fecha y hora de la consulta.

### Ecografia
- La fecha y hora se capturan por detalle del servicio.
- Cada item puede ir a agenda_servicios_cotizacion.
- El ticket debe mostrar servicio, fecha y hora.
- El recordatorio debe mostrar estado de pago y servicio.

### Laboratorio
- Puede requerir fecha/hora por examen o por orden completa.
- Si hay varios examenes, decidir si agenda por item o por grupo.
- Debe conservar el estado de pago por cotizacion.

### Rayos X
- Similar a laboratorio en estructura.
- Puede ir por estudio individual.
- Debe quedar visible en recordatorios como servicio distinto.

### Procedimientos
- Puede requerir fecha/hora por procedimiento individual.
- Si el procedimiento es agrupado, necesita estrategia de agenda por lote.

### Paquetes/Perfiles
- Necesitan definicion especial porque pueden expandirse a varios componentes.
- Cada componente podria requerir agenda propia.
- Es importante conservar snapshot de descripcion y servicio.

### Operaciones/Cirugias
- Deben manejarse como evento de mayor complejidad.
- Normalmente requieren agenda clara, no solo pago.
- El recordatorio debe ser operativo y visible por estado.

## Orden Tecnico Recomendado
1. Laboratorio
2. Rayos X
3. Procedimientos
4. Paquetes/Perfiles
5. Operaciones

## Criterios de Implementacion
- No mezclar en una sola logica todos los servicios.
- Reutilizar la agenda solo como estructura base, no como unico significado clinico.
- Mostrar siempre en la tabla operativa: servicio, estado de pago y fecha/hora.
- Mantener compatibilidad con los flujos actuales de consulta y ecografia.

## Siguiente Paso
Definir la primera fase de implementacion para Laboratorio y Rayos X, detallando:
- que campos agregar en la UI,
- como guardar agenda por detalle,
- como mostrarlo en recordatorios,
- y como imprimirlo en ticket.
