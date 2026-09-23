# Fase 1 - Laboratorio y Rayos X

## Objetivo
Completar la programacion de Laboratorio y Rayos X sin mezclar reglas con otros servicios mas complejos.

## Alcance
Esta fase cubre:
- Laboratorio
- Rayos X

No cubre en esta fase:
- Procedimientos
- Paquetes/Perfiles
- Operaciones/Cirugias

## Regla Base
Para ambos servicios se debe resolver siempre:
1. Si el servicio requiere pago previo.
2. Si el servicio requiere fecha y hora programada.
3. Si el recordatorio debe mostrar saldo pendiente o servicio pagado.
4. Si el ticket debe reflejar el servicio y su programacion.

## Laboratorio

### UI
- Agregar seleccion de fecha y hora por examen o por item programado.
- Si el examen se agrega desde una cotizacion ya existente, conservar la programacion cargada.
- Mostrar claramente el examen y su fecha/hora en el resumen.

### Backend
- Guardar la fecha y hora en el detalle de cotizacion.
- Relacionar cada detalle con agenda_servicios_cotizacion.
- Mantener el estado de pago en la cotizacion.
- Si el examen ya esta cobrado o cubierto, respetar el saldo correspondiente.

### Ticket
- Mostrar tipo de servicio: Laboratorio.
- Mostrar descripcion del examen.
- Mostrar fecha y hora programada si existe.
- Mostrar estado de pago o saldo pendiente.

### Recordatorios
- Debe aparecer en recordatorios de citas.
- Debe verse como servicio distinto de consulta.
- Debe mostrar si esta pagado o con saldo pendiente.

## Rayos X

### UI
- Agregar seleccion de fecha y hora por estudio o por item.
- Permitir editar la programacion si la cotizacion se reabre.
- Mostrar el estudio junto con su programacion.

### Backend
- Guardar la programacion en agenda_servicios_cotizacion.
- Vincular el detalle con la cotizacion principal.
- Mantener saldo pendiente o estado pagado.

### Ticket
- Mostrar tipo de servicio: Rayos X.
- Mostrar estudio programado.
- Mostrar fecha y hora.
- Mostrar estado de pago o saldo pendiente.

### Recordatorios
- Debe entrar a la vista de recordatorios como servicio programable.
- Debe distinguirse de consulta y de otros recordatorios de cobro.

## Entregables de la Fase 1
1. Programacion capturada en UI.
2. Persistencia en backend.
3. Ticket con fecha/hora y tipo de servicio.
4. Recordatorios con servicio y estado de pago visibles.
5. Pruebas de flujo completo para laboratorio y rayos X.

## Orden de Implementacion
1. Verificar estructuras y campos necesarios.
2. Habilitar captura de fecha/hora en UI.
3. Guardar programacion en backend.
4. Exponer en recordatorios.
5. Ajustar tickets.
6. Validar flujo completo.

## Riesgos a Vigilar
- Duplicar el servicio entre columna de tipo y columna de pago en recordatorios.
- Perder la programacion al editar cotizacion.
- Mezclar examenes con consultas dentro del mismo badge operativo.
- No respetar el saldo pendiente cuando el examen ya fue parcialmente cobrado.

## Criterio de Aceptacion
La fase queda lista cuando el usuario puede:
- cotizar un laboratorio o rayos X,
- programarlo con fecha/hora,
- verlo en recordatorios,
- y leer en el ticket si esta pagado o con saldo pendiente.
