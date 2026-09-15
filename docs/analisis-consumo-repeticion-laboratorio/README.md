# Analisis funcional - consumo por repeticion tecnica en laboratorio

## Estado actual aprobado
Este proyecto seguira trabajando por ahora con la logica actual.
No se implementara aun el control estricto de repeticiones tecnicas.

## Contexto operativo real observado
En pruebas como glucosa, el laboratorista puede ejecutar mas de una corrida tecnica antes de registrar el resultado final.
Ejemplo comun:
1. Primera corrida: resultado elevado.
2. Segunda corrida de confirmacion.
3. Se registra en sistema solo el resultado final confirmado.

## Como funciona hoy el descuento de inventario
El descuento de inventario interno se activa al guardar resultados con contenido, no al pagar una cotizacion.

Flujo resumido actual:
1. Panel laboratorio envia guardado de resultados.
2. Backend persiste resultado de la orden.
3. Si hay contenido valido, se ejecuta consumo automatico por receta del examen.
4. Se inserta consumo en inventario_consumos_examen con origen_evento = resultado.

## Limitacion actual
El sistema no conoce cuantas corridas tecnicas internas se hicieron antes del resultado final.
Por lo tanto, una repeticion de confirmacion puede no reflejarse en el consumo si no existe un dato explicito de corridas.

## Decision funcional actual
Se mantiene el comportamiento actual para no cambiar el flujo operativo inmediato.

## Propuesta para futura fase estricta (pendiente)
Objetivo: alinear consumo de reactivos con corridas tecnicas reales.

Opciones propuestas (de menor a mayor trazabilidad):
1. Contador manual de corridas por examen (default 1).
2. Boton de repeticion tecnica con motivo opcional.
3. Registro detallado por corrida (valor corrida 1, corrida 2, corrida final).

## Requisitos sugeridos para implementar despues
1. Campo corridas_tecnicas por examen en el formulario de resultados.
2. Multiplicar consumo de receta por corridas_tecnicas al aplicar consumo.
3. Mantener anti-duplicado por orden/examen/item para evitar doble descuento accidental en re-edicion.
4. Guardar motivo de repeticion (opcional) para auditoria.
5. Reporte de diferencias entre consumo teorico (1 corrida) y consumo tecnico real (N corridas).

## Criterios de aceptacion futuros
1. Si corridas_tecnicas = 2 en glucosa, consumo descontado = receta * 2.
2. Re-editar resultado sin cambiar corridas no debe duplicar consumo.
3. Cambiar corridas (ejemplo de 1 a 2) debe ajustar solo la diferencia.
4. KPI y reporte deben reflejar el consumo real ajustado.

## Nota de implementacion
Antes de activar modo estricto, validar impacto con laboratorio y caja para evitar cambios de interpretacion en costos y metricas historicas.
