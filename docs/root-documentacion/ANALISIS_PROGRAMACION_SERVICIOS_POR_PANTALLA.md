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
- Nuevas cotizaciones: un detalle comercial `paquete`/`perfil` cobra el precio global. Los componentes clinicos conservan servicio, medico, consulta y agenda, con precio de venta cero. No se divide el precio del paquete entre servicios.
- El snapshot identifica `paquete_modelo_comercial=importe_unico`, rol `cargo`/`componente` y grupo. La lista del medico cuenta solo los componentes, no el cargo comercial.
- El detalle de cotizacion agrupa por `paquete_grupo` cuando existe y conserva la clave historica en paquetes antiguos. El desglose y el contador incluyen solo servicios clinicos; el cargo comercial aporta al total pero no aparece como un tercer servicio "Otros". Los tipos comerciales se etiquetan Paquete/Perfil tambien en el ticket.
- Recordatorios y Atenciones excluyen `paquete`/`perfil` de las listas de tipos clinicos. Recordatorios tambien excluye el cargo y los detalles eliminados del desglose; el paquete mantiene su identificacion comercial en Atenciones, sin contarse como servicio adicional.
- El boton Cobrar del detalle consolidado envia todos los `grupo_ids` mediante `?ids=` al cobro unificado. No consulta la sugerencia de agrupacion usando solo la base: esta puede estar pagada mientras una adenda mantiene saldo. El detalle individual conserva su flujo de sugerencia existente.
- La pantalla de cobro conserva las cotizaciones pagadas del episodio solo como referencia, desmarcadas y deshabilitadas. Selecciona unicamente cotizaciones con saldo cobrable; el payload toma sus IDs de los detalles realmente imputados, no de todas las cotizaciones del episodio. Se mantiene el rechazo backend de cotizaciones pagadas para proteger contra cambios concurrentes.
- El cotizador de procedimientos respeta `modo=adenda`: envia solo la seleccion nueva, sin intentar editar primero la base pagada. El fallback desde edicion tambien envia solo procedimientos seleccionados. Si otro cotizador reenvia el paquete mediante merge, la deduplicacion reconoce componentes con el mismo ID persistido y grupo, sin volver a cobrarlos ni ajustar sus honorarios. Otro grupo sigue sujeto a la proteccion contra doble cobro.
- Honorario fijo: importe configurado por unidad; porcentaje: sobre el precio referencial del componente; configuracion normal: honorario del tarifario. El precio referencial no se cobra al paciente.
- Ejemplo: venta S/ 140; consulta S/ 40 al medico; ecografia S/ 40 al medico; clinica S/ 60. Mismo medico: dos conceptos que suman S/ 80; medicos distintos: S/ 40 para cada uno.
- El remanente se contabiliza una sola vez junto al ultimo componente medico, por compatibilidad con los movimientos existentes; no representa un precio de venta de ese servicio. Un paquete sin componentes medicos deja su ingreso integro en caja, sin generar honorarios medicos.
- Descuentos: reducen el cargo y el remanente de clinica, no los honorarios fijos. El snapshot conserva el remanente neto para posteriores abonos; se rechaza un descuento superior al remanente disponible.
- La atencion solidaria conserva la renuncia explicita de honorarios y el descuento total, sin reactivar los honorarios del snapshot.
- Conversion desde servicio individual: conserva el importe previo, reconoce ese cargo y agrega solo la diferencia. No crea devoluciones por prorrateo. Una cantidad incompatible, un servicio de otro paquete o una liquidacion anterior incompatible requiere reconciliacion explicita.
- Los componentes recuperados para honorarios no generan nuevos abonos del servicio origen. Se conserva la identidad del honorario para evitar duplicarlo al cobrar parcialmente.
- Se bloquea eliminar, devolver o cambiar cantidad de un cargo/componente aislado. La cotizacion que contiene el paquete completo conserva la anulacion global existente. Si una conversion distribuye el grupo entre varias cotizaciones, la anulacion individual tambien se bloquea: exige anulacion conjunta y conciliacion explicitamente gestionada, no una devolucion automatica parcial.
- Laboratorio derivado por porcentaje usa la referencia del componente, no su precio de venta cero.
- No requiere migracion de schema ni banderas de BD. No corrige automaticamente cotizaciones historicas prorrateadas ni sus devoluciones/saldos: requieren conciliacion separada.
- Regresion sin BD: `php scripts\verificar_paquete_importe_unico.php`. Catalogo local de referencia, solo lectura: agregar `--catalogo=7`.
- El workflow de Hostinger ejecuta la regresion sin BD con PHP 8.3 y mysqli antes del build y de publicar. Un fallo bloquea el deploy. El script se versiona en Git, pero `scripts/` sigue excluido de la sincronizacion al servidor.
- Antes del despliegue: validar en una instancia de pruebas cotizacion/cobro completos, abonos, descuento, anulacion, agenda/HC y liquidacion con uno y con dos medicos. La prueba pura y la lectura de catalogo no reemplazan una transaccion completa.

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
