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
- La HC lista las ordenes persistidas por `consulta_id`. Si faltan ordenes de adendas, recupera en la respuesta los procedimientos activos de detalles vinculados explicitamente a esa consulta, sin escribir nuevas ordenes.
- La recuperacion no recorre cotizaciones por parentesco: una cotizacion del mismo episodio puede contener servicios de otra consulta. Excluye cotizaciones anuladas y detalles eliminados; no duplica servicios ya presentes en una orden de la misma cotizacion.
- Para ordenes persistidas se conservan detalles antiguos sin `consulta_id`, pero no se aceptan detalles vinculados a otra consulta. La recuperacion de ordenes faltantes exige un vinculo explicito.
- El panel y la impresion validan HTTP, `success` y el arreglo `ordenes`. Un fallo se muestra como error, no como ausencia de procedimientos; el panel permite reintentar.
- Este ajuste no requiere migracion de schema ni cambios de datos/configuracion en produccion.
- Validacion del caso HC: `php scripts\verificar_ordenes_procedimientos_readonly.php --consulta=369 --procedimiento=302 --cotizacion=895`. Ejecuta las funciones de lectura en una transaccion READ ONLY, sin dispatch ni creacion automatica de tablas; compara la vista completa con `hc_fast` y verifica el servicio esperado.
- Validacion del cliente: `node --experimental-vm-modules --test scripts\test_ordenes_procedimientos_client.mjs`. Comprueba respuestas validas, errores HTTP/aplicativos, JSON invalido y fallos de red sin convertirlos en listas vacias.

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
