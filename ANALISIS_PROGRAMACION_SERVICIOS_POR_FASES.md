# Analisis de Programacion de Servicios por Fases

## Objetivo
Definir una ejecucion segura y ordenada para completar la programacion de citas en servicios que aun no estan unificados bajo una misma logica operativa.

## Principio General
No todos los servicios deben tratarse igual. La programacion debe depender de tres preguntas:
1. Si requiere pago previo.
2. Si requiere fecha y hora programada.
3. Si genera agenda por item, por cotizacion o por evento compuesto.

## Matriz de Reglas Propuesta

| Servicio | Pago previo | Fecha/hora | Agenda | Recordatorio | Ticket | Granularidad |
|---|---:|---:|---:|---:|---:|---|
| Laboratorio | Si, segun contrato o particular | Si | Si | Si | Si | Por examen |
| Rayos X | Si, normalmente | Si | Si | Si | Si | Por estudio |
| Procedimientos | Depende del procedimiento | Si | Si | Si | Si | Por procedimiento |
| Paquetes/Perfiles | Depende del contenido | Si | Si | Si | Si | Por componente |
| Operaciones/Cirugias | Generalmente agenda primero | Si | Si | Si | Si | Por evento / paquete quirurgico |

## Fases de Ejecucion

### Fase 1: Definir reglas por servicio
- Confirmar si cada servicio requiere pago previo o agenda primero.
- Confirmar si la programacion se guarda a nivel de detalle o de evento compuesto.
- Confirmar si el recordatorio debe mostrarse como cita, falta cancelar o ambos.

### Fase 2: Unificar la programacion
- Reutilizar una sola estructura de agenda para servicios programables.
- Guardar fecha y hora por detalle o por componente cuando aplique.
- Mantener compatibilidad con el flujo actual de consultas.

### Fase 3: Completar por servicio
Orden recomendado:
1. Laboratorio
2. Rayos X
3. Procedimientos
4. Paquetes/Perfiles
5. Operaciones

### Fase 4: Recordatorios y cobro
- Mostrar tipo de servicio.
- Mostrar estado de pago.
- Mostrar fecha y hora programada.
- Mostrar origen correcto del registro.

### Fase 5: Validacion final
- Cotizar.
- Programar.
- Cobrar o dejar pendiente.
- Revisar recordatorio.
- Imprimir ticket.

## Criterio de Estandarizacion
La vista operativa debe permitir responder rapido:
- Que servicio es.
- Si esta pagado o tiene saldo pendiente.
- Cuando se debe atender.
- Si ya tiene agenda creada.

## Siguiente Paso Recomendado
Antes de tocar codigo, cerrar una mini-matriz tecnica por cada pagina:
- SeleccionarServicioPage
- CotizarLaboratorioPage
- CotizarRayosXPage
- CotizarProcedimientosPage
- CotizarPaquetesPerfilesPage
- CotizarOperacionPage

Cada pagina deberia responder:
- Donde se captura la fecha/hora.
- Que se guarda en backend.
- Que se imprime en ticket.
- Como aparece en recordatorios.
